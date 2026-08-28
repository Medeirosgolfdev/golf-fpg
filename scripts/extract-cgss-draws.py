#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrai draws COMPLETOS (todos os grupos) dos PDFs CGSS -> cgss-draws-manual.json.
Manuel jr = fed 52884 (nome "Goulartt Medeiros"); homonimo "Manuel Medeiros" = fed 54907."""
import os, re, json, subprocess, unicodedata, glob, argparse
from datetime import date

MANUEL_FED = "52884"
HUSBAND_FED = "54907"
TEE_COLORS = {"brancas", "amarelas", "vermelhas", "douradas", "azuis", "azues", "pretas"}
TIME_RE = re.compile(r"^\s*(\d{1,2}:\d{2})\s+(\d{1,2})(?:\s+([A-Za-z])(?=\s))?")


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def pdftext(path):
    # Preferir pdftotext -layout (poppler). Se não estiver instalado (típico em
    # Windows sem poppler), cair para pdfplumber (pip install pdfplumber), que
    # também preserva o layout em colunas via espaços.
    try:
        return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout
    except FileNotFoundError:
        # Fallback sem poppler: pdfplumber. Estes draws DataGolf têm DUAS colunas
        # (metade esquerda + metade direita). Recortamos a página nas duas metades
        # e usamos extract_text() NATIVO em cada uma — extract_text preserva os
        # espaços reais do PDF (ao contrário de uma reconstrução manual, que colava
        # nomes e baralhava colunas). O ponto de corte é o x da 2ª ocorrência de
        # "Saída" (início da coluna direita); se só houver uma, trata a página como
        # coluna única.
        import pdfplumber
        out = []
        with pdfplumber.open(path) as pdf:
            for pg in pdf.pages:
                try:
                    saidas = sorted(w["x0"] for w in pg.extract_words() if w.get("text") == "Saída")
                except Exception:
                    saidas = []
                if len(saidas) >= 2:
                    mid = saidas[1] - 5
                    out.append(pg.crop((0, 0, mid, pg.height)).extract_text() or "")
                    out.append(pg.crop((mid, 0, pg.width, pg.height)).extract_text() or "")
                else:
                    out.append(pg.extract_text() or "")
        return "\n".join(out)


def load_results_index(data_dir):
    idx = []
    # Inclui TODAS as fontes de resultados no formato "fpg-pull" (não só
    # pull-torneios): os torneios sociais do CGSS que o Manuel NÃO jogou vivem
    # tipicamente em drive-data*/clubes*/jovens*, não em pull-torneios. Sem isto
    # o match falhava e o torneio caía em drawOnly com chave sintética.
    patterns = ["pull-torneios*.json", "drive-data-*.json", "aquapor-data-*.json",
                "clubes*.json", "jovens*.json"]
    files = []
    for pat in patterns:
        files += glob.glob(os.path.join(data_dir, pat))
    for fn in sorted(set(files)):
        try:
            d = json.load(open(fn, encoding="utf-8"))
        except Exception:
            continue
        for t in d.get("tournaments", []):
            players = {}
            for p in t.get("players", []):
                nm = norm(p.get("name", ""))
                if nm and nm not in players:
                    players[nm] = {"fed": str(p.get("fedCode")) if p.get("fedCode") else None,
                                   "club": p.get("club"), "name": p.get("name"), "hcp": p.get("hcpExact")}
            idx.append({"name": t.get("name", ""), "date": t.get("date", ""),
                        "ccode": str(t.get("ccode")), "tcode": str(t.get("tcode")),
                        "players": players, "src": os.path.basename(fn)})
    return idx


def parse_header(txt):
    def grab(label):
        m = re.search(label + r"\s*:?\s*(.+)", txt)
        return m.group(1).strip() if m else None
    name = grab(r"Torneio")
    if name:
        # Cortar rótulos do cabeçalho colados ao nome. Com pdftotext -layout vêm
        # separados por 2+ espaços; com o fallback pdfplumber (extract_text) os
        # espaços colapsam, por isso também cortamos com 1 espaço antes de
        # "Data:" / "Nº.Jog" / "Modal." (ex.: "...Summer 2025 Data:2025-08-16").
        name = re.split(r"\s{2,}(?:Data|N[ºo])|\s+Data\s*:|\s+N[ºo]\.?\s*Jog|\s+Modal\.", name)[0].strip()
    dt = None
    m = re.search(r"Data\s*:?\s*(\d{4}-\d{2}-\d{2})", txt)
    if m:
        dt = m.group(1)
    campo = grab(r"Campo")
    if campo:
        campo = re.split(r"\s{2,}(?:N[ºo]|Modal|HCP)|\s+HCP\s*:", campo)[0].strip()
    modal = grab(r"Modal\.")
    if modal:
        modal = re.split(r"\s{2,}HCP", modal)[0].strip()
    return {"name": name, "date": dt, "campo": campo, "modal": modal}


def best_result_match(header, results):
    cands = [r for r in results if r["ccode"] == "007"]
    hdate = header["date"]
    ta = set(w for w in re.findall(r"\w+", norm(header["name"])) if len(w) > 3 and not w.isdigit())
    best, bestscore = None, -1
    for r in cands:
        dscore = -999
        if hdate and r["date"]:
            try:
                dd = abs((date.fromisoformat(hdate) - date.fromisoformat(r["date"])).days)
                dscore = 100 if dd == 0 else 60 if dd <= 3 else 10 if dd <= 10 else -200
            except Exception:
                dscore = 0
        tb = set(w for w in re.findall(r"\w+", norm(r["name"])) if len(w) > 3 and not w.isdigit())
        inter = len(ta & tb)
        if inter < 1 or dscore < 0:
            continue
        nscore = 40 * inter / max(1, len(ta | tb)) if (ta and tb) else 0
        score = dscore + nscore
        if score > bestscore:
            bestscore, best = score, r
    return best if bestscore >= 50 else None


def resolve_fed(name, rmatch):
    if not rmatch:
        return None, None, None
    rec = rmatch["players"].get(norm(name))
    return (rec["fed"], rec["name"], rec["club"]) if rec else (None, None, None)


def detect_columns(txt):
    for ln in txt.splitlines():
        cols = [m.start() for m in re.finditer(r"Sa[íi]da\s+Tee", ln)]
        if len(cols) >= 2:
            return [(c, (cols[i + 1] if i + 1 < len(cols) else 10000)) for i, c in enumerate(cols)]
    return [(0, 10000)]


def parse_player_line(seg):
    s = seg.rstrip()
    if not s.strip():
        return None
    low = s.strip().lower()
    if low.startswith(("saida", "saída", "torneio", "campo", "modal", "clube de golf", "nota", "draw", "hcp:", "nº", "no.", "jogador")):
        return None
    if "datagolf" in low or "pág" in low or "pag." in low:
        return None
    tokens = s.strip()
    tee = None
    parts = tokens.split()
    if parts and parts[0].lower() in TEE_COLORS:
        tee = parts[0]
        sp = tokens.split(None, 1)
        tokens = sp[1] if len(sp) > 1 else ""
    mpair = re.match(r"^(.+?/.+?)\s+([+-]?\d+)\s*$", tokens)
    if mpair and "/" in mpair.group(1):
        return {"raw": mpair.group(1).strip(), "tee": tee, "is_pair": True, "jogo": int(mpair.group(2))}
    m = re.match(r"^(.+?)\s{2,}([A-Za-zÇç].+?)\s+(\d{1,2},\d)\s+([+-]?\d+)\s*$", tokens)
    if m:
        return {"name": m.group(1).strip(), "club": m.group(2).strip(), "hcp": float(m.group(3).replace(",", ".")), "tee": tee, "jogo": int(m.group(4))}
    m = re.match(r"^(.+?)\s+(\d{1,2},\d)\s+([+-]?\d+)\s*$", tokens)
    if m:
        return {"name": m.group(1).strip(), "club": None, "hcp": float(m.group(2).replace(",", ".")), "tee": tee, "jogo": int(m.group(3))}
    m = re.match(r"^(.+?)\s{2,}([A-Za-zÇç].+?)\s+([+-]?\d+)\s*$", tokens)
    if m:
        return {"name": m.group(1).strip(), "club": m.group(2).strip(), "hcp": None, "tee": tee, "jogo": int(m.group(3))}
    m = re.match(r"^(.+?)\s+([+-]?\d+)\s*$", tokens)
    if m and len(m.group(1).strip()) > 2:
        return {"name": m.group(1).strip(), "club": None, "hcp": None, "tee": tee, "jogo": int(m.group(2))}
    return None


def extract_all_groups(txt):
    """Devolve TODOS os grupos do draw (todas as colunas), por ordem, dedup."""
    all_groups, seen = [], set()
    for (cs, ce) in detect_columns(txt):
        cur = None
        for ln in txt.splitlines():
            seg = ln[cs:ce]
            if not seg.strip():
                continue
            mt = TIME_RE.match(seg)
            if mt:
                cur = {"time": mt.group(1), "hole": int(mt.group(2)), "letter": mt.group(3), "players": []}
                p = parse_player_line(seg[mt.end():])
                if p:
                    cur["players"].append(p)
                # chave de dedup: hora+buraco+1º jogador
                key = None
                all_groups.append(cur)
            elif cur is not None:
                p = parse_player_line(seg)
                if p:
                    cur["players"].append(p)
    # dedup por (time, hole, nomes)
    out = []
    for g in all_groups:
        if not g["players"]:
            continue
        names = tuple(norm(p.get("name", "") + p.get("raw", "")) for p in g["players"])
        key = (g["time"], g["hole"], names)
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out


def _add_individual(out, name, club_pdf, hcp, tee, rmatch):
    nn = norm(name)
    is_m = "goulartt" in nn
    fed, cn, club = resolve_fed(name, rmatch)
    if is_m:
        fed = MANUEL_FED
        cn = cn or "Manuel Goulartt Medeiros"
    elif nn == "manuel medeiros":
        fed = HUSBAND_FED  # homonimo (marido) — fixa a licenca para nunca colidir
    pull_club = club if (club and "&" not in club and "/" not in club) else None
    clube = club_pdf or pull_club or "Santo da Serra"
    out.append({"nome": (cn or name).strip(), "clube": clube, "fed": fed,
                "hcp": hcp, "tee": tee, "_isM": is_m})


def build_players(group, rmatch):
    out = []
    for p in group["players"]:
        if p.get("is_pair"):
            for member in [x.strip() for x in p["raw"].split("/") if x.strip()]:
                _add_individual(out, member, None, None, p.get("tee"), rmatch)
        else:
            _add_individual(out, p["name"], p.get("club"), p.get("hcp"), p.get("tee"), rmatch)
    out.sort(key=lambda x: 0 if x.get("_isM") else 1)
    for x in out:
        x.pop("_isM", None)
        if x.get("tee") is None:
            x.pop("tee", None)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", help="pasta com PDFs a processar (todos os *.pdf)")
    ap.add_argument("--pdf", help="processar APENAS este PDF (merge aditivo)")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--print-only", action="store_true")
    args = ap.parse_args()

    if not args.pdf and not args.pdf_dir:
        ap.error("indica --pdf <ficheiro> ou --pdf-dir <pasta>")

    pdf_list = [args.pdf] if args.pdf else sorted(glob.glob(os.path.join(args.pdf_dir, "*.pdf")))

    results = load_results_index(args.data_dir)
    tournaments, seen = [], set()
    for pdf in pdf_list:
        txt = pdftext(pdf)
        # Antes saltava PDFs sem "goulartt" (só processava torneios do Manuel).
        # Agora processa TODOS os draws CGSS (mesmo os que o Manuel não jogou) —
        # a detecção do Manuel por jogador continua via `is_m` em _add_individual.
        # PDFs que não sejam draws (ex.: regulamentos) não têm linhas hora/buraco
        # → groups vazio → ignorados mais abaixo.
        h = parse_header(txt)
        rm = best_result_match(h, results)
        groups = extract_all_groups(txt)
        base = os.path.basename(pdf)
        if rm:
            ccode, tcode = rm["ccode"], rm["tcode"]
        else:
            ccode, tcode = "007", "cgss-" + re.sub(r"[^a-z0-9]+", "", norm(h["name"]))[:24]
        key = ccode + "-" + tcode
        if key in seen:
            print("  (dup) " + base + " -> " + key)
            continue
        out_groups = []
        total = 0
        manuel_grp = None
        for g in groups:
            players = build_players(g, rm)
            if not players:
                continue
            total += len(players)
            if any(pl.get("fed") == MANUEL_FED for pl in players):
                manuel_grp = g["time"]
            out_groups.append({"teeTime": g["time"], "startHole": g["hole"], "tee": None, "players": players})
        if not out_groups:
            print("  (sem grupos — não é draw, ignorado) " + base)
            continue
        print("\n" + "=" * 68 + "\n" + base + "\n  " + str(h["name"]) + " | " + str(h["date"]))
        print("  -> " + ("c" + ccode + " t" + tcode if rm else "DRAW-ONLY " + key) +
              " | %d grupos, %d jog. | Manuel @ %s" % (len(out_groups), total, manuel_grp))
        seen.add(key)
        tournaments.append({"ccode": ccode, "tcode": tcode, "name": h["name"], "date": h["date"],
                            "campo": h["campo"], "modal": h["modal"], "source": base, "drawOnly": rm is None,
                            "draws": {"1": {"totalJogadores": total, "groups": out_groups}}})
    out = {"_doc": "Draws COMPLETOS curados CGSS (Santo da Serra) de PDFs oficiais — inclui torneios que o Manuel NAO jogou. Preenchem draws vazios ccode-007 (nome/data do PDF autoritativos). Match contra pull-torneios/drive-data/clubes/jovens. Manuel jr fed 52884; homonimo Manuel Medeiros fed 54907.",
           "gerado_em": date.today().isoformat(), "source": "extract-cgss-draws.py", "total": len(tournaments), "tournaments": tournaments}
    if not args.print_only:
        # Merge ADITIVO com o --out existente: o extractor deriva os torneios só
        # dos PDFs na --pdf-dir, por isso correr com uma pasta só de PDFs novos
        # apagaria os draws já curados. Preservamos os existentes e fazemos
        # upsert (por ccode-tcode) dos deste run.
        existing = []
        if os.path.exists(args.out):
            try:
                existing = (json.load(open(args.out, encoding="utf-8")) or {}).get("tournaments", [])
            except Exception:
                existing = []
        by_key = {}
        for t in existing:
            by_key[str(t.get("ccode")) + "-" + str(t.get("tcode"))] = t
        n_new = n_upd = 0
        for t in tournaments:
            k = t["ccode"] + "-" + t["tcode"]
            if k in by_key:
                n_upd += 1
            else:
                n_new += 1
            by_key[k] = t
        # Limpeza do lixo de corridas com parsing mau: entradas sintéticas
        # (tcode "cgss-...", drawOnly) ficam órfãs quando uma corrida posterior
        # passa a casar o mesmo torneio com um tcode REAL. Remove a sintética se
        # existir um tcode numérico para o mesmo (ccode, data). As draw-only
        # legítimas (sem equivalente scrapado, ex. III ABERTO 2025, Diário de
        # Notícias) não têm numérico na mesma data → ficam.
        real_dates = {(t.get("ccode"), t.get("date")) for t in by_key.values() if str(t.get("tcode")).isdigit()}
        n_clean = 0
        for k in list(by_key.keys()):
            t = by_key[k]
            if str(t.get("tcode")).isdigit():
                continue
            nm = str(t.get("name") or "")
            # Remove sintética se (a) já há tcode real na mesma data, ou (b) o nome
            # ficou estragado com o rótulo "Data:" colado (órfão de run antigo).
            if (t.get("ccode"), t.get("date")) in real_dates or re.search(r"\bData\s*:", nm):
                del by_key[k]
                n_clean += 1
        merged = sorted(by_key.values(), key=lambda t: (t.get("date") or ""))
        out["tournaments"] = merged
        out["total"] = len(merged)
        json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\n[ok] %d deste run (%d novos, %d actualizados, %d lixo removido) · %d total -> %s"
              % (len(tournaments), n_new, n_upd, n_clean, len(merged), args.out))
