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
  | "drive" | "bjgt" | "kids" | "uskids" | "diversos" | "doral" | "ffg" | "nacionais";

// ── Lista de itens de navegação — editar aqui para adicionar/reordenar ──
// `external: true` → abre em nova aba sem SPA navigation (ficheiros estáticos
// em public/, dashboards externos, etc.)
const NAV_ITEMS: { tab: Tab; label: string; path: string; external?: boolean }[] = [
  { tab: "jogadores",  label: "Jogadores",    path: "/jogadores"  },
  { tab: "simulador",  label: "Simulador",    path: "/simulador"  },
  { tab: "calendario", label: "Calendário",   path: "/calendario" },
  { tab: "drive",      label: "🇵🇹 DRIVE",   path: "/drive"      },
  { tab: "diversos",   label: "🇵🇹 FPG",     path: "/FPG"        },
  { tab: "nacionais",  label: "🏆 Títulos",   path: "/titulos"          },
  { tab: "uskids",     label: "🇺🇸 USKids",  path: "/uskids"     },
  { tab: "doral",      label: "🇺🇸 Doral",   path: "/doral"      },
  { tab: "ffg",        label: "🇫🇷 FFG",     path: "/ffg"        },
  { tab: "bjgt",       label: "🇪🇸 BJGT",    path: "/bjgt"       },
  { tab: "campos",     label: "Campos",       path: "/campos"     },
  { tab: "comparar",   label: "Comparar",     path: "/comparar"   },
  { tab: "kids",       label: "🌍 Kids",      path: "/kids"       },
];

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
    FPG: "diversos",
    doral: "doral",
    ffg: "ffg",
    "nacionais-jovens": "nacionais",
    titulos: "nacionais",
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
  ffg:        "Golf Junior – FFGolf",
  nacionais:  "Golf Junior – Títulos",
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

  // ── Auto-scroll para a tab activa (mobile) ────────────────────
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>(".nav-btn.active");
    if (!active) return;
    const navWidth = nav.offsetWidth;
    const btnLeft = active.offsetLeft;
    const btnWidth = active.offsetWidth;
    nav.scrollTo({ left: btnLeft - navWidth / 2 + btnWidth / 2, behavior: "smooth" });
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

      {/* Nav — elementos <a href> para suportar Ctrl/Cmd+click "abrir em nova
          aba" e right-click "copiar endereço". Click normal faz preventDefault
          + navigate SPA (sem reload). Itens com `external: true` abrem em nova
          aba sem SPA — ficheiros estáticos servidos a partir de public/. */}
      <nav ref={navRef} className="nav nav-scroll">
        {calUnlocked && NAV_ITEMS.map(({ tab: t, label, path, external }) => (
          <a
            key={t}
            href={path}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener" : undefined}
            className={`nav-btn${tab === t ? " active" : ""}`}
            onClick={(e) => {
              if (external) return; // deixa o browser abrir o link em nova aba
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              go(path);
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Estatísticas de topo */}
      <div className="top-stats">
        <div className="ta-c">
          <div className="ta-c-val">{stats.courses}</div>
          <div className="ta-c-label">Campos</div>
        </div>
        <div className="ta-c">
          <div className="ta-c-val">{stats.tees}</div>
          <div className="ta-c-label">Tees</div>
        </div>
        <div className="ta-c">
          <div className="ta-c-val">{stats.players}</div>
          <div className="ta-c-label">Jogadores</div>
        </div>
      </div>
    </header>
  );
}
