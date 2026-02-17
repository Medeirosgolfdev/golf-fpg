/**
 * fixEncoding.ts — Repair double-encoded UTF-8 (mojibake) in strings.
 *
 * Portuguese names stored as UTF-8, read as Latin-1/CP1252, then re-encoded:
 *   "José" → "JosÃ©",  "João" → "JoÃ£o",  "Gonçalves" → "GonÃ§alves"
 *
 * This module detects and reverses that pattern at runtime.
 */

/**
 * CP1252 characters in the 0x80-0x9F range map to Unicode codepoints > 0xFF.
 * This reverse map converts those Unicode codepoints back to their CP1252 byte values.
 */
const CP1252_REVERSE: Record<number, number> = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function unicodeToCp1252Byte(code: number): number {
  if (code <= 0x7F) return code;
  if (code >= 0xA0 && code <= 0xFF) return code;
  return CP1252_REVERSE[code] ?? -1;
}

/**
 * Fix standard double-encoded UTF-8 mojibake.
 * Interprets JS char codes as CP1252 bytes and re-decodes as UTF-8.
 */
function fixStandardMojibake(s: string): string {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      const byte = unicodeToCp1252Byte(code);
      if (byte < 0) return s;
      bytes[i] = byte;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded !== s ? decoded : s;
  } catch {
    return s;
  }
}

/**
 * Fix "lost byte" mojibake: CP1252 gaps (0x81, 0x8D, etc.) cause the
 * UTF-8 continuation byte to vanish, leaving just the lead byte as a char.
 *
 * Example: "Ávila" = UTF-8 C3 81 → CP1252 drops 0x81 → "Ã" + "vila" = "Ãvila"
 *
 * Uses word-split (no lookbehind regex — more compatible across environments).
 */
function fixLostByteMojibake(s: string): string {
  if (!s.includes("\u00C3")) return s;  // Ã
  const words = s.split(/(\s+)/);  // keep whitespace separators
  let changed = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 2 || w.charCodeAt(0) !== 0xC3) continue;
    const ch2 = w.charAt(1);
    if (ch2 < "a" || ch2 > "z") continue;  // only lowercase after Ã
    // Ãris → Íris (specific Portuguese name)
    if (w.startsWith("\u00C3ris")) {
      words[i] = "\u00CDris" + w.slice(4); changed = true;
    }
    // Ãn → Ín (Índia, Índio)
    else if (ch2 === "n") {
      words[i] = "\u00CD" + w.slice(1); changed = true;
    }
    // Ã + any lowercase letter → Á (Ávila, Áurea, Álvaro, etc.)
    else {
      words[i] = "\u00C1" + w.slice(1); changed = true;
    }
  }
  return changed ? words.join("") : s;
}

/**
 * Combined fix: standard mojibake first, then lost-byte patterns.
 */
export function fixMojibake(s: string): string {
  const r1 = fixStandardMojibake(s);
  if (r1 !== s) return r1;
  return fixLostByteMojibake(s);
}

/**
 * Recursively fix all string values in an object/array.
 * Mutates in place for performance; returns the same reference.
 */
export function deepFixMojibake<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj === "string") return fixMojibake(obj) as unknown as T;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === "string") obj[i] = fixMojibake(v);
      else if (typeof v === "object" && v !== null) deepFixMojibake(v);
    }
    return obj;
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj as object)) {
      const v = (obj as Record<string, unknown>)[key];
      if (typeof v === "string") {
        (obj as Record<string, unknown>)[key] = fixMojibake(v);
      } else if (typeof v === "object" && v !== null) {
        deepFixMojibake(v);
      }
    }
  }
  return obj;
}
