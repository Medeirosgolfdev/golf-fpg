/**
 * ffgJogador.ts — Lixo nos blocos de jogador do portal FFG Resultats, tratado
 * num só sítio: a página do torneio (toTournament/names) e o
 * `scripts/build-france-players.js` (via `scripts/lib/ffg-jogador.cjs`, que
 * carrega ESTE ficheiro). Por isso: sem imports e só sintaxe que o Node apaga
 * (tipos e interfaces — nada de `enum`/`namespace`).
 */

export interface FfgJogadorNome {
  name?: string | null;
  namePrenom?: string | null;
  nameNom?: string | null;
}

/**
 * Lugar de equipa por preencher. Nos CF de clubes (ex. «1ère Division U16
 * Garçons/Filles», 16/07/2019) o portal publica cada equipa com 5 linhas-modelo:
 * prénom «JOUEUR A»…«JOUEUR E» (ou «JOUEUSE»), nom = o clube, licença fictícia
 * E526…, HCP -15…-11 e nenhum score. Não são pessoas.
 */
export function isLugarEquipa(p: FfgJogadorNome | null | undefined): boolean {
  if (!p) return false;
  const prenom = String(p.namePrenom || "").trim();
  if (prenom) return /^joueu(?:r|se)\s+[a-z]$/i.test(prenom);
  // Sem prénom separado: o `name` cru vem «Clube Joueur A».
  return /\sjoueu(?:r|se)\s+[a-z]$/i.test(String(p.name || "").trim());
}

/**
 * Texto do portal limpo: entidades HTML («&#039;», «&amp;») e os escapes
 * Latin-1 que um ficheiro de 2017 traz em cru («J\E9r\E9my» → «Jérémy»).
 */
export function limparTextoFfg(s: string | null | undefined): string {
  return String(s || "")
    .replace(/\\([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Escalão que a FFG cola ao nome dos estrangeiros nos Internationaux: «Amalie (U18)» → «U18». */
export function escalaoNoNome(s: string | null | undefined): string | null {
  const m = /\((U\d{1,2})\)/i.exec(String(s || ""));
  return m ? m[1].toUpperCase() : null;
}

/** Nome limpo: texto limpo e sem o escalão colado («Amalie (U18)» → «Amalie»).
 *  O portal corta o prénom comprido a meio da marca («Giovanni Daniele (U1»). */
export function limparNomeFfg(s: string | null | undefined): string {
  return limparTextoFfg(s)
    .replace(/\s*\((?:U|Sub-?)\d{1,2}\)\s*/gi, " ")
    .replace(/\s*\((?:U|Sub-?)?\d{0,2}$/i, "")
    .replace(/\s+/g, " ").trim();
}
