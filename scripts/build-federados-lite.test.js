import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

/** O federados-lite.json tem exactamente o que os hooks useFedBirthdates/
 *  useFedGenders/useFedCountries/useFedHcp montavam do federados.json inteiro. */
const require = createRequire(import.meta.url);
const { buildLite } = require("./build-federados-lite.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("federados-lite", () => {
  it("os mesmos quatro mapas que as regras antigas", () => {
    const feds = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/federados.json"), "utf8"));
    const lite = buildLite(feds);
    const b = {}, s = {}, c = {}, h = {};
    for (const p of feds.players) {
      const fed = String(p.federation_code || p.fed || "");
      const dob = p.birthdate || p.dt_aniv || p.dob || "";
      if (fed && typeof dob === "string" && /^\d{4}-\d{2}-\d{2}/.test(dob)) b[fed] = dob.slice(0, 10);
      const g = String(p.gender || p.sex || "").toUpperCase();
      if (fed && (g === "M" || g === "F")) s[fed] = g;
      const cc = (p.country_prefix || "").toUpperCase().trim().slice(0, 2);
      if (fed && cc && cc !== "PT" && !cc.startsWith("@")) c[fed] = cc;
      const raw = p.hcp_index ?? p.hcp_exact;
      const v = typeof raw === "number" ? raw : parseFloat(raw);
      if (fed && Number.isFinite(v) && v <= 54) h[fed] = v;
    }
    expect(lite.b).toEqual(b); expect(lite.s).toEqual(s); expect(lite.c).toEqual(c); expect(lite.h).toEqual(h);
    expect(Object.keys(b).length).toBeGreaterThan(10000);
  }, 60000);
});
