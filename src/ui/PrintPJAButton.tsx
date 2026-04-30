/**
 * PrintPJAButton.tsx — botão para exportar PDF do scorecard de UM torneio,
 * mas filtrado APENAS aos jogadores PJA (membros oficiais do ano corrente).
 *
 * Carrega pja-members.json sozinho (cache em memória após primeiro fetch),
 * portanto funciona em qualquer parte da app sem precisar de prop drilling.
 */
import React, { useEffect, useState } from "react";

let _pjaMembersCache: Record<string, string[]> | null = null;
let _pjaMembersLoading: Promise<Record<string, string[]>> | null = null;

async function loadPjaMembers(): Promise<Record<string, string[]>> {
  if (_pjaMembersCache) return _pjaMembersCache;
  if (_pjaMembersLoading) return _pjaMembersLoading;
  _pjaMembersLoading = (async () => {
    try {
      const r = await fetch("/data/pja-members.json");
      const j = await r.json();
      const out: Record<string, string[]> = {};
      for (const k of Object.keys(j)) {
        if (/^\d{4}$/.test(k) && Array.isArray(j[k])) {
          out[k] = j[k].map(String);
        }
      }
      _pjaMembersCache = out;
      return out;
    } catch (e) {
      console.warn("[PrintPJAButton] Falha a carregar pja-members.json", e);
      return {};
    } finally {
      _pjaMembersLoading = null;
    }
  })();
  return _pjaMembersLoading;
}

interface PrintPJAButtonProps {
  year?: string;
  pjaFeds?: string[] | Set<string>;
  label?: string;
  className?: string;
  title?: string;
}

export default function PrintPJAButton({
  year,
  pjaFeds,
  label = "PDF PJA",
  className = "tourn-ext-link print-hide",
  title,
}: PrintPJAButtonProps) {
  const [feds, setFeds] = useState<Set<string>>(() => {
    if (pjaFeds) return pjaFeds instanceof Set ? pjaFeds : new Set(pjaFeds.map(String));
    return new Set();
  });

  useEffect(() => {
    if (pjaFeds) {
      setFeds(pjaFeds instanceof Set ? pjaFeds : new Set(pjaFeds.map(String)));
      return;
    }
    if (!year) return;
    loadPjaMembers().then(map => {
      const arr = map[year] || [];
      setFeds(new Set(arr.map(String)));
    });
  }, [year, pjaFeds]);

  const count = feds.size;
  if (count === 0) return null;

  const handleClick = () => {
    const allTrs = Array.from(document.querySelectorAll<HTMLElement>("tr[data-fed]"));
    const marked: HTMLElement[] = [];
    for (const tr of allTrs) {
      const f = tr.getAttribute("data-fed");
      if (f && feds.has(String(f))) {
        tr.classList.add("print-pja-keep");
        marked.push(tr);
      }
    }
    document.body.classList.add("print-pja-mode");

    setTimeout(() => {
      window.print();
      const cleanup = () => {
        document.body.classList.remove("print-pja-mode");
        for (const tr of marked) tr.classList.remove("print-pja-keep");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      setTimeout(cleanup, 30000);
    }, 50);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={title || `Exportar PDF apenas com os ${count} jogadores PJA${year ? ` ${year}` : ""}`}
      style={{ cursor: "pointer", font: "inherit" }}
    >
      🖨 {label}
    </button>
  );
}
