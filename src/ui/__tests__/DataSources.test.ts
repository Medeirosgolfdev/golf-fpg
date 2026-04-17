import { describe, it, expect } from "vitest";
import { formatSourceLabel } from "../DataSources";

describe("formatSourceLabel", () => {
  it("abrevia pull-torneios", () => {
    expect(formatSourceLabel("/data/pull-torneios000.json")).toBe("pull000");
    expect(formatSourceLabel("/data/pull-torneios001.json")).toBe("pull001");
    expect(formatSourceLabel("/data/pull-torneios010.json")).toBe("pull010");
  });

  it("abrevia clubes", () => {
    expect(formatSourceLabel("/data/clubes_sub_14&18_2024.json")).toBe("clubes2024");
    expect(formatSourceLabel("/data/clubes_sub_14&18_2025.json")).toBe("clubes2025");
    expect(formatSourceLabel("/data/clubes_sub_14_D1.json")).toBe("clubes-D1-14");
    expect(formatSourceLabel("/data/clubes_sub_18_D1.json")).toBe("clubes-D1-18");
  });

  it("abrevia jovens", () => {
    expect(formatSourceLabel("/data/jovens_2024.json")).toBe("jovens2024");
    expect(formatSourceLabel("/data/jovens_2026.json")).toBe("jovens2026");
  });

  it("abrevia drive/aquapor mensais", () => {
    expect(formatSourceLabel("/data/drive-data-2025-03.json")).toBe("drive2025-03");
    expect(formatSourceLabel("/data/aquapor-data-2024-11.json")).toBe("aquapor2024-11");
  });

  it("abrevia uskids_torneios_completos(N)", () => {
    expect(formatSourceLabel("/data/uskids_torneios_completos(1).json")).toBe("uskids(1)");
    expect(formatSourceLabel("/data/uskids_torneios_completos(22).json")).toBe("uskids(22)");
  });

  it("abrevia admissions e outros bem conhecidos", () => {
    expect(formatSourceLabel("/data/fpg-admissions-draws.json")).toBe("admissions");
    expect(formatSourceLabel("/data/uskids-results.json")).toBe("uskids-results");
    expect(formatSourceLabel("/data/uskids-field.json")).toBe("uskids-field");
    expect(formatSourceLabel("/data/ftm_doral_2024.json")).toBe("doral2024");
    expect(formatSourceLabel("/data/ftm_doral_2025.json")).toBe("doral2025");
  });

  it("abrevia wjgc e eowagr", () => {
    expect(formatSourceLabel("/data/wjgc_2025_b89.json")).toBe("wjgc2025-b89");
    expect(formatSourceLabel("/data/eowagr25_contest13.json")).toBe("eowagr25-contest13");
  });

  it("lida com paths sem prefixo /data/", () => {
    expect(formatSourceLabel("pull-torneios001.json")).toBe("pull001");
    expect(formatSourceLabel("clubes_sub_14&18_2024.json")).toBe("clubes2024");
  });

  it("fallback truncado para paths desconhecidos longos", () => {
    const result = formatSourceLabel("/data/um-ficheiro-muito-muito-muito-longo.json");
    expect(result.length).toBeLessThanOrEqual(18);
    expect(result).toMatch(/…$/);
  });

  it("retorna '?' para input vazio", () => {
    expect(formatSourceLabel(null)).toBe("?");
    expect(formatSourceLabel(undefined)).toBe("?");
    expect(formatSourceLabel("")).toBe("?");
  });
});
