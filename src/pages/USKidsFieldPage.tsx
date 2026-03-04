import { useEffect, useState } from "react";

/* ── Tipos ── */
interface Jogador {
  nome: string;
  pais: string;
  cidade: string;
}

interface PaisContagem {
  pais: string;
  n: number;
}

interface Escalao {
  age_group: number;
  nome: string;
  genero: string | null;
  holes: number;
  flight_id: number;
  inscritos: number;
  maximo: number;
  vagas: number;
  pct_cheio: number;
  jogadores: Jogador[] | null;
  paises: PaisContagem[] | null;
}

interface Torneio {
  t: number;
  name: string;
  emoji: string;
  date_inicio: string;
  date_fim: string;
  rondas: number;
  campo: string | null;
  fee_18: string | null;
  total_inscritos: number;
  total_maximo: number;
  escaloes: Escalao[];
  ultima_atualizacao: string;
  erro?: string;
}

interface FieldData {
  gerado_em: string;
  torneios: Torneio[];
}

/* ── Escalões do Manuel e amigos (destacar na UI) ── */
const ESCALOES_DESTAQUE = new Set(["Boys 10", "Boys 11", "Boys 12", "Boys 13", "Boys 13-14"]);
const ESCALAO_MANUEL = "Boys 12";

/* ── Helpers ── */
function badgeVagas(vagas: number, maximo: number) {
  if (maximo === 0) return null;
  if (vagas === 0)  return { bg: "#c62828", cor: "#ffcdd2", label: "FULL" };
  if (vagas <= 1)   return { bg: "#b71c1c", cor: "#ffcdd2", label: `+${vagas}` };
  if (vagas <= 3)   return { bg: "#e65100", cor: "#ffe0b2", label: `+${vagas}` };
  if (vagas <= 6)   return { bg: "#f57f17", cor: "#fff9c4", label: `+${vagas}` };
  return               { bg: "#1b5e20", cor: "#c8e6c9", label: `+${vagas}` };
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FLAG: Record<string, string> = {
  PT: "🇵🇹", GB: "🇬🇧", IE: "🇮🇪", FR: "🇫🇷", ES: "🇪🇸", DE: "🇩🇪",
  IT: "🇮🇹", NL: "🇳🇱", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮",
  US: "🇺🇸", CA: "🇨🇦", AU: "🇦🇺", ZA: "🇿🇦", MX: "🇲🇽", JP: "🇯🇵",
  KR: "🇰🇷", CN: "🇨🇳", IN: "🇮🇳", BR: "🇧🇷", AR: "🇦🇷",
};
const flag = (pais: string) => FLAG[pais] ?? pais;

/* ══════════════════════════════════════════════ */
export default function USKidsFieldPage() {
  const [data, setData]       = useState<FieldData | null>(null);
  const [erro, setErro]       = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/data/uskids-field.json")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setErro(e.message));
  }, []);

  const toggleTorneio = (t: number) =>
    setAbertos(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  /* ── Loading / Erro ── */
  if (erro) return (
    <div style={{ padding: 32, color: "#ef9a9a", fontFamily: "monospace" }}>
      ⚠️ Erro ao carregar dados: {erro}<br />
      <span style={{ color: "#546e7a", fontSize: 13 }}>
        Certifica que corres <code>node scripts/fetch-uskids-field.js</code> primeiro.
      </span>
    </div>
  );
  if (!data) return <div style={{ padding: 32, color: "#78909c" }}>A carregar dados de campo…</div>;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 860, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>⛳</span>
          <h1 style={{ margin: 0, fontSize: 20, color: "#e0e0e0", fontWeight: 700 }}>
            USKids — Campo dos Torneios
          </h1>
        </div>
        <div style={{ color: "#546e7a", fontSize: 12 }}>
          Actualizado em {formatDate(data.gerado_em)}
          <span style={{ marginLeft: 12, color: "#37474f" }}>★ = categoria do Manuel</span>
        </div>
      </div>

      {/* Torneios */}
      {data.torneios.map(t => {
        const isAberto  = abertos.has(t.t);
        const b12       = t.escaloes.find(e => e.nome === ESCALAO_MANUEL);
        const ptTotal   = t.escaloes
          .flatMap(e => e.jogadores ?? [])
          .filter(j => j.pais === "PT");

        return (
          <div key={t.t} style={{
            background: "#0d1f2d",
            border: "1px solid #1e3448",
            borderRadius: 10,
            marginBottom: 14,
            overflow: "hidden",
          }}>

            {/* ── Header clicável ── */}
            <div
              onClick={() => toggleTorneio(t.t)}
              style={{ cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", marginBottom: 3 }}>
                  {t.emoji} {t.name}
                </div>
                <div style={{ fontSize: 12, color: "#546e7a" }}>
                  📅 {t.date_inicio}{t.date_fim && t.date_fim !== t.date_inicio ? ` → ${t.date_fim}` : ""}
                  {t.rondas ? ` · ${t.rondas} rondas` : ""}
                  {t.campo ? ` · ${t.campo}` : ""}
                </div>
                {t.erro && <div style={{ color: "#ef9a9a", fontSize: 12, marginTop: 4 }}>⚠️ {t.erro}</div>}

                {/* Linha de resumo rápido */}
                {!t.erro && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ background: "#1b3a1b", color: "#81c784", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>
                      {t.total_inscritos}/{t.total_maximo} inscritos
                    </span>
                    {b12 && (() => {
                      const badge = badgeVagas(b12.vagas, b12.maximo);
                      return badge ? (
                        <span style={{ background: badge.bg, color: badge.cor, padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                          ★ Boys 12: {b12.inscritos}/{b12.maximo} ({badge.label})
                        </span>
                      ) : null;
                    })()}
                    {ptTotal.length > 0 && (
                      <span style={{ background: "#1a237e", color: "#9fa8da", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>
                        🇵🇹 {ptTotal.map(j => j.nome).join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ color: "#546e7a", fontSize: 18, userSelect: "none", paddingTop: 2 }}>
                {isAberto ? "▲" : "▼"}
              </div>
            </div>

            {/* ── Detalhe expandido ── */}
            {isAberto && !t.erro && (
              <div style={{ borderTop: "1px solid #1e3448", padding: "14px 16px" }}>

                {/* Grelha de todos os escalões */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, marginBottom: 16 }}>
                  {t.escaloes.map(e => {
                    const badge    = badgeVagas(e.vagas, e.maximo);
                    const destaque = ESCALOES_DESTAQUE.has(e.nome);
                    const isManuel = e.nome === ESCALAO_MANUEL;
                    return (
                      <div key={e.age_group} style={{
                        background: isManuel ? "#0d2a4a" : destaque ? "#0d1f35" : "#0a1628",
                        border: `1px solid ${isManuel ? "#1565c0" : destaque ? "#1a3a5c" : "transparent"}`,
                        borderRadius: 6, padding: "7px 10px",
                      }}>
                        {/* Linha topo */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: e.jogadores ? 6 : 0 }}>
                          <span style={{ fontSize: 12, color: isManuel ? "#90caf9" : destaque ? "#78909c" : "#546e7a" }}>
                            {isManuel ? "★ " : ""}{e.nome}
                            <span style={{ color: "#37474f", marginLeft: 4, fontSize: 11 }}>({e.holes}H)</span>
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: "#546e7a" }}>{e.inscritos}/{e.maximo}</span>
                            {badge && (
                              <span style={{ background: badge.bg, color: badge.cor, padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Lista de jogadores (só escalões monitorados) */}
                        {e.jogadores && e.jogadores.length > 0 && (
                          <div style={{ borderTop: "1px solid #111d2e", paddingTop: 5, marginTop: 2 }}>
                            {e.jogadores.map((j, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1px 0", color: j.pais === "PT" ? "#90caf9" : "#78909c" }}>
                                <span>{j.nome}</span>
                                <span title={j.cidade}>{flag(j.pais)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Países (só se não tiver jogadores mas tiver dados) */}
                        {!e.jogadores && e.paises && e.paises.length > 0 && (
                          <div style={{ fontSize: 11, color: "#455a64", marginTop: 4 }}>
                            {e.paises.slice(0, 4).map(p => `${flag(p.pais)}${p.n}`).join(" ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Secção portugueses destaque */}
                {ptTotal.length > 0 && (
                  <div style={{ background: "#1a237e", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ color: "#7986cb", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🇵🇹 Portugueses inscritos</div>
                    {t.escaloes
                      .filter(e => e.jogadores?.some(j => j.pais === "PT"))
                      .map(e => (
                        <div key={e.age_group} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#5c6bc0", fontSize: 11, marginBottom: 2 }}>{e.nome}</div>
                          {e.jogadores!.filter(j => j.pais === "PT").map((j, i) => (
                            <div key={i} style={{ color: "#c5cae9", fontSize: 13, paddingLeft: 8 }}>
                              {j.nome} <span style={{ color: "#546e7a", fontSize: 11 }}>{j.cidade}</span>
                            </div>
                          ))}
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Rodapé */}
                <div style={{ marginTop: 10, color: "#37474f", fontSize: 11, textAlign: "right" }}>
                  Actualizado {formatDate(t.ultima_atualizacao)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ color: "#263238", fontSize: 11, textAlign: "center", marginTop: 8 }}>
        Dados via API signupanytime.com · actualização automática 3×/dia
      </div>
    </div>
  );
}
