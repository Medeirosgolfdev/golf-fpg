/**
 * ffg-lugar-equipa.js — lugares de equipa por preencher no portal FFGolf.
 *
 * Nos campeonatos de França de clubes (ex. «1ère Division U16 Garçons/Filles»,
 * 16/07/2019) o portal publica cada equipa com 5 linhas-modelo antes de saberem
 * os nomes: prénom «JOUEUR A»…«JOUEUR E» (ou «JOUEUSE A»…), nom = o clube,
 * licença fictícia E526…, HCP -15…-11 e nenhum score. Não são pessoas — se
 * entrarem no roster aparecem no topo da /ffg/info/joueurs com «+15.0».
 */
"use strict";

const LUGAR_RE = /^joueu(?:r|se)\s+[a-z]$/i;

/** true se o bloco de jogador FFGolf é um lugar de equipa por preencher. */
function isLugarEquipa(p) {
  if (!p) return false;
  const prenom = String(p.namePrenom || "").trim();
  if (prenom) return LUGAR_RE.test(prenom);
  // Sem prénom separado: o `name` cru vem «Clube Joueur A».
  return /\sjoueu(?:r|se)\s+[a-z]$/i.test(String(p.name || "").trim());
}

module.exports = { isLugarEquipa };
