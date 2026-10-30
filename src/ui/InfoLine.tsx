/**
 * src/ui/InfoLine.tsx — linha de informação por cima das tabelas de torneio
 * (Resumo — AccumulatedLB — e volta — ScorecardLB). 22/10/2026, pedido da
 * Mariana: «para o texto não ficar todo corrido e se perceber logo que são
 * várias informações».
 *
 *   <InfoGroup> agrupa o que é do mesmo assunto (campo, formato, média, rating),
 *     com «·» leve entre itens e um traço vertical entre grupos;
 *   <InfoItem v l> o NÚMERO a carregado e o rótulo em tom suave
 *     («123 classif.», «Par 144», «Média 184,0 (+40,0)»);
 *   <TeeDistances> a distância por tee, com o quadradinho da cor do tee.
 */
import React from "react";
import { getTeeHex, teeBorder } from "../utils/teeColors";

export function InfoItem({ v, l, pre, title, muted }: {
  /** Valor (a carregado). */
  v?: React.ReactNode;
  /** Rótulo depois do valor («classif.», «m»). */
  l?: React.ReactNode;
  /** Rótulo antes do valor («Par», «Média», «CR»). */
  pre?: React.ReactNode;
  title?: string;
  muted?: boolean;
}) {
  return (
    <span className={`info-it${muted ? " info-it-muted" : ""}`} title={title}>
      {pre != null && <span className="info-l">{pre}</span>}
      {v != null && <b className="info-v">{v}</b>}
      {l != null && <span className="info-l">{l}</span>}
    </span>
  );
}

/** Grupo de itens com «·» entre eles; grupos vazios não aparecem. */
export function InfoGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <span className="info-grp">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="info-sep">·</span>}
          {it}
        </React.Fragment>
      ))}
    </span>
  );
}

/** Quadradinho da cor do tee. */
export function TeeSwatch({ tee }: { tee: string }) {
  const hex = getTeeHex(tee);
  return <span className="info-swatch" style={{ background: hex, border: teeBorder(hex) || "1px solid rgba(0,0,0,.18)" }} />;
}

/** Distância jogada: um tee → «5.257 m»; vários → por tee, com a cor. */
export function TeeDistances({ list }: { list: { tee: string; meters: number }[] }) {
  if (!list.length) return null;
  if (list.length === 1) return <InfoItem v={list[0].meters.toLocaleString("pt")} l="m" title={list[0].tee} />;
  return (
    <span className="info-it" style={{ gap: 8 }}>
      {list.map(({ tee, meters }) => (
        <span key={tee} title={tee} className="info-it" style={{ gap: 3 }}>
          <TeeSwatch tee={tee} /><b className="info-v">{meters.toLocaleString("pt")}</b><span className="info-l">m</span>
        </span>
      ))}
    </span>
  );
}

/** CR/Slope por fonte (FFG: o do organizador no RMS9 e o deduzido do handicap
 *  de jogo dos jogadores), para se ver de onde vem o rating usado no SD. */
export function RatingFontes({ list }: { list?: { fonte: string; cr: string; slope: string; title?: string }[] }) {
  if (!list?.length) return null;
  return (
    <InfoGroup>
      {list.map((f) => <InfoItem key={f.fonte} pre={f.fonte} v={f.slope ? `${f.cr} / ${f.slope}` : f.cr} title={f.title} />)}
    </InfoGroup>
  );
}
