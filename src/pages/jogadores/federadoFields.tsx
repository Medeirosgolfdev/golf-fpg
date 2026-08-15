/**
 * src/pages/jogadores/federadoFields.tsx
 *
 * Cadastro FPG — organização dos 32 campos do federados.json em secções,
 * etiquetas, tooltips e renderização de valores em pills (formatFedValue),
 * mais o par label/valor (KV). Usado pelo FederadoOnlyDetail.
 */
import React from "react";
import SexBadge from "../../ui/SexBadge";
import { EscPill } from "../../ui/PillBadge";
import { gf } from "../../utils/flagUtils";

/** Secções visíveis por defeito. Cada uma agrupa campos relacionados. */
export const FEDERADO_SECTIONS: { title: string; fields: string[] }[] = [
  {
    title: "Identificação",
    fields: ["name", "federation_code", "gender", "birthdate", "age_level", "country", "country_prefix"],
  },
  {
    title: "Clube",
    fields: ["club_name", "acronym", "club_code", "clubplayerstatus", "club_notpublic"],
  },
  {
    title: "Handicap",
    fields: ["hcp_index", "hcp_status", "hcp_type", "last_hcp_date", "rounds_current_year"],
  },
  {
    title: "Estado FPG",
    fields: ["federated_status", "player_type", "admission_date", "notpublic"],
  },
];

/** Campos "técnicos" — IDs internos, tokens e redundâncias — escondidos num
 *  <details> colapsado. Não são úteis no dia-a-dia mas podem ser necessários
 *  para debug ou cross-referencing com outros scripts. */
export const FEDERADO_TECHNICAL_FIELDS = [
  "federation_number",    // redundante com federation_code (zeros à esquerda)
  "hcp_exact",            // igual ao hcp_index em 99% dos casos
  "age_level_id", "hcp_status_id", "hcp_type_id", "player_type_id", "federated_status_id",
  "permit", "dt_aniv", "photo", "encryptedfedcode",
];

export const FEDERADO_FIELD_LABELS: Record<string, string> = {
  federation_code: "Nº Federado",
  federation_number: "Nº Federado (7 dígitos)",
  name: "Nome",
  gender: "Sexo",
  birthdate: "Data de nascimento",
  age_level: "Escalão",
  age_level_id: "Escalão (ID)",
  hcp_exact: "HCP Exacto",
  hcp_index: "HCP Index",
  hcp_status: "HCP Status",
  hcp_status_id: "HCP Status (ID)",
  hcp_type: "HCP Tipo",
  hcp_type_id: "HCP Tipo (ID)",
  player_type: "Tipo de jogador",
  player_type_id: "Tipo de jogador (ID)",
  federated_status: "Status federado",
  federated_status_id: "Status federado (ID)",
  acronym: "Clube (acrónimo)",
  club_code: "Clube (código)",
  club_name: "Clube (nome oficial)",
  club_notpublic: "Clube — privacidade",
  clubplayerstatus: "Clube — status jogador",
  country: "País",
  country_prefix: "País (prefixo)",
  admission_date: "Federado desde",
  last_hcp_date: "Última actualização HCP",
  rounds_current_year: "Rondas este ano",
  notpublic: "Perfil público",
  permit: "Permit",
  dt_aniv: "DT Aniv",
  photo: "Fotografia (path)",
  encryptedfedcode: "Token encriptado",
};

/** Tooltips — aparecem via `title=` ao fazer hover no label.
 *  Escrito para um leigo que pode não estar familiarizado com os termos FPG. */
export const FEDERADO_FIELD_DESCRIPTIONS: Record<string, string> = {
  federation_code: "Número único atribuído pela FPG quando o jogador se federa. Usado em toda a federação para identificar o jogador.",
  federation_number: "Mesmo nº federado com zeros à esquerda até 7 dígitos. É só um formato alternativo — sem informação adicional.",
  name: "Nome completo como consta no registo da FPG.",
  gender: "Masculino (M) ou Feminino (F). Determina os escalões competitivos e os tees oficiais a jogar.",
  birthdate: "Data de nascimento. Determina o escalão etário em cada torneio.",
  age_level: "Escalão etário competitivo conforme o regulamento FPG. Sub-10, Sub-12, Sub-14, Sub-16, Sub-18, Sub-21, Absoluto, Sénior, etc.",
  age_level_id: "Código numérico interno do escalão (10=Sub-10, 12=Sub-12, …). Só útil para debug.",
  hcp_exact: "Handicap 'exacto' — terminologia antiga da EGA. Em Portugal desde a migração para o WHS é igual ao HCP Index.",
  hcp_index: "Handicap oficial WHS (World Handicap System). Reflecte a capacidade actual do jogador; quanto mais baixo, melhor. É o valor usado para calcular o Playing Handicap em cada campo.",
  hcp_status: "Estado do handicap: Válido = pode ser usado em competição; Provisório = ainda em formação (menos de 20 cartões entregues); Suspenso = alguma irregularidade.",
  hcp_status_id: "Código numérico do status HCP (10=Válido, etc.). Só útil para debug.",
  hcp_type: "Sistema de handicap: EGA = sistema europeu antigo; WHS = sistema mundial actual (em vigor em Portugal desde 2020).",
  hcp_type_id: "Código numérico do tipo de HCP. Só útil para debug.",
  player_type: "Amador compete por prazer e pode receber prémios em vouchers/géneros; Profissional está inscrito como tal e pode receber prémios monetários.",
  player_type_id: "Código numérico do tipo de jogador (1=Amador, 2=Profissional, etc.). Só útil para debug.",
  federated_status: "Ativo = federação em dia e pode participar em competições; Inativo = quota por regularizar.",
  federated_status_id: "Código numérico do status federado (9=Ativo, 7=Inativo, etc.). Só útil para debug.",
  acronym: "Nome curto do clube onde o jogador está inscrito.",
  club_code: "Código FPG do clube (3 dígitos, ex.: 007 = CGSS Santo da Serra, 004 = Estoril).",
  club_name: "Nome oficial completo do clube de filiação.",
  club_notpublic: "Se Privado, o clube optou por não exibir listas de jogadores publicamente nos rankings FPG.",
  clubplayerstatus: "Status do jogador dentro do próprio clube (0=regular, 1=social, etc.).",
  country: "País de origem ou de federação.",
  country_prefix: "Código ISO de 2 letras do país (PT=Portugal, ES=Espanha, …).",
  admission_date: "Data da primeira inscrição do jogador na FPG.",
  last_hcp_date: "Data do último cartão/ronda que fez mexer o HCP Index.",
  rounds_current_year: "Número de cartões entregues este ano civil. Pode incluir torneios e rondas individuais (EDS).",
  notpublic: "Se Privado, o jogador optou por não aparecer publicamente nas listas/rankings da FPG.",
  permit: "Código interno FPG relacionado com autorizações de jogo (permits internacionais, reciprocidades, etc.).",
  dt_aniv: "Data interna de aniversário de filiação, usada pela FPG para renovações. Quase sempre vazia.",
  photo: "Caminho interno da fotografia do jogador nos servidores da FPG.",
  encryptedfedcode: "Identificador criptografado usado pela FPG para gerar URLs únicos (ex.: scorecard partilháveis). Nunca muda para o mesmo jogador.",
};

/* ────────────────────────────────────────────────────────────────
   formatFedValue — todos os 32 campos do Cadastro FPG renderizados
   com os pills globais (PillBadge.tsx + App.css .p/.p-sm/.p-*).
   Cada valor vira pill apropriado ao tipo de campo.
   ──────────────────────────────────────────────────────────────── */
const STATUS_GOOD_PILL: React.CSSProperties = {
  background: "var(--color-good)", color: "#fff", borderColor: "transparent",
};
const STATUS_WARN_PILL: React.CSSProperties = {
  background: "var(--color-warn)", color: "#fff", borderColor: "transparent",
};
const STATUS_DANGER_PILL: React.CSSProperties = {
  background: "var(--color-danger)", color: "#fff", borderColor: "transparent",
};

export function normalizeAgeLabel(s: string): string {
  // "SUB12" → "Sub-12" · "SUB-14" → "Sub-14" · mantém "Absoluto", "Sénior", etc.
  const m = s.match(/^sub[-\s]?(\d{1,2})$/i);
  return m ? `Sub-${m[1]}` : s;
}

export function formatFedValue(key: string, v: unknown): React.ReactNode {
  // ── Vazios ───────────────────────────────────────────────────
  if (v == null || v === "") return <span className="p p-sm p-muted">—</span>;

  // ── Tokens longos (path/hash) — pill muted com code mono ────
  if (key === "encryptedfedcode" && typeof v === "string") {
    return (
      <span className="p p-sm p-muted" title={v}>
        <code className="fs-10">{v.slice(0, 16)}…</code>
      </span>
    );
  }
  if (key === "photo" && typeof v === "string") {
    return (
      <span className="p p-sm p-muted" title={v}>
        <code className="fs-10">…{v.slice(-18)}</code>
      </span>
    );
  }

  // ── Nome — texto, não pill (demasiado longo) ─────────────────
  if (key === "name") {
    return <span className="fw-700" style={{ fontSize: "var(--fs-13)" }}>{String(v)}</span>;
  }

  // ── Género ───────────────────────────────────────────────────
  if (key === "gender") {
    const sex = String(v).toUpperCase();
    return sex === "M" || sex === "F"
      ? <SexBadge sex={sex as "M" | "F"} size="md" />
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Códigos de federação ─────────────────────────────────────
  if (key === "federation_code" || key === "federation_number") {
    return <span className="p p-sm p-fed">{String(v)}</span>;
  }

  // ── Escalão — pill global (.p-sub10 etc.) via <EscPill /> ───
  if (key === "age_level" && typeof v === "string") {
    return <EscPill esc={normalizeAgeLabel(v)} />;
  }

  // ── Datas → .p-birth ─────────────────────────────────────────
  if (key === "birthdate" || key === "admission_date" || key === "last_hcp_date" || key === "dt_aniv") {
    return <span className="p p-sm p-birth">{String(v)}</span>;
  }

  // ── HCP Exacto / Index → número em destaque (texto, sem pill) ─
  if (key === "hcp_exact" || key === "hcp_index") {
    const n = Number(v);
    const txt = isFinite(n) ? (Number.isInteger(n) ? n.toString() : n.toFixed(1)) : String(v);
    return <span className="fw-700" style={{ fontSize: "var(--fs-13)" }}>{txt}</span>;
  }

  // ── Status de HCP (Válido / Provisório / …) ─────────────────
  if (key === "hcp_status") {
    const s = String(v).toLowerCase();
    const isGood = /v[aá]lid|ativo|activo/.test(s);
    const isWarn = /provis|review|revis/.test(s);
    const style = isGood ? STATUS_GOOD_PILL : isWarn ? STATUS_WARN_PILL : undefined;
    return style
      ? <span className="p p-sm" style={style}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Status federado (Ativo / Inativo) ───────────────────────
  if (key === "federated_status") {
    const s = String(v).toLowerCase();
    const isGood = /ativ/.test(s) && !/inativ/.test(s);
    const isBad = /inativ|suspen/.test(s);
    const style = isGood ? STATUS_GOOD_PILL : isBad ? STATUS_DANGER_PILL : undefined;
    return style
      ? <span className="p p-sm" style={style}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Tipo de HCP (EGA, WHS, …) → outline ─────────────────────
  if (key === "hcp_type") {
    return <span className="p p-sm p-outline">{String(v)}</span>;
  }

  // ── Tipo de jogador (Amador / Profissional) ─────────────────
  if (key === "player_type") {
    const s = String(v).toLowerCase();
    const isPro = /profiss/.test(s);
    return isPro
      ? <span className="p p-sm" style={STATUS_WARN_PILL}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── País (nome extenso) com bandeira ────────────────────────
  if (key === "country") {
    const flag = gf(String(v));
    return (
      <span className="p p-sm p-muted">
        {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
        {String(v)}
      </span>
    );
  }

  // ── País (prefixo ISO) ──────────────────────────────────────
  if (key === "country_prefix") {
    const txt = String(v);
    const flag = gf(txt);
    return (
      <span className="p p-sm p-muted">
        {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
        {txt}
      </span>
    );
  }

  // ── Clube — acrónimo, código, nome ──────────────────────────
  if (key === "acronym" || key === "club_name") {
    return <span className="p p-sm p-club">{String(v)}</span>;
  }
  if (key === "club_code") {
    return <span className="p p-sm p-club">{String(v).padStart(3, "0")}</span>;
  }

  // ── Rondas este ano → número (texto, sem pill) ──────────────
  if (key === "rounds_current_year") {
    const n = Number(v);
    const isZero = isFinite(n) && n === 0;
    return <span className={isZero ? "muted" : "fw-700"} style={{ fontSize: "var(--fs-13)" }}>{isFinite(n) ? n : String(v)}</span>;
  }

  // ── Flags booleanas (notpublic, club_notpublic) ─────────────
  if (key === "notpublic" || key === "club_notpublic") {
    // 1 = privado (warn), 0/null = público (good)
    const truthy = v === true || v === 1 || v === "1";
    return (
      <span className="p p-sm" style={truthy ? STATUS_WARN_PILL : STATUS_GOOD_PILL}>
        {truthy ? "Privado" : "Público"}
      </span>
    );
  }

  // ── IDs numéricos (termina em _id) → muted ──────────────────
  if (key.endsWith("_id")) {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Permit (número) ─────────────────────────────────────────
  if (key === "permit") {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── clubplayerstatus (0/1) ──────────────────────────────────
  if (key === "clubplayerstatus") {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Fallbacks por tipo ──────────────────────────────────────
  if (typeof v === "boolean") {
    return (
      <span className="p p-sm" style={v ? STATUS_GOOD_PILL : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "transparent" }}>
        {v ? "Sim" : "Não"}
      </span>
    );
  }
  if (typeof v === "number") return <span className="p p-sm p-muted">{v}</span>;
  return <span className="p p-sm p-muted">{String(v)}</span>;
}

export function KV({ label, value, description }: { label: string; value: React.ReactNode; description?: string }) {
  const hasDesc = !!description;
  return (
    <div style={{ flex: "0 0 auto", minWidth: 104, maxWidth: 240 }}>
      <div
        className="muted fs-10"
        style={{
          marginBottom: 1,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          cursor: hasDesc ? "help" : "default",
          textDecoration: hasDesc ? "underline dotted var(--text-3)" : "none",
          textUnderlineOffset: "2px",
        }}
        title={description ? `${label} — ${description}` : label}
      >
        {label}{hasDesc && <span aria-hidden style={{ marginLeft: 3, opacity: 0.5 }}>ⓘ</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, lineHeight: 1.25 }}>
        {value}
      </div>
    </div>
  );
}
