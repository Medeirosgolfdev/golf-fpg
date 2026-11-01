/**
 * SidebarCard — o cartão de um torneio na barra lateral, o mesmo em todas as
 * páginas: nome · 📍 campo · pills · (rodapé) · data e contagem, com a barra de
 * cor à esquerda. Usado pelo TournSidebarItem (FPG, USKids, ficha do jogador) e
 * pelo CircuitShell (todos os circuitos). O aspecto vive no App.css (.side-card).
 *
 * Com `href` o cartão é um <a>: clique normal selecciona; Ctrl/clique do meio
 * abre noutra janela e o menu do rato deixa copiar o endereço.
 */
import React from "react";

interface SidebarCardProps {
  active: boolean;
  /** Cor da barra à esquerda (série, fonte ou circuito). */
  accent: string;
  onSelect: () => void;
  href?: string;
  name: React.ReactNode;
  /** Depois do nome, sem encolher (🕳️, ⭐…). */
  nameExtra?: React.ReactNode;
  course?: React.ReactNode;
  pills: React.ReactNode;
  /** Entre as pills e a linha da data (ex.: barra de inscritos da USKids). */
  footer?: React.ReactNode;
  date: React.ReactNode;
  /** À direita da data (fonte, nº de jogadores…). */
  right?: React.ReactNode;
}

export default function SidebarCard({ active, accent, onSelect, href, name, nameExtra, course, pills, footer, date, right }: SidebarCardProps) {
  const className = "course-item side-card" + (active ? " active" : "");
  const style = { "--side-accent": accent } as React.CSSProperties;
  const body = (
    <>
      <div className="side-card-name">
        <span className="course-item-name">{name}</span>
        {nameExtra}
      </div>
      {course && <div className="side-card-course">📍 {course}</div>}
      <div className="side-card-sep" />
      <div className="side-card-pills">{pills}</div>
      <div className="side-card-sep" />
      {footer}
      <div className="side-card-foot">
        <span className="side-card-date">{date}</span>
        <div className="side-card-right">{right}</div>
      </div>
    </>
  );
  if (href) return (
    <a href={href} className={className} style={style}
      onClick={e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onSelect();
      }}>
      {body}
    </a>
  );
  return (
    <div role="button" tabIndex={0} className={className} style={style} onClick={onSelect}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(); }}>
      {body}
    </div>
  );
}
