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
  | "drive" | "bjgt" | "kids" | "uskids" | "diversos" | "doral" | "ffg" | "england" | "rfeg" | "nacionais" | "global-junior" | "major" | "egr" | "galeria" | "draws";

// ── Lista de itens de navegação — editar aqui para adicionar/reordenar ──
// `external: true` → abre em nova aba sem SPA navigation (ficheiros estáticos
// em public/, dashboards externos, etc.)
const NAV_ITEMS: { tab: Tab; label: string; path: string; external?: boolean; title?: string }[] = [
  { tab: "jogadores",  label: "Jogadores",    path: "/jogadores"  },
  { tab: "draws",      label: "Draws",        path: "/draws", title: "Companheiros de jogo do Manuel"  },
  { tab: "simulador",  label: "Simulador",    path: "/simulador"  },
  { tab: "calendario", label: "Calendário",   path: "/calendario" },
  { tab: "drive",      label: "🇵🇹 DRIVE",   path: "/drive"      },
  { tab: "nacionais",  label: "🏆",           path: "/titulos", title: "Títulos" },
  { tab: "diversos",   label: "🇵🇹 FPG",     path: "/FPG"        },
  { tab: "uskids",     label: "🇺🇸 USKids",  path: "/uskids"     },
  { tab: "major",      label: "🎖️ MAJOR",   path: "/major", title: "Doral + BJGT" },
  { tab: "global-junior", label: "🏌️ GJGL",  path: "/global-junior" },
  { tab: "ffg",        label: "🇫🇷 France",  path: "/ffg"        },
  { tab: "england",    label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England",  path: "/england"    },
  { tab: "rfeg",       label: "🇪🇸 España",  path: "/rfeg"       },
  { tab: "egr",        label: "🇪🇺 EGR",     path: "/egr", title: "European Golf Rankings" },
  { tab: "campos",     label: "Campos",       path: "/campos"     },
  { tab: "comparar",   label: "Comparar",     path: "/comparar"   },
  { tab: "kids",       label: "🌍 Kids",      path: "/kids2"      },
  { tab: "galeria",    label: "📁",           path: "/Logos/galeria.html", external: true, title: "Galeria de Logos" },
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
    bjgt: "major",
    major: "major",
    kids: "kids",
    kids2: "kids",
    uskids: "uskids",
    diversos: "diversos",
    FPG: "diversos",
    doral: "major",
    ffg: "ffg",
    rfeg: "rfeg",
    titulos: "nacionais",
    "global-junior": "global-junior",
    england: "england",
    egr: "egr",
    draws: "draws",
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
  major:      "Golf Junior – MAJOR (Doral + BJGT)",
  ffg:        "Golf Junior – FFGolf",
  england:    "Golf Junior – England Golf",
  rfeg:       "Golf Junior – RFEGolf",
  nacionais:  "Golf Junior – Títulos",
  "global-junior": "Golf Junior – Global Junior Golf Live",
  egr:        "Golf Junior – European Golf Rankings",
  galeria:    "Golf Junior – Galeria de Logos",
  draws:      "Golf Junior – Draws (Manuel)",
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
        {calUnlocked && NAV_ITEMS.map(({ tab: t, label, path, external, title }) => (
          <a
            key={t}
            href={path}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener" : undefined}
            title={title}
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
