/**
 * kids2/components/HeroIdentity.tsx
 *
 * Hero da ficha — bandeira grande + nome em destaque + variantes + tier badge
 * + clube principal + cards cross-federação + escalões equivalentes + HCP.
 *
 * Sem qualquer indicador de sexo (sem SexBadge, sem Unicode ♂/♀).
 */

import React from "react";
import type { CanonicalData, Junior } from "../data";
import { computeTier, getTierLabel, getTierColors } from "../data";
import { flag as flagOf } from "../../../utils/flagUtils";
import { MANUEL_DOB } from "../../../constants/manuel";

interface Props {
  data: CanonicalData;
  junior: Junior;
}

export default function HeroIdentity({ data, junior }: Props) {
  const isManuel = data.manuel?.id === junior.id;
  const country = junior.country || junior.nationality || "";
  const flagEmoji = flagOf(country);

  const variants = (junior.aliases || []).filter((a) => a && a !== junior.canonicalName);

  const escUskids = junior.sources.uskids?.ageGroupCurrent;
  const escRfeg = junior.sources.rfeg?.catEdad;
  const escFpgTag = junior.sources.fpg?.tags?.find((t) => /^(PJA|Sub-?\d+)/i.test(t));

  const ageInfo = junior.dob ? computeAge(junior.dob) : null;
  const ageDiff = !isManuel && junior.dob ? compareAgeToManuel(junior.dob) : null;

  const tier = !isManuel ? computeTier(junior, data.tournamentById) : null;

  const mainClub = junior.sources.fpg?.club || junior.sources.rfeg?.club || junior.sources.ffgolf?.club || junior.club || null;
  const mainClubSource = junior.sources.fpg?.club ? "FPG" : junior.sources.rfeg?.club ? "RFEG" : junior.sources.ffgolf?.club ? "FFG" : null;

  const hcps: { source: string; value: number | undefined; date?: string }[] = [];
  if (junior.sources.fpg?.hcpExact != null) hcps.push({ source: "FPG", value: junior.sources.fpg.hcpExact, date: junior.sources.fpg.hcpDate });
  if (junior.sources.rfeg?.hcp != null) hcps.push({ source: "RFEG", value: junior.sources.rfeg.hcp });
  if (junior.sources.ffgolf?.hcp != null) hcps.push({ source: "FFG", value: junior.sources.ffgolf.hcp });

  const ajga = (junior.meta as any)?.ajgaRank ?? (junior.computed as any)?.ajgaRank;
  const wagr = (junior.meta as any)?.wagrRank ?? (junior.computed as any)?.wagrRank;
  const eowagr = (junior.meta as any)?.eowagrRank ?? (junior.computed as any)?.eowagrRank;

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "var(--bg-muted)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, flexShrink: 0,
        }}>{flagEmoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.15,
              letterSpacing: -0.5,
            }}>{junior.canonicalName}</h2>
            {isManuel && (
              <span style={{
                background: "var(--bg-success-subtle)",
                color: "var(--color-good-dark)",
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}>
                ★ Tu (referência)
              </span>
            )}
            {tier && (() => {
              const c = getTierColors(tier);
              return (
                <span style={{
                  background: c.bg,
                  color: c.fg,
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  border: `1px solid ${c.fg}`,
                  letterSpacing: 0.2,
                }}>
                  {tier === "elite" ? "★ " : tier === "strong" ? "⚔️ " : ""}{getTierLabel(tier)}
                </span>
              );
            })()}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
            <span>📍 {country || "—"}</span>
            {junior.region && <><span style={{ opacity: 0.4 }}>·</span><span>{junior.region}</span></>}
            {junior.dob && ageInfo && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>🎂 {fmtDobPt(junior.dob)}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ fontWeight: 600 }}>{ageInfo.label}</span>
              </>
            )}
            {ageDiff && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--bg-muted)",
                  color: "var(--text-2)",
                  fontWeight: 600,
                }}>
                  {ageDiff}
                </span>
              </>
            )}
          </div>

          {mainClub && (
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 13,
                padding: "5px 11px",
                borderRadius: 6,
                background: "var(--bg-muted)",
                color: "var(--text)",
                fontWeight: 600,
                border: "1px solid var(--border-light)",
              }}>
                🏌️ {mainClub}
                {mainClubSource && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>
                    · {mainClubSource}
                  </span>
                )}
              </span>
            </div>
          )}

          {variants.length > 0 && (
            <div style={{
              marginTop: 10,
              padding: "6px 10px",
              background: "var(--bg-muted)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text-2)",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 6 }}>
                Também conhecido como
              </span>
              {variants.map((v, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>}
                  <span style={{ fontStyle: "italic", color: "var(--text)" }}>{v}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {(ajga || wagr || eowagr) && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ajga && <RankPill label="AJGA" value={ajga} />}
              {wagr && <RankPill label="WAGR" value={wagr} />}
              {eowagr && <RankPill label="EOWAGR" value={eowagr} />}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        marginTop: 16,
      }}>
        <FedCard
          label="USKIDS"
          value={junior.sources.uskids?.memberId ? `#${junior.sources.uskids.memberId}` : null}
          subtitle={junior.sources.uskids?.ageGroupCurrent}
          historical={junior.sources.uskids?.historicalMemberIds}
          historicalLabel={(h: any) => `legacy #${typeof h === "string" ? h : h.memberId}`}
        />
        <FedCard
          label="FPG"
          value={junior.sources.fpg?.fed ? `#${junior.sources.fpg.fed}` : null}
          subtitle={junior.sources.fpg?.club}
          historical={junior.sources.fpg?.historicalFeds}
          historicalLabel={(h: any) => `antigo #${typeof h === "string" ? h : h.fed}`}
        />
        <FedCard
          label="RFEG"
          value={junior.sources.rfeg?.lic}
          subtitle={[junior.sources.rfeg?.club, junior.sources.rfeg?.catEdad].filter(Boolean).join(" · ")}
          historical={junior.sources.rfeg?.historicalLicenses}
          historicalLabel={(h: any) => `antiga ${typeof h === "string" ? h : h.lic}${typeof h === "object" && h.club ? " (" + h.club + ")" : ""}`}
        />
        <FedCard
          label="FFG"
          value={junior.sources.ffgolf?.lic}
          subtitle={[junior.sources.ffgolf?.club, junior.sources.ffgolf?.region].filter(Boolean).join(" · ")}
        />
      </div>

      {(escUskids || escRfeg || escFpgTag || hcps.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {escUskids && <EscPill label={`${escUskids} · USKids`} />}
          {escRfeg && <EscPill label={`${escRfeg} · RFEG`} />}
          {escFpgTag && <EscPill label={`${escFpgTag} · FPG`} />}
          {hcps.map((h, i) => (
            <span key={i} style={{
              background: "var(--bg-muted)",
              fontSize: 11, padding: "3px 9px", borderRadius: 999,
              fontWeight: 600, color: "var(--text-2)",
              border: "1px solid var(--border-light)",
            }}>
              🎯 HCP {h.value?.toFixed(1)} <span style={{ color: "var(--text-3)", marginLeft: 3 }}>· {h.source}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FedCard({ label, value, subtitle, historical, historicalLabel }: {
  label: string;
  value: string | null | undefined;
  subtitle?: string | null;
  historical?: Array<any>;
  historicalLabel?: (h: any) => string;
}) {
  const empty = !value;
  return (
    <div style={{
      background: empty ? "var(--bg-muted)" : "var(--bg)",
      border: empty ? "1px dashed var(--border-light)" : "1px solid var(--border)",
      borderRadius: 8,
      padding: "10px 12px",
      opacity: empty ? 0.65 : 1,
    }}>
      <div style={{
        fontSize: 11,
        color: empty ? "var(--text-3)" : "var(--accent, var(--color-info-dark))",
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: empty ? "var(--text-3)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value || "sem registo"}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      )}
      {historical && historical.length > 0 && historicalLabel && (
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>
          {historical.map((h, i) => (
            <div key={i}>{historicalLabel(h)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function EscPill({ label }: { label: string }) {
  return (
    <span style={{
      background: "var(--bg-info-subtle, #eff6ff)",
      color: "var(--color-info-dark, #1e3a8a)",
      fontSize: 11, padding: "3px 9px", borderRadius: 999,
      fontWeight: 600,
      border: "1px solid var(--color-info-dark, #1e3a8a)",
    }}>{label}</span>
  );
}

function RankPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span style={{
      background: "var(--bg-warn-subtle, #fffbeb)",
      color: "var(--color-warn-dark, #92400e)",
      fontSize: 11, padding: "3px 9px", borderRadius: 6,
      fontWeight: 700,
      border: "1px solid var(--color-warn-dark, #92400e)",
    }}>
      🏆 {label} #{value}
    </span>
  );
}

function computeAge(dobIso: string): { label: string } | null {
  const [y, m, d] = dobIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  const dob = new Date(y, m - 1, d);
  let age = today.getFullYear() - dob.getFullYear();
  const mo = today.getMonth() - dob.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < dob.getDate())) age--;
  const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const daysToNext = Math.ceil((next.getTime() - today.getTime()) / 86400000);
  if (daysToNext <= 7) return { label: `${age} anos · faz ${age + 1} em ${daysToNext}d` };
  return { label: `${age} anos` };
}

function compareAgeToManuel(dobIso: string): string | null {
  const [y, m, d] = dobIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dob = new Date(y, m - 1, d);
  const manuelDob = new Date(MANUEL_DOB.year, MANUEL_DOB.month, MANUEL_DOB.day);
  const diffMs = manuelDob.getTime() - dob.getTime();
  if (diffMs === 0) return "Mesma idade que Manuel";
  const diffDays = Math.abs(diffMs / 86400000);
  const olderThanManuel = diffMs > 0;
  if (diffDays < 31) {
    const days = Math.round(diffDays);
    return `${days}d ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
  }
  if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return `${months} ${months === 1 ? "mês" : "meses"} ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
  }
  const years = diffDays / 365.25;
  const yearsRound = Math.round(years * 10) / 10;
  const isWhole = Math.abs(yearsRound - Math.round(yearsRound)) < 0.05;
  const label = isWhole ? `${Math.round(yearsRound)} ${Math.round(yearsRound) === 1 ? "ano" : "anos"}` : `${yearsRound.toFixed(1)} anos`;
  return `${label} ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
}

function fmtDobPt(dobIso: string): string {
  const [y, m, d] = dobIso.split("-");
  if (!y || !m || !d) return dobIso;
  return `${d}/${m}/${y}`;
}
