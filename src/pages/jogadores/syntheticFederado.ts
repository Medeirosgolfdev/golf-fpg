/**
 * src/pages/jogadores/syntheticFederado.ts
 *
 * Construtores de FederadoRaw sintéticos — permitem renderizar a vista
 * federado (FederadoOnlyDetail) para jogadores que não existem em
 * federados.json (fed codes históricos/externos) ou para os "Nossos"
 * (que não têm registo raw anexado).
 */
import type { Player } from "../../data/types";
import type { FederadoRaw } from "../../data/federadosLoader";

/** Constrói um FederadoRaw vazio a partir SÓ do fed code — para quando o
 *  utilizador chega via /jogadores/{fed}?view=federado mas o fed code não
 *  existe nem em allPlayers nem em federados.json (jogador inactivo histórico
 *  ou novo). A ficha live (rondas WHS) funciona porque só precisa do
 *  federation_code; o cadastro fica todo a vazio até a chamada live trazer
 *  algum dado. */
export function syntheticFederadoFromFedCode(fed: string): FederadoRaw {
  return {
    federation_code:    fed,
    federation_number:  fed.padStart(7, "0"),
    name:               "",
    gender:             "",
    birthdate:          null,
    admission_date:     null,
    club_code:          "",
    club_name:          "",
    acronym:            "",
    country_prefix:     "PT",
    country:            "Portugal",
    hcp_exact:          null,
    hcp_index:          null,
    hcp_status:         "",
    hcp_status_id:      0,
    hcp_type:           "",
    age_level:          "",
    age_level_id:       0,
    player_type:        "",
    player_type_id:     0,
    federated_status:   "",
    federated_status_id: 0,
    rounds_current_year: 0,
    photo:              null,
    last_hcp_date:      null,
    encryptedfedcode:   "",
  };
}

/** Constrói um FederadoRaw mínimo a partir de um Player "Nossos" — para
 *  poder renderizar FederadoOnlyDetail no modo "ver como federado". Os campos
 *  ausentes são preenchidos de forma neutra; o cadastro fica esparso mas a
 *  ficha live (rondas WHS) funciona porque só precisa do federation_code. */
export function syntheticFederadoFromPlayer(p: { fed: string } & Player): FederadoRaw {
  const clubName = typeof p.club === "string" ? p.club : (p.club?.long || p.club?.short || "");
  const acronym  = typeof p.club === "string" ? p.club : (p.club?.short || "");
  const clubCode = typeof p.club === "object" && p.club?.code ? String(p.club.code) : "";
  return {
    federation_code:    p.fed,
    federation_number:  p.fed.padStart(7, "0"),
    name:               p.name,
    gender:             p.sex || "",
    birthdate:          p.dob || null,
    admission_date:     null,
    club_code:          clubCode,
    club_name:          clubName,
    acronym,
    country_prefix:     "PT",
    country:            "Portugal",
    hcp_exact:          p.hcp ?? null,
    hcp_index:          p.hcp ?? null,
    hcp_status:         "",
    hcp_status_id:      0,
    hcp_type:           "",
    age_level:          p.escalao || "",
    age_level_id:       0,
    player_type:        "",
    player_type_id:     0,
    federated_status:   "",
    federated_status_id: 0,
    rounds_current_year: 0,
    photo:              null,
    last_hcp_date:      null,
    encryptedfedcode:   "",
  };
}
