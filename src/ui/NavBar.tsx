/**
 * src/ui/NavBar.tsx
 *
 * Barra de navegação global — extraída de App.tsx.
 * Lê calUnlocked e stats do AppContext (sem props).
 */

import { useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import golfBallSvg from "../assets/golf-ball.svg";

// ── Tipos ──────────────────────────────────────────────────────────

type Tab =
  | "campos" | "jogadores" | "comparar" | "simulador" | "calendario"
  | "drive" | "bjgt" | "kids" | "uskids" | "diversos" | "doral";

// ── Helpers ────────────────────────────────────────────────────────

function tabFromPath(pathname: string): Tab {
  const seg = pathname.split("/")[1] || "";
  const map: Record<string, Tab> = {
    campos: "campos",
    simulador: "simulador",
    comparar: "comparar",
    calendario: "calendario",
    drive: "drive",
    bjgt: "bjgt",
    kids: "kids",
    uskids: "uskids",
    diversos: "diversos",
    doral: "doral",
  };
  return map[seg] ?? "jogadores";
}

// ── Mapa de títulos por tab ────────────────────────────────────────
const TAB_TITLES: Record<Tab, string> = {
  jogadores:  "Golf Junior – Jogadores",
  simulador:  "Golf Junior – Simulador",
  calendario: "Golf Junior – Calendário",
  drive:      "Golf Junior – DRIVE",
  uskids:     "Golf Junior – USKids",
  kids:     "Golf Junior – Kids Internacionais",
  comparar:   "Golf Junior – Comparar",
  campos:     "Golf Junior – Campos",
  bjgt:       "Golf Junior – BJGT",
  diversos:   "Golf Junior – Diversos",
  doral:      "Golf Junior – Doral",
};

// ── Componente ─────────────────────────────────────────────────────

export default function NavBar() {
  const { calUnlocked, stats } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const tab = tabFromPath(location.pathname);

  // Actualiza o título da aba do browser com a página activa
  useEffect(() => {
    document.title = TAB_TITLES[tab] ?? "Golf Junior";
  }, [tab]);

  const go = (path: string) => navigate(path);

  // ── Drag-to-scroll na nav ──────────────────────────────────────
  const navRef = useRef<HTMLElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollX: 0 });

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      drag.current = { active: true, startX: e.clientX, scrollX: el.scrollLeft };
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    };
    const onMove = (e: MouseEvent) => {
      if (!drag.current.active) return;
      el.scrollLeft = drag.current.scrollX - (e.clientX - drag.current.startX);
    };
    const onUp = () => {
      drag.current.active = false;
      el.style.cursor = "";
      el.style.userSelect = "";
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="brand">
        <img src={golfBallSvg} alt="" className="brand-icon" />
        <div className="brand-title">Golf</div>
      </div>

      {/* Nav */}
      <nav ref={navRef} className="nav nav-scroll">
        {/* Todas as páginas protegidas por password */}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "jogadores" ? "active" : ""}`} onClick={() => go("/jogadores")}>
            Jogadores
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "simulador" ? "active" : ""}`} onClick={() => go("/simulador")}>
            Simulador
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "calendario" ? "active" : ""}`} onClick={() => go("/calendario")}>
            Calendário
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "drive" ? "active" : ""}`} onClick={() => go("/drive")}>
            🇵🇹 DRIVE
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "diversos" ? "active" : ""}`} onClick={() => go("/diversos")}>
            🇵🇹 FPG
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "uskids" ? "active" : ""}`} onClick={() => go("/uskids")}>
            🇺🇸 USKids
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "doral" ? "active" : ""}`} onClick={() => go("/doral")}>
            🇺🇸 Doral
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "bjgt" ? "active" : ""}`} onClick={() => go("/bjgt")}>
            🇪🇸 BJGT
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "campos" ? "active" : ""}`} onClick={() => go("/campos")}>
            Campos
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "comparar" ? "active" : ""}`} onClick={() => go("/comparar")}>
            Comparar
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "kids" ? "active" : ""}`} onClick={() => go("/kids")}>
            🌍kids
          </button>
        )}
      </nav>

      {/* Estatísticas de topo */}
      <div className="top-stats">
        <div className="top-stat">
          <div className="top-stat-val">{stats.courses}</div>
          <div className="top-stat-label">Campos</div>
        </div>
        <div className="top-stat">
          <div className="top-stat-val">{stats.tees}</div>
          <div className="top-stat-label">Tees</div>
        </div>
        <div className="top-stat">
          <div className="top-stat-val">{stats.players}</div>
          <div className="top-stat-label">Jogadores</div>
        </div>
      </div>
    </header>
  );
}
