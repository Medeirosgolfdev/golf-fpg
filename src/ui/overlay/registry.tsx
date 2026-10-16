/*
 * Registry centralizado de designs do overlay simulador.
 * Agrupa por categoria visual (HIO, Pro Tour, Para Fotos, Compactos, Cards, Tabelas, Verticais).
 * Cada categoria vive no seu próprio ficheiro em ./designs/ para manutenção isolada.
 */
import React from "react";
import type { P, Vis } from "./types";

import { V48 } from "./designs/hio";
import { V29, V30, V38, V45, V46, V47 } from "./designs/pro";
import { V39, V41, V42, V43 } from "./designs/trans";
import { V1, V2, V3, V4, V23, V25, V27 } from "./designs/minimal";
import { V5, V6, V9, V10, V11, V12, V13, V22, V26, V36 } from "./designs/grid";
import { V14, V15, V16, V17, V28, V31, V32, V34, V35 } from "./designs/table";
import { V19, V21, V24, V33 } from "./designs/cols";
import { V50, V51, V52 } from "./designs/resumo";

/* ═══════ CATEGORIES ═══════ */
const CAT_HIO     = "🏌️ Hole-in-One";
const CAT_PRO     = "⭐ Pro Tour";
const CAT_TRANS   = "📷 Para Fotos";
const CAT_MINIMAL = "💬 Compactos";
const CAT_GRID    = "🏆 Cards";
const CAT_TABLE   = "📊 Tabelas";
export const CAT_COLS = "📱 Verticais";
const CAT_RESUMO  = "🏁 Resumo do torneio";
export const CAT_ORDER = [CAT_RESUMO, CAT_HIO, CAT_PRO, CAT_TRANS, CAT_MINIMAL, CAT_GRID, CAT_TABLE, CAT_COLS] as const;

/* ═══════ DESIGN DEFINITION ═══════ */
export type DesignDef = {
  id: string;
  label: string;
  C: React.FC<P>;
  needsHoles: boolean;
  needsHIO?: boolean;
  /** Largura = a do conteúdo principal (o texto quebra) mesmo sem buracos. */
  fit?: boolean;
  /** Opções do «Mostrar» que o desenho trata sozinho. As outras que estiverem
   *  ligadas aparecem na linha de informação por baixo (OverlayExport) — assim
   *  nenhuma opção fica sem efeito. Confirmado em overlayToggles.test.tsx. */
  has: string[];
  /** Só com o torneio completo (d.rounds, 2+ voltas) — e só esses aparecem aí. */
  needsRounds?: boolean;
  cat: string;
};

export const DESIGNS: DesignDef[] = [
  /* 🏁 Resumo do torneio — todas as voltas (escolher «Torneio» no painel) */
  { id:"V50", label:"Resumo do Torneio", C:V50, needsHoles:false, needsRounds:true, fit:true, cat:CAT_RESUMO, has:["stats","course","player","event","date","position"] },
  { id:"V51", label:"Voltas lado a lado", C:V51, needsHoles:true, needsRounds:true, cat:CAT_RESUMO, has:["holeScores","player","event","position"] },
  { id:"V52", label:"Evolução",          C:V52, needsHoles:false, needsRounds:true, fit:true, cat:CAT_RESUMO, has:["player","event","date","position"] },
  /* 🏌️ Hole-in-One — design celebratório para HIO */
  { id:"V48", label:"Ace Celebration", C:V48, needsHoles:true, needsHIO:true, cat:CAT_HIO, has:[] },
  /* ⭐ Pro Tour — estilo PGA Tour / PGA Tour U / College Golf */
  { id:"V45", label:"PGA Broadcast",  C:V45, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V46", label:"College Poster", C:V46, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V47", label:"PGA Tour U",     C:V47, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V29", label:"Tour Classic",   C:V29, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V38", label:"Tour + Nome",    C:V38, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V30", label:"Korn Ferry",     C:V30, needsHoles:true, cat:CAT_PRO, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  /* 📷 Para Fotos — transparentes, flutuam sobre foto */
  { id:"V39", label:"Outline Branco", C:V39, needsHoles:true, cat:CAT_TRANS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V41", label:"Só Score",       C:V41, needsHoles:false, cat:CAT_TRANS, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V43", label:"Barra Accent",   C:V43, needsHoles:false, cat:CAT_TRANS, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V42", label:"Painel Glass",   C:V42, needsHoles:true, cat:CAT_TRANS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  /* 💬 Compactos — badges, strips, sem scores por buraco */
  { id:"V25", label:"Minimal",        C:V25, needsHoles:false, cat:CAT_MINIMAL, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V1",  label:"Sticker",        C:V1,  needsHoles:false, cat:CAT_MINIMAL, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V2",  label:"Strip",          C:V2,  needsHoles:false, cat:CAT_MINIMAL, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V3",  label:"Front / Back",   C:V3,  needsHoles:false, cat:CAT_MINIMAL, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V4",  label:"Neon Ring",      C:V4,  needsHoles:false, cat:CAT_MINIMAL, has:["stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V23", label:"TV Broadcast",   C:V23, needsHoles:false, cat:CAT_MINIMAL, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V27", label:"Score Strip",    C:V27, needsHoles:true, cat:CAT_MINIMAL, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  /* 🏆 Cards — designs completos com fundo */
  { id:"V11", label:"Giant Score",    C:V11, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V22", label:"Magazine",       C:V22, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V10", label:"Score Hero",     C:V10, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V12", label:"Tournament",     C:V12, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V6",  label:"Grint Row",      C:V6,  needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V9",  label:"18Birdies",      C:V9,  needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V13", label:"Dashboard",      C:V13, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V5",  label:"Ticket",         C:V5,  needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V26", label:"Signature",      C:V26, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V36", label:"F9 vs B9",       C:V36, needsHoles:true, cat:CAT_GRID, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  /* 📊 Tabelas — scorecards detalhados */
  { id:"V15", label:"B&W Card",       C:V15, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V28", label:"Full Table",     C:V28, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V31", label:"To-Par Cumulat.",C:V31, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V32", label:"College Red",    C:V32, needsHoles:true, cat:CAT_TABLE, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V34", label:"Clean White",    C:V34, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V35", label:"Accent Bar",     C:V35, needsHoles:true, cat:CAT_TABLE, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V14", label:"Compact Table",  C:V14, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V16", label:"Light Card",     C:V16, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V17", label:"Glass Card",     C:V17, needsHoles:true, cat:CAT_TABLE, has:["holeScores","holePar","holeSI","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  /* 📱 Verticais — formato story / colunas */
  { id:"V24", label:"Story",          C:V24, needsHoles:true, cat:CAT_COLS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V19", label:"PGA Columns",    C:V19, needsHoles:true, cat:CAT_COLS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V21", label:"DP World",       C:V21, needsHoles:true, cat:CAT_COLS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
  { id:"V33", label:"College Grid",   C:V33, needsHoles:true, cat:CAT_COLS, has:["holeScores","stats","course","tee","teeDist","player","hiCh","sd","event","round","date","position"] },
];

/* ═══════ TOGGLES ═══════ */
export const ALL_TOGGLES: { key:string; label:string; def:boolean }[] = [
  { key:"holeScores", label:"Scores",  def:true  },
  { key:"holePar",    label:"Par",     def:false },
  { key:"holeSI",     label:"S.I.",    def:false },
  { key:"stats",      label:"Stats",   def:true  },
  { key:"course",     label:"Campo",   def:true  },
  { key:"tee",        label:"Tee",     def:false },
  { key:"teeDist",    label:"Dist.",   def:false },
  { key:"player",     label:"Nome",    def:true  },
  { key:"hiCh",       label:"HI/CH",   def:false },
  { key:"sd",         label:"SD",      def:false },
  { key:"event",      label:"Torneio", def:true  },
  { key:"round",      label:"Round",   def:false },
  { key:"date",       label:"Data",    def:true  },
  { key:"position",   label:"Pos.",    def:false },
];

export const defaultVis = (): Vis => Object.fromEntries(ALL_TOGGLES.map(t => [t.key, t.def]));

/* Presets rápidos para o utilizador escolher uma combinação de toggles. */
export const VIS_PRESETS: { label:string; desc:string; vis:Vis }[] = [
  {
    label: "⭐ PGA Tour",
    desc: "Nome + torneio + round + posição — ideal para os designs Pro Tour",
    vis: { holeScores:true, holePar:false, holeSI:false, stats:false, course:false, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:true, round:true, date:false, position:true },
  },
  {
    label: "Torneio",
    desc: "Jogador + torneio + campo + stats",
    vis: { holeScores:true, holePar:true, holeSI:false, stats:true, course:true, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:true, round:true, date:true, position:true },
  },
  {
    label: "Essencial",
    desc: "Scores + campo + nome + data",
    vis: { holeScores:true, holePar:true, holeSI:false, stats:true, course:true, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:false, round:false, date:true, position:false },
  },
  {
    label: "Completo",
    desc: "Tudo ligado",
    vis: { holeScores:true, holePar:true, holeSI:true, stats:true, course:true, tee:true, teeDist:true, player:true, hiCh:true, sd:true, event:true, round:true, date:true, position:true },
  },
  {
    label: "Só Scores",
    desc: "Scores sem texto — limpo",
    vis: { holeScores:true, holePar:false, holeSI:false, stats:false, course:false, tee:false, teeDist:false, player:false, hiCh:false, sd:false, event:false, round:false, date:false, position:false },
  },
];

/* ═══════ BACKGROUND PRESETS ═══════ */
export const BG_OPTIONS: { id:string; label:string; hex:string|null }[] = [
  { id:"mix",         label:"Variado",   hex:null     },
  { id:"transparent", label:"Sem fundo", hex:null     },
  { id:"black",       label:"Preto",     hex:"#000000" },
  { id:"navy",        label:"Navy",      hex:"#0f1e35" },
  { id:"pga",         label:"PGA Blue",  hex:"#00205b" },
  { id:"masters",     label:"Masters",   hex:"#006747" },
  { id:"green",       label:"Verde",     hex:"#0d3320" },
  { id:"wine",        label:"Vinho", hex:"#4a1020" },
  { id:"white",       label:"Branco",    hex:"#f2f2f2" },
];

/** Fundo «Variado»: cada desenho com a sua cor (escuras — o texto é claro),
 *  pela ordem do registo, para a galeria não sair toda da mesma cor. */
export const MIX_BG = ["#0f1e35", "#006747", "#4a1020", "#111111", "#00205b", "#1f2937", "#3b1f7e", "#0d3320", "#7c2d12"];
