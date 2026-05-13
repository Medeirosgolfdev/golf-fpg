/**
 * scripts/aggregator/util/log.js
 *
 * Logger com cores ANSI, ao estilo do pipeline.js.
 * Helpers: info/ok/warn/fail/step/sub.
 */

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function ts() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${C.gray}${hh}:${mm}:${ss}${C.reset}`;
}

const log = (...args) => console.log(ts(), ...args);

module.exports = {
  C,
  info: (...args) => log(C.cyan + "i" + C.reset, ...args),
  ok: (...args) => log(C.green + "✓" + C.reset, ...args),
  warn: (...args) => log(C.yellow + "⚠" + C.reset, ...args),
  fail: (...args) => log(C.red + "✗" + C.reset, ...args),
  step: (msg) => log(C.bold + C.blue + "▸ " + msg + C.reset),
  sub: (...args) => log(C.dim + "  ·" + C.reset, ...args),
  dim: (s) => C.dim + s + C.reset,
  bold: (s) => C.bold + s + C.reset,
};
