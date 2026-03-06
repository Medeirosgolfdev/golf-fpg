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
  | "drive" | "bjgt" | "torneio" | "rivais" | "uskids";

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
    rivais: "rivais",
    torneio: "torneio",
    uskids: "uskids",
  };
  return map[seg] ?? "jogadores";
}

// ── Componente ─────────────────────────────────────────────────────

export default function NavBar() {
  const { calUnlocked, stats } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const tab = tabFromPath(location.pathname);

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
            🏁 DRIVE
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "uskids" ? "active" : ""}`} onClick={() => go("/uskids")}>
            ⛳ USKids
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "rivais" ? "active" : ""}`} onClick={() => go("/rivais")}>
            🌍 Riv Intl
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "comparar" ? "active" : ""}`} onClick={() => go("/comparar")}>
            Comparar
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "campos" ? "active" : ""}`} onClick={() => go("/campos")}>
            Campos
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "bjgt" ? "active" : ""}`} onClick={() => go("/bjgt")}>
            🇪🇸 BJGT
          </button>
        )}
        {calUnlocked && (
          <button className={`nav-btn ${tab === "torneio" ? "active" : ""}`} onClick={() => go("/torneio")}>
            GG26
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
