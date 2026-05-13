#!/usr/bin/env python3
"""
apply-corrections.py

Aplica as correcções dos overrides directamente aos ficheiros
uskids-member-history-XXX.json (chunks). Usa Python por ser mais robusto
que Node.js a manipular ficheiros grandes (>50MB) no Windows.

Ordem de prioridade:
  1) verify-corrections-overrides.json (FORCA sobre cache, mesmo nomes válidos)
  2) resolved-names-overrides.json (substitui "?" ou vazio)
  3) Cache original do chunk (não toca)

Para cada chunk modificado:
  - Backup automático para .bak antes de escrever
  - Validação: re-parseia o output após escrever
  - Restore automático se a validação falhar

Uso:
  python scripts/apply-corrections.py            (dry-run)
  python scripts/apply-corrections.py --apply    (escreve)
  python scripts/apply-corrections.py --apply --keep-backups
"""

import json
import os
import sys
import shutil
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent.resolve()
ARCHIVE_DIR = ROOT / 'public' / 'data-archive'
RESOLVED = ARCHIVE_DIR / 'resolved-names-overrides.json'
CORRECTIONS = ARCHIVE_DIR / 'verify-corrections-overrides.json'
REPORT = ARCHIVE_DIR / 'apply-corrections-report.json'

APPLY = '--apply' in sys.argv
KEEP_BACKUPS = '--keep-backups' in sys.argv

# ── Carregar overrides ──────────────────────────────────────────────
resolved_overrides = {}
if RESOLVED.exists():
    with open(RESOLVED, 'r', encoding='utf-8') as f:
        d = json.load(f)
    resolved_overrides = d.get('overrides', {})
    print(f"> Resolved overrides:    {len(resolved_overrides)} (substituem '?')")
else:
    print(f"  ! {RESOLVED} não existe — skipped")

corrections_overrides = {}
if CORRECTIONS.exists():
    with open(CORRECTIONS, 'r', encoding='utf-8') as f:
        d = json.load(f)
    corrections_overrides = d.get('corrections', {})
    print(f"> Corrections overrides: {len(corrections_overrides)} (forçam sobre cache)")
else:
    print(f"  ! {CORRECTIONS} não existe — skipped")

if not resolved_overrides and not corrections_overrides:
    print("Nada para aplicar — sai.")
    sys.exit(0)

# ── Listar chunks ───────────────────────────────────────────────────
chunks = sorted(ARCHIVE_DIR.glob('uskids-member-history-???.json'))
if not chunks:
    print(f"ERRO: nenhum chunk uskids-member-history-XXX.json em {ARCHIVE_DIR}")
    sys.exit(1)

print(f"> A processar {len(chunks)} chunks...")
print(f"  Modo: {'APPLY (escreve)' if APPLY else 'DRY-RUN'}")
print()

# ── Processar ───────────────────────────────────────────────────────
def is_unnamed(name):
    return (name is None) or (name == '?') or (not name) or (str(name).strip() == '')

summary = {
    'gerado_em': datetime.utcnow().isoformat() + 'Z',
    'apply': APPLY,
    'total_chunks': len(chunks),
    'chunks_modified': 0,
    'corrections_applied': 0,
    'resolved_applied': 0,
    'corrections_skipped_nofile': 0,
    'resolved_skipped_nofile': 0,
    'validation_failures': [],
    'by_chunk': {},
}

for chunk_path in chunks:
    fname = chunk_path.name
    size_mb = chunk_path.stat().st_size / 1024 / 1024

    with open(chunk_path, 'r', encoding='utf-8') as f:
        d = json.load(f)

    jogadores = d.get('jogadores', {})
    n_correct_here = 0
    n_resolved_here = 0
    dirty = False
    details_here = []

    for mid, player in jogadores.items():
        current_name = player.get('name')
        current_country = player.get('country')

        # 1) corrections (forçar)
        cor = corrections_overrides.get(str(mid))
        if cor and cor.get('name'):
            new_name = cor['name']
            new_country = cor.get('country') or current_country
            if current_name != new_name or (cor.get('country') and current_country != cor['country']):
                if APPLY:
                    player['name'] = new_name
                    if cor.get('country'):
                        player['country'] = new_country
                n_correct_here += 1
                dirty = True
                details_here.append({'mid': mid, 'type': 'correction', 'previous': current_name, 'new': new_name})
            continue

        # 2) resolved (substituir "?")
        if is_unnamed(current_name):
            res = resolved_overrides.get(str(mid))
            if res and res.get('name'):
                new_name = res['name']
                if APPLY:
                    player['name'] = new_name
                    if res.get('country') and not current_country:
                        player['country'] = res['country']
                n_resolved_here += 1
                dirty = True
                details_here.append({'mid': mid, 'type': 'resolved', 'previous': current_name or '(vazio)', 'new': new_name})

    if not dirty:
        print(f"  -- {fname} ({size_mb:.1f} MB) — sem alterações")
        continue

    summary['corrections_applied'] += n_correct_here
    summary['resolved_applied'] += n_resolved_here
    summary['by_chunk'][fname] = {
        'corrections': n_correct_here,
        'resolved': n_resolved_here,
        'samples': details_here[:5],
    }

    if not APPLY:
        print(f"  -> {fname} ({size_mb:.1f} MB): would apply {n_correct_here} corrections + {n_resolved_here} resolved")
        continue

    # ── Backup + write + validate ──
    bak_path = chunk_path.with_suffix('.json.bak')
    shutil.copy2(chunk_path, bak_path)

    try:
        # Escrever para .tmp primeiro, depois mover (atomicidade no Windows)
        tmp_path = chunk_path.with_suffix('.json.tmp')
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)

        # Validar — re-parsear o que escrevemos
        with open(tmp_path, 'r', encoding='utf-8') as f:
            try:
                json.load(f)
            except json.JSONDecodeError as ve:
                raise RuntimeError(f"JSON inválido após escrita: {ve}")

        # Validar tamanho mínimo (deve ser similar ao original, ±5%)
        new_size = tmp_path.stat().st_size
        orig_size = bak_path.stat().st_size
        ratio = new_size / orig_size if orig_size else 1.0
        if ratio < 0.9:
            raise RuntimeError(f"Tamanho suspeito: {new_size} bytes vs {orig_size} original ({ratio:.2%})")

        # Substituir o original
        tmp_path.replace(chunk_path)

        # Eliminar backup se tudo correu bem (a menos que --keep-backups)
        if not KEEP_BACKUPS:
            bak_path.unlink()

        print(f"  OK {fname} ({size_mb:.1f} MB -> {new_size/1024/1024:.1f} MB): {n_correct_here} corrections + {n_resolved_here} resolved")
        summary['chunks_modified'] += 1

    except Exception as e:
        # Restore do backup
        if bak_path.exists():
            shutil.copy2(bak_path, chunk_path)
        if tmp_path.exists():
            tmp_path.unlink()
        summary['validation_failures'].append({'chunk': fname, 'error': str(e)})
        print(f"  ✗ {fname} FALHOU: {e}")
        print(f"    Restored from {bak_path.name}")

# ── Relatório ──
print()
print('=================================================')
print(f"Resumo:")
print(f"  Chunks total:           {summary['total_chunks']}")
print(f"  Chunks modificados:     {summary['chunks_modified']}")
print(f"  Corrections aplicados:  {summary['corrections_applied']}")
print(f"  Resolved aplicados:     {summary['resolved_applied']}")
if summary['validation_failures']:
    print(f"  ✗ FALHAS: {len(summary['validation_failures'])}")
    for vf in summary['validation_failures']:
        print(f"     - {vf['chunk']}: {vf['error']}")
print('=================================================')

with open(REPORT, 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"  -> Relatório: {REPORT}")

if not APPLY:
    print()
    print("DRY-RUN — para aplicar:")
    print("  python scripts/apply-corrections.py --apply")
    print()
    print("  (adicionar --keep-backups para manter ficheiros .bak após sucesso)")
