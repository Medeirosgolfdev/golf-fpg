/**
 * gemeo.ts — Fundir o que o gémeo tem quando a mesma prova de Espanha vem de duas
 * fontes (12/11/2026, Mariana: «os torneios repetidos espanhóis fazem merge das
 * informações?» → «Sim, passo 1»).
 *
 * Caso tratado aqui: prova do LiveGolfScoring (a que se mostra — tem o buraco a
 * buraco) com gémeo no site da RFEG (escondido — tem as listas oficiais). Até aqui
 * a aba «Inscrições» mostrava só quem tinha jogado; passa a mostrar a lista oficial
 * (admitidos, convidados e reservas, com licença, clube, handicap de inscrição e
 * nascimento), sem perder ninguém nem o que a página já sabia dos portugueses.
 *
 * Regras:
 *  - A lista oficial é a base e entra como está.
 *  - Um português mantém o federado e o clube da FPG (é o que abre a ficha dele):
 *    na lista oficial vem com licença espanhola e o «clube» é a federação regional.
 *  - Campos vazios na lista oficial (clube, nascimento, licença…) preenchem-se com
 *    os da linha de quem jogou, quando é a mesma pessoa. Licença-fantasma conta como
 *    vazia: o site dá «XXXXXPOR04» aos estrangeiros sem licença espanhola.
 *  - Quem jogou e não se encontra na lista oficial junta-se no fim — ninguém some.
 *  - «A mesma pessoa» = o mesmo nome (sem acentos, pontuação nem ordem) ou, sendo
 *    só UMA a candidata, o mesmo nome com apelidos a mais ou a menos. Na dúvida não
 *    se casa: nunca se passam dados de uma pessoa para outra.
 *
 * Só dados — sem React, sem carregamentos.
 */
import type { RFEGDetail, RFEGPlayer } from "./types";
import { isFedFpg } from "../../utils/playerKey";
import { isPtCountry } from "../../utils/flagUtils";
import { rfegPlayerFlag } from "./flags";

type Inscritos = RFEGDetail["inscritos"];

/** Palavras do nome, sem acentos nem pontuação («LÓPEZ-LANCHARES, Martina» → lopez, lanchares, martina). */
function palavras(nome: string | null | undefined): string[] {
  return String(nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z ]+/g, " ")
    .split(/\s+/).filter(Boolean);
}

/** Licença que o site inventa para quem não tem licença espanhola («XXXXXPOR04», «XXXXXIRE18»). */
const licencaFantasma = (lic: string | null | undefined): boolean => /^X{3,}/i.test(String(lic ?? ""));

/** As listas oficiais que a aba «Inscrições» mostra, pela regra do `buildAdmissions`:
 *  admitidos + convidados (sem eles, a lista provisória) e as reservas. */
function listaAMostrar(ins: Inscritos): { confirmados: RFEGPlayer[]; provisoria: boolean } {
  const confirmados = [...(ins.admitidos ?? []), ...(ins.invitados ?? [])];
  return confirmados.length ? { confirmados, provisoria: false } : { confirmados: ins.provisional ?? [], provisoria: true };
}

/** Procura, entre quem jogou, a linha da mesma pessoa (ver as regras no cabeçalho). */
function fazerProcura(jogaram: RFEGPlayer[]): (nome: string | null) => RFEGPlayer | null {
  const porChave = new Map<string, RFEGPlayer | null>();
  const comPalavras = jogaram.map((p) => ({ p, w: new Set(palavras(p.name)) }));
  for (const { p, w } of comPalavras) {
    const k = [...w].sort().join(" ");
    if (!k) continue;
    // Dois com o mesmo nome entre quem jogou: ambíguo, não se casa nenhum.
    porChave.set(k, porChave.has(k) ? null : p);
  }
  return (nome) => {
    const w = [...new Set(palavras(nome))];
    if (w.length < 2) return null;
    const exacto = porChave.get([...w].sort().join(" "));
    if (exacto !== undefined) return exacto;
    // O mesmo nome com apelidos a mais ou a menos — só quando há UMA candidata.
    const cands = comPalavras.filter(({ w: o }) => o.size >= 2 && (w.every((x) => o.has(x)) || [...o].every((x) => w.includes(x))));
    return cands.length === 1 ? cands[0].p : null;
  };
}

/**
 * As inscrições de uma prova do LGS com o que o gémeo do site da RFEG tem.
 * `doLgs`: as linhas de quem jogou (já com federado/clube/nascimento dos lookups).
 * `oficial`: as listas do gémeo. Sem listas oficiais devolve `doLgs` tal como está.
 */
export function inscritosComGemeo(doLgs: Inscritos, oficial: Inscritos | null | undefined): Inscritos {
  if (!oficial) return doLgs;
  const { confirmados, provisoria } = listaAMostrar(oficial);
  const reservas = oficial.reservas ?? [];
  if (!confirmados.length && !reservas.length) return doLgs;

  const jogaram = doLgs.admitidos ?? [];
  const procurar = fazerProcura(jogaram);
  const casados = new Set<RFEGPlayer>();

  const fundir = (o: RFEGPlayer): RFEGPlayer => {
    const l = procurar(o.name);
    if (!l) return o;
    casados.add(l);
    // Português com ficha na FPG: fica o federado e o clube de cá.
    const pt = isPtCountry(rfegPlayerFlag(o.name, o.pais)) && isFedFpg(l.licencia);
    return {
      ...o,
      licencia: pt ? l.licencia : ((licencaFantasma(o.licencia) ? null : o.licencia) || l.licencia || o.licencia),
      club: pt ? (l.club || o.club) : (o.club || l.club),
      dob: o.dob || l.dob,
      catEdad: o.catEdad || l.catEdad,
      sexo: o.sexo || l.sexo,
    };
  };

  const confirmadosF = confirmados.map(fundir);
  const reservasF = reservas.map(fundir);
  // Quem jogou e não consta das listas oficiais: junta-se no fim (sem o lugar da
  // classificação — o «pos» da lista oficial é a ordem de inscrição).
  const extras = jogaram.filter((p) => !casados.has(p)).map((p) => ({ ...p, pos: null }));

  const nAdm = (oficial.admitidos ?? []).length;
  const admitidos = provisoria ? [...(oficial.admitidos ?? [])] : [...confirmadosF.slice(0, nAdm), ...extras];
  const invitados = provisoria ? [...(oficial.invitados ?? [])] : confirmadosF.slice(nAdm);
  const provisional = provisoria ? [...confirmadosF, ...extras] : (oficial.provisional ?? []);
  return {
    admitidos,
    invitados,
    reservas: reservasF,
    bajas: oficial.bajas ?? [],
    noAdmitidos: oficial.noAdmitidos ?? [],
    provisional,
    counts: {
      ...(oficial.counts ?? doLgs.counts),
      admitidos: admitidos.length,
      invitados: invitados.length,
      reservas: reservasF.length,
      provisional: provisional.length,
    } as Inscritos["counts"],
  };
}
