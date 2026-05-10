/**
 * clubesGruposData.ts — Dados estáticos do Campeonato Nacional de Clubes.
 *
 * Composição dos grupos (sub14 + sub18) por edição.
 * Extraído de FPGPage.tsx para reduzir o tamanho do componente principal e
 * para que outras páginas possam consultar a composição histórica dos grupos.
 *
 * Convenções:
 *  - CLUBES_GRUPOS         → edição mais recente referenciada (snapshot)
 *  - CLUBES_GRUPOS_2025    → edição 2025
 *  - CLUBES_GRUPOS_BY_YEAR → mapa year → { sub14, sub18 } (consulta por ano)
 */
import type { GrupoEntry } from "./fpgTypes";

export const CLUBES_GRUPOS: Record<"sub14" | "sub18", GrupoEntry[]> = {
  sub14: [
    { grupo: "A", clube: "Club de Golf de Miramar", suplente: "Raul Pazos", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "Tomás Rente",           fed: "46311", hcp: 6.9 },
      { nome: "Margarida Silva Pinto", fed: "46310", hcp: 4.1 },
      { nome: "Francisco Nunes (jr)",  fed: "46299", hcp: 5.4 },
      { nome: "Henrique Pereira",      fed: "53646", hcp: 12.5 },
      { nome: "Raul Pazos",            fed: "46296", hcp: 0 },
    ]},
    { grupo: "B", clube: "Clube de Golfe Citynorte", capitao: "Cândida Santos", jogadores: [
      { nome: "Gil Ribeiro",           fed: "47810", hcp: 22.9 },
      { nome: "Madalena Policarpo",    fed: "45608", hcp: 15.7 },
      { nome: "João Pedro Frade",      fed: "45424", hcp: 18.5 },
      { nome: "Pedro Luís Fernandes",  fed: "52168", hcp: 17.0 },
    ]},
    { grupo: "C", clube: "Clube de Golf do Estoril", suplente: "Salvador Ivo de Carvalho", capitao: "Tiago Cruz", jogadores: [
      { nome: "João Rocha",              fed: "48297", hcp: 6.1 },
      { nome: "Ruiqi Li",                fed: "49076", hcp: 3.8 },
      { nome: "Nuno Palmares Jr.",       fed: "49124", hcp: 3.9 },
      { nome: "Ricardo Castro Ferreira", fed: "49085", hcp: 7.4 },
      { nome: "Salvador Ivo de Carvalho", fed: "43968", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golfe de Vilamoura", suplente: "Tomás Valério", capitao: "Hugo Santos", jogadores: [
      { nome: "Catarina Valério",           fed: "46873", hcp: 18.1 },
      { nome: "Catarina Sousa Conceição",   fed: "48794", hcp: 10.7 },
      { nome: "Tomás Lima Pinto",           fed: "46037", hcp: 8.9  },
      { nome: "Sabrina Ribeiro Crisóstomo", fed: "48971", hcp: 8.0  },
      { nome: "Tomás Valério",              fed: "50011", hcp: 0 },
    ]},
    { grupo: "E", clube: "Oporto Golf Clube A", suplente: "Lucas Amorim", capitao: "Miguel Valença", jogadores: [
      { nome: "Sebastião Soares",      fed: "47341", hcp: 15.3 },
      { nome: "Afonso de Sousa Pinto", fed: "46480", hcp: 10.3 },
      { nome: "Francisco Saraiva",     fed: "39097", hcp: 7.9  },
      { nome: "Santiago Dias",         fed: "42908", hcp: 1.0  },
      { nome: "Lucas Pereira Amorim",  fed: "54330", hcp: 0 },
    ]},
    { grupo: "F", clube: "Clube de Golf da Quinta do Peru", capitao: "Cláudia Dantas", jogadores: [
      { nome: "David Filip Jr",     fed: "51949", hcp: 9.7  },
      { nome: "Mário Novaes Moura", fed: "53939", hcp: 38.3 },
      { nome: "Beatriz Mendes",     fed: "46026", hcp: 36.0 },
      { nome: "William Gao",        fed: "51524", hcp: 9.5  },
    ]},
    { grupo: "G", clube: "Oporto Golf Clube B", capitao: "Ricardo Garcia", jogadores: [
      { nome: "Catarina Loureiro", fed: "49328", hcp: 20.1 },
      { nome: "Maksim Mutalapov",  fed: "54475", hcp: 32.1 },
      { nome: "Ricardo Ferreira",  fed: "45366", hcp: 23.1 },
      { nome: "Diogo Guilherme",   fed: "56632", hcp: 19.0 },
    ]},
    { grupo: "H", clube: "Lisbon Sports Club", capitao: "Catarina Inocentes", jogadores: [
      { nome: "Filipe Delicado",             fed: "53124", hcp: 36.6 },
      { nome: "Guilherme Pereira",           fed: "47658", hcp: 37.2 },
      { nome: "David Stocksreiter Ferreira", fed: "48164", hcp: 35.4 },
      { nome: "Diogo Vaz Pinto Jr.",         fed: "51432", hcp: 32.9 },
    ]},
    { grupo: "I", clube: "Clube de Golfe Citynorte A", suplente: "Tomás Araújo", capitao: "Cândida Santos", jogadores: [
      { nome: "Marc Costa",               fed: "46308", hcp: 13.7 },
      { nome: "Tomás Sarmento de Beires", fed: "48046", hcp: 16.2 },
      { nome: "Afonso Paiva Gonçalves",   fed: "47819", hcp: 14.5 },
      { nome: "Diogo Lima",               fed: "49717", hcp: 12.0 },
      { nome: "Tomás Araújo",             fed: "49011", hcp: 0 },
    ]},
    { grupo: "J", clube: "Club de Golf de Miramar B", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "José Maria Pereira",     fed: "53645", hcp: 20.7 },
      { nome: "Eduardo Rocha Ferreira", fed: "51182", hcp: 22.4 },
      { nome: "Ricardo Rocha Ferreira", fed: "51180", hcp: 17.3 },
      { nome: "João Balixa",            fed: "46038", hcp: 9.5  },
    ]},
    { grupo: "K", clube: "Quinta das Lágrimas Clube de Golfe", suplente: "Vicente Poeira", jogadores: [
      { nome: "Guido Martins Gonçalves", fed: "46414", hcp: 14.6 },
      { nome: "Gil Martins Gonçalves",   fed: "46415", hcp: 18.7 },
      { nome: "Miguel Silva",            fed: "45661", hcp: 36.9 },
      { nome: "Valentin Iria",           fed: "57233", hcp: 31.8 },
      { nome: "Vicente Poeira",          fed: "50885", hcp: 39.7 },
    ]},
  ],
  sub18: [
    { grupo: "A", clube: "CG Vilamoura", suplente: "Igor Kostyn", capitao: "Hugo Santos", jogadores: [
      { nome: "Rodrigo Sousa Correia", fed: "44934", hcp: 3.4     },
      { nome: "Francisco Reis",        fed: "40534", hcp: 0.3     },
      { nome: "Martim Pinto Johansen", fed: "40115", hcp: "+0.8"  },
      { nome: "Jack Murtagh",          fed: "41593", hcp: 8.4     },
    ]},
    { grupo: "B", clube: "Clube de Golf da Quinta do Peru", capitao: "Cláudia Dantas", jogadores: [
      { nome: "Salvador Paulo Rodrigues", fed: "58051", hcp: 29.3 },
      { nome: "Angelina Gao",             fed: "51523", hcp: 3.9  },
      { nome: "Diogo Sequeira",           fed: "56654", hcp: 3.6  },
      { nome: "João Setúbal",             fed: "43732", hcp: 0.2  },
    ]},
    { grupo: "C", clube: "Club de Golf de Miramar", suplente: "Margarida Alves", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "Afonso Silva Pinto",          fed: "46309", hcp: 5.4    },
      { nome: "Gaspard Maes",                fed: "51074", hcp: 1.8    },
      { nome: "Camila Pazos",                fed: "46297", hcp: 2.9    },
      { nome: "Francisca Ferreira Da Costa", fed: "40981", hcp: "+1.8" },
    ]},
    { grupo: "D", clube: "Clube Palheiro Golfe", capitao: "Edgar Rodrigues", jogadores: [
      { nome: "André Gonçalves",    fed: "41121", hcp: 6.7 },
      { nome: "Maria Cunha",        fed: "46482", hcp: 4.6 },
      { nome: "Salvador Rodrigues", fed: "39465", hcp: 6.2 },
      { nome: "José Pedro Miranda", fed: "38976", hcp: 7.0 },
    ]},
    { grupo: "E", clube: "Estela Golf Club", suplente: "Afonso Polery", capitao: "Luís Cameira", jogadores: [
      { nome: "Gabriel Marques Guerreiro", fed: "43053", hcp: 4.4  },
      { nome: "André Von Hafe",            fed: "40473", hcp: 15.4 },
      { nome: "Manuel Rouco Castro",       fed: "47576", hcp: 16.3 },
      { nome: "Afonso Poiarez",            fed: "46079", hcp: 16.2 },
    ]},
    { grupo: "F", clube: "Oporto Golf Club A", suplente: "Henrique Montenegro", capitao: "Miguel Valença", jogadores: [
      { nome: "Eva Silva",                fed: "46437", hcp: 1.4    },
      { nome: "Pedro Ferreira",           fed: "43810", hcp: 0.7    },
      { nome: "Guilherme Grabner Moreira",fed: "42205", hcp: 0.6    },
      { nome: "Luis António Silva",       fed: "42845", hcp: "+3.0" },
      { nome: "Henrique Montenegro",      fed: "39552", hcp: 2.2    },
    ]},
    { grupo: "G", clube: "Clube de Golf da Ilha Terceira", suplente: "Tomás Valadão", capitao: "Michael Duarte", jogadores: [
      { nome: "João Lucas Fagundes",           fed: "44677", hcp: 17.8 },
      { nome: "Madalena Alexandra Van Zeller", fed: "47078", hcp: 8.0  },
      { nome: "Maria Fonseca Azevedo",         fed: "44019", hcp: 14.9 },
      { nome: "Rafael Ourique Azevedo",        fed: "44018", hcp: 27.0 },
      { nome: "Tomás Valadão",                 fed: "36625", hcp: 0    },
    ]},
    { grupo: "H", clube: "Clube de Golfe de Belas", suplente: "Frederico Almeida da Silva", capitao: "José Augusto", jogadores: [
      { nome: "Clara Trindade",           fed: "45812", hcp: 8.2 },
      { nome: "Henrique Almeida da Silva",fed: "41612", hcp: 6.4 },
      { nome: "Ryan Dantas",              fed: "45439", hcp: 6.9 },
      { nome: "Filipe Pinheiro",          fed: "46591", hcp: 3.1 },
    ]},
    { grupo: "I", clube: "Oporto Golf Clube B", suplente: "Gonçalo Maia", capitao: "Miguel Montenegro", jogadores: [
      { nome: "Teresa Ferreira",          fed: "46589", hcp: 6.7 },
      { nome: "Jorge Xavier Graça Silva", fed: "48705", hcp: 8.0 },
      { nome: "Maria Francisca Santos",   fed: "46853", hcp: 4.6 },
      { nome: "Maria Loureiro",           fed: "46489", hcp: 5.8 },
    ]},
    { grupo: "J", clube: "P.G.C. - Paredes Golfe Clube", suplente: "Guilherme Alves", capitao: "Tomás Ribeiro", jogadores: [
      { nome: "Rafael Nogueira", fed: null, hcp: 15.5 },
      { nome: "João Oliveira",   fed: null, hcp: 29.3 },
      { nome: "Gustavo Castro",  fed: null, hcp: 16.7 },
      { nome: "Elisa Garcez",    fed: null, hcp: 4.9  },
    ]},
    { grupo: "K", clube: "Clube de Golf do Estoril", suplente: "Reuben Thapa", capitao: "Miguel Nunes Pedro", jogadores: [
      { nome: "Paul Devillers",             fed: "49770", hcp: 2.5    },
      { nome: "João Maria Ivo de Carvalho", fed: "38334", hcp: "+1.8" },
      { nome: "Duarte Soares Franco",       fed: "48531", hcp: 8.1    },
      { nome: "Pedro Costa Alemão",         fed: "46706", hcp: 4.0    },
      { nome: "Reuben Thapa",               fed: "47552", hcp: 3.6    },
    ]},
    { grupo: "L", clube: "Lisbon Sports Club", capitao: "Rita Nunes", jogadores: [
      { nome: "Francisca Vilela", fed: "36700", hcp: 16.3 },
      { nome: "Manuel Vaz Pinto", fed: "51430", hcp: 17.8 },
      { nome: "João Gomes",       fed: "53715", hcp: 10.5 },
      { nome: "Ana Bianchi",      fed: "36861", hcp: 13.9 },
    ]},
  ],
};

/* ── Grupos 2025 ─────────────────────────────────────────────────────────── */
export const CLUBES_GRUPOS_2025: Record<"sub14" | "sub18", GrupoEntry[]> = {
  sub18: [
    { grupo: "A", clube: "CG Vilamoura", jogadores: [
      { nome: "João Crasi Alves",           fed: "39701", hcp: 0 },
      { nome: "João Maria Ivo de Carvalho", fed: "38334", hcp: 0 },
      { nome: "Francisco Reis",             fed: "40534", hcp: 0 },
      { nome: "Martim Pinto Johansen",      fed: "40115", hcp: 0 },
    ]},
    { grupo: "B", clube: "Oporto Golf Clube A", jogadores: [
      { nome: "Guilherme Grabner Moreira",  fed: "42205", hcp: 0 },
      { nome: "Luis António Silva",         fed: "42845", hcp: 0 },
      { nome: "Henrique Montenegro",        fed: "39552", hcp: 0 },
      { nome: "Pedro Ferreira",             fed: "43810", hcp: 0 },
    ]},
    { grupo: "C", clube: "Club de Golf de Miramar", jogadores: [
      { nome: "Tomás Afonso Araujo",        fed: "35849", hcp: 0 },
      { nome: "Francisca Ferreira Da Costa",fed: "40981", hcp: 0 },
      { nome: "João Alvim",                 fed: "45340", hcp: 0 },
      { nome: "Margarida Alves",            fed: "45499",    hcp: 0 },
      { nome: "Henrique Ferreira da Costa", fed: "41080", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
      { nome: "Reuben Thapa",              fed: "47552", hcp: 0 },
      { nome: "Gino Vassily Sganzerla",    fed: "41461", hcp: 0 },
      { nome: "Eleonora Savanovich",       fed: "51319", hcp: 0 },
      { nome: "Paul Devillers",            fed: "49770",    hcp: 0 },
    ]},
    { grupo: "E", clube: "Clube Palheiro Golfe", jogadores: [
      { nome: "André Gonçalves",           fed: "41121", hcp: 0 },
      { nome: "José Pedro Miranda",        fed: "38976", hcp: 0 },
      { nome: "Maria Cunha",               fed: "46482", hcp: 0 },
      { nome: "Salvador Rodrigues",        fed: "39465", hcp: 0 },
    ]},
    { grupo: "F", clube: "Oporto Golf Clube B", jogadores: [
      { nome: "Sebastiao Sardinha Saraiva",fed: "46195", hcp: 0 },
      { nome: "Eva Silva",                 fed: "46437", hcp: 0 },
      { nome: "Maria Loureiro",            fed: "46489", hcp: 0 },
      { nome: "Teresa Ferreira",           fed: "46589", hcp: 0 },
      { nome: "Gonçalo Maia",              fed: "46395",    hcp: 0 },
    ]},
    { grupo: "G", clube: "Clube de Golfe de Belas", jogadores: [
      { nome: "Henrique Almeida da Silva", fed: "41612", hcp: 0 },
      { nome: "Martim Sousa de Morais",    fed: "41609", hcp: 0 },
      { nome: "Callum Ferguson",           fed: "55697", hcp: 0 },
      { nome: "Carolina Gaspar",           fed: "44581", hcp: 0 },
      { nome: "Luís Pinheiro Jr.",         fed: "46590",    hcp: 0 },
    ]},
    { grupo: "H", clube: "Lisbon Sports Club", jogadores: [
      { nome: "Francisco Anahory Assis",      fed: "46009", hcp: 0 },
      { nome: "Lourenço de Castro Fernandes", fed: "37633", hcp: 0 },
      { nome: "Ana Bianchi",                  fed: "36861",    hcp: 0 },
      { nome: "João Gomes",                   fed: "53715", hcp: 0 },
      { nome: "Francisca Vilela",             fed: "36700", hcp: 0 },
    ]},
    { grupo: "I", clube: "CityGolf", jogadores: [
      { nome: "Diogo Afonso",             fed: "45343", hcp: 0 },
      { nome: "Francisco Costa Mendes",   fed: "40318", hcp: 0 },
      { nome: "Pedro Aires",              fed: "42068", hcp: 0 },
    ]},
    { grupo: "J", clube: "Clube de Golf da Ilha Terceira", jogadores: [
      { nome: "Bia Sampaio Mesquita",              fed: "51937", hcp: 0 },
      { nome: "Madalena Alexandra Van Zeller",     fed: "47078", hcp: 0 },
      { nome: "João Lucas Fagundes",               fed: "44677", hcp: 0 },
      { nome: "Maria Fonseca Azevedo",             fed: "44019", hcp: 0 },
    ]},
  ],
  sub14: [
    { grupo: "A", clube: "Club de Golf de Miramar", jogadores: [
      { nome: "Santiago Dias",             fed: "42908", hcp: 0 },
      { nome: "Gaspard Maes",              fed: "51074", hcp: 0 },
      { nome: "Afonso Silva Pinto",        fed: "46309", hcp: 0 },
      { nome: "Maria Francisca Santos",    fed: "46853",    hcp: 0 },
      { nome: "Camila Pazos",              fed: "46297", hcp: 0 },
    ]},
    { grupo: "B", clube: "CG Vilamoura", jogadores: [
      { nome: "Rodrigo Sousa Correia",     fed: "44934", hcp: 0 },
      { nome: "João Setúbal",              fed: "43732", hcp: 0 },
      { nome: "Grace Gordon",              fed: "55270", hcp: 0 },
      { nome: "Salvador Ivo de Carvalho",  fed: "43968", hcp: 0 },
    ]},
    { grupo: "C", clube: "Clube de Golfe de Belas", jogadores: [
      { nome: "Filipe Pinheiro",           fed: "46591", hcp: 0 },
      { nome: "Frederico Almeida da Silva",fed: "41613", hcp: 0 },
      { nome: "Clara Trindade",            fed: "45812", hcp: 0 },
      { nome: "Ryan Dantas",               fed: "45439", hcp: 0 },
      { nome: "Martim Moreira",            fed: "42985", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
      { nome: "Pedro Costa Alemão",        fed: "46706", hcp: 0 },
      { nome: "Ruiqi Li",                  fed: "49076", hcp: 0 },
      { nome: "Nuno Palmares Jr.",         fed: "49124", hcp: 0 },
      { nome: "Ricardo Castro Ferreira",   fed: "49085",    hcp: 0 },
      { nome: "João Rocha",                fed: "48297", hcp: 0 },
    ]},
    { grupo: "E", clube: "Club de Golf de Miramar B", jogadores: [
      { nome: "Tomás Rente",               fed: "46311", hcp: 0 },
      { nome: "Margarida Silva Pinto",     fed: "46310", hcp: 0 },
      { nome: "Francisco Nunes (jr)",      fed: "46299", hcp: 0 },
      { nome: "Raul Pazos (jr)",           fed: "46296",    hcp: 0 },
      { nome: "João Balixa",               fed: "46038", hcp: 0 },
    ]},
    { grupo: "F", clube: "CG Vilamoura B", jogadores: [
      { nome: "Finn Gordon",               fed: "55269", hcp: 0 },
      { nome: "Catarina Sousa Conceição",  fed: "48794", hcp: 0 },
      { nome: "Tomás Lima Pinto",          fed: "46037", hcp: 0 },
      { nome: "Sabrina Ribeiro Crisóstomo",fed: "48971", hcp: 0 },
    ]},
    { grupo: "G", clube: "CityGolf", jogadores: [
      { nome: "João Araújo",               fed: "49012", hcp: 0 },
      { nome: "Marc Costa",                fed: "46308", hcp: 0 },
      { nome: "Afonso Paiva Gonçalves",    fed: "47819", hcp: 0 },
      { nome: "João Pedro Frade",          fed: "45424", hcp: 0 },
      { nome: "Diogo Lima",                fed: "49717", hcp: 0 },
    ]},
    { grupo: "H", clube: "Oporto Golf Clube", jogadores: [
      { nome: "Dinis Seabra",              fed: "44821", hcp: 0 },
      { nome: "Diogo Guilherme",           fed: "56632", hcp: 0 },
      { nome: "Sebastião Soares",          fed: "47341", hcp: 0 },
      { nome: "Francisco Saraiva",         fed: "39097", hcp: 0 },
      { nome: "Afonso de Sousa Pinto",     fed: "46480", hcp: 0 },
    ]},
    { grupo: "I", clube: "Estela Golf Club", jogadores: [
      { nome: "Afonso Poiarez",                              fed: "46079", hcp: 0 },
      { nome: "António R. P. Monteiro",                      fed: "55094", hcp: 0 },
      { nome: "Afonso Polery",                               fed: "55093", hcp: 0 },
      { nome: "Julio Brito",                                 fed: "55092", hcp: 0 },
    ]},
    { grupo: "J", clube: "Santo Serra Golf Club", jogadores: [
      { nome: "Manuel Goulartt Medeiros",  fed: "52884", hcp: 0 },
      { nome: "Mateus Penucho",            fed: "52393", hcp: 0 },
      { nome: "Gonçalo Gouveia",           fed: "50398", hcp: 0 },
    ]},
    { grupo: "K", clube: "Lisbon Sports Club", jogadores: [
      { nome: "David Stocksreiter Ferreira",fed: "48164", hcp: 0 },
      { nome: "Francisco Trinité",          fed: "52044", hcp: 0 },
      { nome: "David Filip",                fed: "51949",    hcp: 0 },
      { nome: "Filipe Delicado",            fed: "53124", hcp: 0 },
      { nome: "Diogo Vaz Pinto Jr.",        fed: "51432", hcp: 0 },
    ]},
  ],
};

/** Lookup de grupos por ano — adicionar anos futuros aqui */
export const CLUBES_GRUPOS_BY_YEAR: Record<string, Record<"sub14" | "sub18", GrupoEntry[]>> = {
  "2026": CLUBES_GRUPOS,
  "2025": CLUBES_GRUPOS_2025,
  "2024": {
    sub14: [
      { grupo: "A", clube: "CG Vilamoura A", jogadores: [
        { nome: "Martim Pinto Johansen",       fed: "40115", hcp: 0 },
        { nome: "Francisco Reis",              fed: "40534", hcp: 0 },
        { nome: "Brooks Barker",               fed: "43359", hcp: 0 },
        { nome: "Rodrigo Sousa Correia",       fed: "44934", hcp: 0 },
      ]},
      { grupo: "B", clube: "Club de Golf de Miramar Azul", jogadores: [
        { nome: "João Alvim",                  fed: "45340", hcp: 0 },
        { nome: "Santiago Dias",               fed: "42908", hcp: 0 },
        { nome: "Francisca Ferreira da Costa", fed: "40981", hcp: 0 },
        { nome: "Gaspard Maes",                fed: "51074",    hcp: 0 },
        { nome: "Henrique Ferreira da Costa",  fed: "41080", hcp: 0 },
      ]},
      { grupo: "C", clube: "CG Vilamoura B", jogadores: [
        { nome: "Grace Gordon",                fed: "55270", hcp: 0 },
        { nome: "Finn Gordon",                 fed: "55269", hcp: 0 },
        { nome: "Salvador Ivo de Carvalho",    fed: "43968", hcp: 0 },
        { nome: "Tomás Lima Pinto",            fed: "46037", hcp: 0 },
      ]},
      { grupo: "D", clube: "Club de Golf de Miramar Branco", jogadores: [
        { nome: "Margarida Alves",             fed: "45499", hcp: 0 },
        { nome: "Camila Pazos",                fed: "46297", hcp: 0 },
        { nome: "Maria Francisca Santos",      fed: "46853", hcp: 0 },
        { nome: "Raul Pazos (jr)",             fed: "46296",    hcp: 0 },
        { nome: "Francisco Nunes (jr)",        fed: "46299", hcp: 0 },
      ]},
      { grupo: "E", clube: "Clube de Golfe Citynorte", jogadores: [
        { nome: "Afonso Silva Pinto",          fed: "46309", hcp: 0 },
        { nome: "Francisco Saraiva",           fed: "39097", hcp: 0 },
        { nome: "Tomás Rente",                 fed: "46311", hcp: 0 },
        { nome: "Margarida Silva Pinto",       fed: "46310", hcp: 0 },
      ]},
      { grupo: "F", clube: "Clube de Golfe de Belas", jogadores: [
        { nome: "Filipe Pinheiro",             fed: "46591", hcp: 0 },
        { nome: "Frederico Almeida da Silva",  fed: "41613", hcp: 0 },
        { nome: "Martim Moreira",              fed: "42985", hcp: 0 },
        { nome: "João Rocha",                  fed: "48297", hcp: 0 },
      ]},
      { grupo: "G", clube: "Oporto Golf Clube", jogadores: [
        { nome: "Eva Silva",                   fed: "46437", hcp: 0 },
        { nome: "Gonçalo Maia",                fed: "46395", hcp: 0 },
        { nome: "Afonso de Sousa Pinto",       fed: "46480", hcp: 0 },
        { nome: "Dinis Seabra",                fed: "44821", hcp: 0 },
      ]},
    ],
    sub18: [
      { grupo: "A", clube: "Aroeira Golf Club", jogadores: [
        { nome: "Inês Belchior",               fed: "38424", hcp: 0 },
        { nome: "Rodrigo Marques Santos",      fed: "37152", hcp: 0 },
        { nome: "António Teixeira e Costa",    fed: "37680", hcp: 0 },
        { nome: "Pedro Santos Pereira",        fed: "46577", hcp: 0 },
      ]},
      { grupo: "B", clube: "Oporto Golf Clube A", jogadores: [
        { nome: "Francisca Rocha",             fed: "40958", hcp: 0 },
        { nome: "Luis António Silva",          fed: "42845", hcp: 0 },
        { nome: "Henrique Montenegro",         fed: "39552", hcp: 0 },
        { nome: "André Neto Lopes",            fed: "41173",    hcp: 0 },
        { nome: "Guilherme Grabner Moreira",   fed: "42205", hcp: 0 },
      ]},
      { grupo: "C", clube: "Club de Golf de Miramar", jogadores: [
        { nome: "Diogo Silva Pinto Rocha",     fed: "34186", hcp: 0 },
        { nome: "Bernardo Costa Pinheiro",     fed: "40682", hcp: 0 },
        { nome: "Miguel Silveira",             fed: "35404", hcp: 0 },
        { nome: "Tomás Afonso Araujo",         fed: "35849",    hcp: 0 },
        { nome: "Duarte Gonçalves",            fed: "35814", hcp: 0 },
      ]},
      { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
        { nome: "Konstantin Mikirtumov",       fed: "34238", hcp: 0 },
        { nome: "José Miguel Franco de Sousa", fed: "40112", hcp: 0 },
        { nome: "Leonardo Miguel Tilly Alves", fed: "44453", hcp: 0 },
        { nome: "Reuben Thapa",                fed: "47552", hcp: 0 },
      ]},
      { grupo: "E", clube: "CG Vilamoura", jogadores: [
        { nome: "Tiago Abrantes",              fed: "38315", hcp: 0 },
        { nome: "João Crasi Alves",            fed: "39701", hcp: 0 },
        { nome: "Dinis Silva Rebelo",          fed: "36678", hcp: 0 },
        { nome: "João Maria Ivo de Carvalho",  fed: "38334", hcp: 0 },
      ]},
      { grupo: "F", clube: "Oporto Golf Clube B", jogadores: [
        { nome: "Pedro Ferreira",              fed: "43810", hcp: 0 },
        { nome: "Miguel Dinis Ferreira",       fed: "41744", hcp: 0 },
        { nome: "Simão Oliveira",              fed: "47002", hcp: 0 },
        { nome: "Teresa Ferreira",             fed: "46589", hcp: 0 },
      ]},
      { grupo: "G", clube: "Clube de Golfe Citynorte", jogadores: [
        { nome: "Diogo Marques Lopes",         fed: "35874", hcp: 0 },
        { nome: "Pedro Aires",                 fed: "42068", hcp: 0 },
        { nome: "Diogo Afonso",                fed: "45343", hcp: 0 },
        { nome: "Diogo Vieira",                fed: "45475", hcp: 0 },
      ]},
      { grupo: "H", clube: "Clube de Golfe de Belas", jogadores: [
        { nome: "Sebastião Cadete",            fed: "43972", hcp: 0 },
        { nome: "Ricardo Morna",               fed: "39899", hcp: 0 },
        { nome: "Pedro Castro Mendes",         fed: "44561", hcp: 0 },
        { nome: "Henrique Almeida da Silva",   fed: "41612", hcp: 0 },
      ]},
      { grupo: "I", clube: "Vale de Janelas Golf Club", jogadores: [
        { nome: "Francisca Salgado",           fed: "43832", hcp: 0 },
        { nome: "Mafalda Bandeira",            fed: "46646", hcp: 0 },
        { nome: "Marie Pinto da Cunha",        fed: "48049", hcp: 0 },
        { nome: "Maximilian Hermelin",         fed: "46434", hcp: 0 },
      ]},
      { grupo: "J", clube: "Lisbon Sports Club", jogadores: [
        { nome: "Lourenço de Castro Fernandes",fed: "37633", hcp: 0 },
        { nome: "Vasco Dias Agudo",            fed: "36810", hcp: 0 },
        { nome: "Ana Bianchi",                 fed: "36861", hcp: 0 },
        { nome: "Joaquim Gomes",               fed: "53714", hcp: 0 },
      ]},
      { grupo: "K", clube: "Clube de Golf da Ilha Terceira", jogadores: [
        { nome: "Bia Sampaio Mesquita",              fed: "51937", hcp: 0 },
        { nome: "Madalena Alexandra Van Zeller",     fed: "47078", hcp: 0 },
        { nome: "Maria Fonseca Azevedo",             fed: "44019", hcp: 0 },
        { nome: "João Lucas Fagundes",               fed: "44677", hcp: 0 },
      ]},
    ],
  },
};
