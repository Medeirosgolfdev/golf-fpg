// ─────────────────────────────────────────────────────────────────────
// Browser console script: descarrega admissions + draws de ~333 torneios
// FPG (Jovens 2022-2025 + Drive/Aquapor 2026 + Nacional 2026).
//
// ⚠ CORS — TEM DE CORRER EM 2 TABS DIFERENTES:
//   O script detecta a origem actual e faz apenas o que consegue:
//   • Tab em scoring.datagolf.pt  → ADMISSIONS  (→ fpg-admissions-new.json)
//   • Tab em scoring-pt.datagolf.pt → DRAWS      (→ fpg-draws-new.json)
//
// COMO USAR:
//   PASSO 1 (admissions):
//     1. Abre Chrome em https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T
//        (deixa fazer redirect para scoring.datagolf.pt)
//     2. F12 → Console → cola este ficheiro → Enter
//     3. Descarrega fpg-admissions-new.json → copia para public/data/
//
//   PASSO 2 (draws):
//     1. Abre OUTRO tab em qualquer URL directo do tipo:
//        https://scoring-pt.datagolf.pt/scripts/draw.asp?club=000&tourn=10941&round_number=1&LANG_TXT=PT&ack=XH256YF45T
//        (URLs scripts/draw.asp não redirecionam)
//     2. F12 → Console → cola este mesmo ficheiro → Enter
//     3. Descarrega fpg-draws-new.json → copia para public/data/
//
//   PASSO 3 (merge local):
//     node scripts/merge-fpg-admissions-draws.js
//     → preserva dados bons existentes, rejeita _suspect, preenche gaps
//
// Drive/Aquapor 2025 (~154) ficam para scrape separado por serem muitos.
//
// DETECÇÃO DE REUTILIZAÇÃO DE TCODE:
//   Se a data do HTML não bater com o ano esperado → _suspect:true.
//   O merge nunca substitui dados válidos por suspect.
// ─────────────────────────────────────────────────────────────────────

(async () => {

  // ═══════════════════════════════════════════════════════
  // SCOPE — 333 torneios (Jovens 2022-2025 + Drive/Aquapor 2025-2026 + Finais + Nacional 2026)
  // ═══════════════════════════════════════════════════════
  const TORNEIOS = [{"ccode":"910","tcode":"10109","name":"Camp Norte Jovens 2022 - Sub14","date":"2022-07-10","expectedYear":"2022"},{"ccode":"910","tcode":"10108","name":"Camp Norte Jovens 2022 - Sub12","date":"2022-07-10","expectedYear":"2022"},{"ccode":"910","tcode":"10107","name":"Camp Norte Jovens 2022 - Sub10","date":"2022-07-10","expectedYear":"2022"},{"ccode":"910","tcode":"10106","name":"Camp Norte Jovens 2022 - Sub25","date":"2022-07-18","expectedYear":"2022"},{"ccode":"910","tcode":"10105","name":"Camp Norte Jovens 2022 - Sub18","date":"2022-07-18","expectedYear":"2022"},{"ccode":"910","tcode":"10104","name":"Camp Norte Jovens 2022 - Sub16","date":"2022-07-18","expectedYear":"2022"},{"ccode":"988","tcode":"10158","name":"Final Nacional Drive Challenge 2022","date":"2022-10-29","expectedYear":"2022"},{"ccode":"000","tcode":"10579","name":"Grande Final Drive Tour CN Jovens Sub18 S","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10578","name":"Grande Final Drive Tour CN Jovens Sub18 H","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10577","name":"Grande Final Drive Tour CN Jovens Sub16 S","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10576","name":"Grande Final Drive Tour CN Jovens Sub16 H","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10575","name":"Grande Final Drive Tour CN Jovens Sub14 S","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10574","name":"Grande Final Drive Tour CN Jovens Sub14 H","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10573","name":"Grande Final Drive Tour CN Jovens Sub12 S","date":"2022-11-12","expectedYear":"2022"},{"ccode":"000","tcode":"10572","name":"Grande Final Drive Tour CN Jovens Sub12 H","date":"2022-11-12","expectedYear":"2022"},{"ccode":"051","tcode":"10388","name":"Camp. Regional de Jovens- Sub 18","date":"2023-04-03","expectedYear":"2023"},{"ccode":"051","tcode":"10387","name":"Camp. Regional de Jovens- Sub 16","date":"2023-04-03","expectedYear":"2023"},{"ccode":"051","tcode":"10386","name":"Camp. Regional de Jovens- Sub 14","date":"2023-04-03","expectedYear":"2023"},{"ccode":"051","tcode":"10385","name":"Camp. Regional de Jovens- Sub 12","date":"2023-04-03","expectedYear":"2023"},{"ccode":"051","tcode":"10384","name":"Camp. Regional de Jovens- Sub 10","date":"2023-04-03","expectedYear":"2023"},{"ccode":"910","tcode":"10115","name":"Camp Norte Jovens 2023 - Sub25 a Sub16","date":"2023-07-10","expectedYear":"2023"},{"ccode":"910","tcode":"10120","name":"Camp Norte Jovens 2023 - Sub14","date":"2023-09-03","expectedYear":"2023"},{"ccode":"910","tcode":"10119","name":"Camp Norte Jovens 2023 - Sub12","date":"2023-09-03","expectedYear":"2023"},{"ccode":"910","tcode":"10118","name":"Camp Norte Jovens 2023 - Sub10","date":"2023-09-03","expectedYear":"2023"},{"ccode":"988","tcode":"10190","name":"Final Nacional Drive Challenge 2023 - Sub10","date":"2023-10-28","expectedYear":"2023"},{"ccode":"988","tcode":"10189","name":"Final Nacional Drive Challenge 2023","date":"2023-10-28","expectedYear":"2023"},{"ccode":"000","tcode":"10689","name":"Grande Final Drive Tour CN Jovens - Sub18 S","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10688","name":"Grande Final Drive Tour CN Jovens - Sub18 H","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10687","name":"Grande Final Drive Tour CN Jovens - Sub16 S","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10686","name":"Grande Final Drive Tour CN Jovens - Sub16 H","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10685","name":"Grande Final Drive Tour CN Jovens - Sub14 S","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10684","name":"Grande Final Drive Tour CN Jovens - Sub14 H","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10683","name":"Grande Final Drive Tour CN Jovens - Sub12 S","date":"2023-11-04","expectedYear":"2023"},{"ccode":"000","tcode":"10682","name":"Grande Final Drive Tour CN Jovens - Sub12 H","date":"2023-11-04","expectedYear":"2023"},{"ccode":"007","tcode":"10675","name":"Campeonato Regional de Jovens Sub 14-24 Dia1","date":"2023-11-18","expectedYear":"2023"},{"ccode":"007","tcode":"10674","name":"Campeonato Regional de Jovens Sub10&12 Dia1","date":"2023-11-18","expectedYear":"2023"},{"ccode":"007","tcode":"10677","name":"Campeonato Regional de Jovens Sub 14-24 Dia 2","date":"2023-11-19","expectedYear":"2023"},{"ccode":"007","tcode":"10676","name":"Campeonato Regional de Jovens Sub10&12 Dia 2","date":"2023-11-19","expectedYear":"2023"},{"ccode":"051","tcode":"10452","name":"Campeonato Regional Jovens Sub-10","date":"2024-05-31","expectedYear":"2024"},{"ccode":"051","tcode":"10451","name":"Campeonato Regional Jovens Sub-12","date":"2024-05-31","expectedYear":"2024"},{"ccode":"051","tcode":"10450","name":"Campeonato Regional Jovens Sub-14","date":"2024-05-31","expectedYear":"2024"},{"ccode":"051","tcode":"10449","name":"Campeonato Regional Jovens Sub-16","date":"2024-05-31","expectedYear":"2024"},{"ccode":"051","tcode":"10448","name":"Campeonato Regional Jovens Sub-18","date":"2024-05-31","expectedYear":"2024"},{"ccode":"910","tcode":"10133","name":"Camp Norte Jovens 2024 - Sub14","date":"2024-06-17","expectedYear":"2024"},{"ccode":"910","tcode":"10132","name":"Camp Norte Jovens 2024 - Sub12","date":"2024-06-17","expectedYear":"2024"},{"ccode":"910","tcode":"10131","name":"Camp Norte Jovens 2024 - Sub10","date":"2024-06-17","expectedYear":"2024"},{"ccode":"000","tcode":"10773","name":"Campeonato Nacional Sub 10 - 2024 - Raparigas","date":"2024-06-24","expectedYear":"2024"},{"ccode":"000","tcode":"10772","name":"Campeonato Nacional Sub 10 - 2024 - Rapazes","date":"2024-06-24","expectedYear":"2024"},{"ccode":"000","tcode":"10771","name":"Campeonato Nacional Sub 12 2024 - Raparigas","date":"2024-06-24","expectedYear":"2024"},{"ccode":"000","tcode":"10770","name":"Campeonato Nacional Sub 12 2024 - Rapazes","date":"2024-06-24","expectedYear":"2024"},{"ccode":"988","tcode":"10225","name":"Final Nacional Drive Challenge","date":"2024-10-12","expectedYear":"2024"},{"ccode":"988","tcode":"10224","name":"Final Nacional Drive Challenge 2024","date":"2024-10-12","expectedYear":"2024"},{"ccode":"000","tcode":"10808","name":"Final Nacional Drive Tour Sub-25 H","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10807","name":"Final Nacional Drive Tour Sub-18 S","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10806","name":"Final Nacional Drive Tour Sub-18 H","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10805","name":"Final Nacional Drive Tour Sub 16 S","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10804","name":"Final Nacional Drive Tour Sub-16 H","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10803","name":"Final Nacional Drive Tour Sub-14 S","date":"2024-11-23","expectedYear":"2024"},{"ccode":"000","tcode":"10802","name":"Final Nacional Drive Tour Sub-14 H","date":"2024-11-23","expectedYear":"2024"},{"ccode":"059","tcode":"10554","name":"Campeonato Regional de Jovens - Sub 10 e Sub 12","date":"2024-11-30","expectedYear":"2024"},{"ccode":"059","tcode":"10553","name":"Campeonato Regional de Jovens - Sub 14 a Sub 24","date":"2024-12-01","expectedYear":"2024"},{"ccode":"000","tcode":"10870","name":"Campeonato Nacional de Jovens Sub 14 S","date":"2025-04-24","expectedYear":"2025"},{"ccode":"000","tcode":"10869","name":"Campeonato Nacional de Jovens Sub 14 H","date":"2025-04-24","expectedYear":"2025"},{"ccode":"000","tcode":"10868","name":"Campeonato Nacional de Jovens Sub 16 S","date":"2025-04-24","expectedYear":"2025"},{"ccode":"000","tcode":"10867","name":"Campeonato Nacional de Jovens Sub 16 H","date":"2025-04-24","expectedYear":"2025"},{"ccode":"000","tcode":"10866","name":"Campeonato Nacional de Jovens Sub 18 S","date":"2025-04-24","expectedYear":"2025"},{"ccode":"000","tcode":"10865","name":"Campeonato Nacional de Jovens Sub 18 H","date":"2025-04-24","expectedYear":"2025"},{"ccode":"988","tcode":"10256","name":"Campeonato Nacional de Jovens Sub 10 H","date":"2025-06-27","expectedYear":"2025"},{"ccode":"988","tcode":"10255","name":"Campeonato Nacional de Jovens Sub 12 S","date":"2025-06-27","expectedYear":"2025"},{"ccode":"988","tcode":"10254","name":"Campeonato Nacional de Jovens Sub 12 H","date":"2025-06-27","expectedYear":"2025"},{"ccode":"005","tcode":"10305","name":"Campeonato Regional de Jovens 2025 Sub-18","date":"2025-07-10","expectedYear":"2025"},{"ccode":"005","tcode":"10304","name":"Campeonato Regional de Jovens 2025 Sub-16","date":"2025-07-10","expectedYear":"2025"},{"ccode":"005","tcode":"10303","name":"Campeonato Regional de Jovens 2025 Sub-14","date":"2025-07-10","expectedYear":"2025"},{"ccode":"005","tcode":"10302","name":"Campeonato Regional de Jovens 2025 Sub-12","date":"2025-07-10","expectedYear":"2025"},{"ccode":"005","tcode":"10301","name":"Campeonato Regional de Jovens 2025 Sub-10","date":"2025-07-10","expectedYear":"2025"},{"ccode":"988","tcode":"10262","name":"Final Nacional Drive Challenge 2025","date":"2025-10-11","expectedYear":"2025"},{"ccode":"988","tcode":"10261","name":"Final Nacional Drive Challenge Sub 10","date":"2025-10-11","expectedYear":"2025"},{"ccode":"000","tcode":"10647","name":"Campeonato Nacional de Sub10 - H","date":"2023-07-04","expectedYear":"2023"},{"ccode":"003","tcode":"10478","name":"Miramar Internacional Open U25 ( Sub10)","date":"2024-08-26","expectedYear":"2024"},{"ccode":"000","tcode":"10825","name":"Campeonato Nacional de Clubes Sub 14","date":"2025-04-14","expectedYear":"2025"},{"ccode":"003","tcode":"10565","name":"Miramar Internacional Open - sub 10","date":"2025-08-19","expectedYear":"2025"},{"ccode":"000","tcode":"10873","name":"1º Torneio do Circuito Aquapor-Morgado Golf","date":"2026-01-17","expectedYear":"2026"},{"ccode":"000","tcode":"10875","name":"2º Torneio do Circuito Aquapor - Qtª do Peru","date":"2026-03-14","expectedYear":"2026"},{"ccode":"982","tcode":"10198","name":"1º Torneio Drive Tour Madeira - Palheiro Golf","date":"2026-01-03","expectedYear":"2026"},{"ccode":"982","tcode":"10206","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 16","date":"2026-01-04","expectedYear":"2026"},{"ccode":"982","tcode":"10205","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 18","date":"2026-01-04","expectedYear":"2026"},{"ccode":"982","tcode":"10204","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 14","date":"2026-01-04","expectedYear":"2026"},{"ccode":"982","tcode":"10203","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 12","date":"2026-01-04","expectedYear":"2026"},{"ccode":"982","tcode":"10202","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 10","date":"2026-01-04","expectedYear":"2026"},{"ccode":"985","tcode":"10202","name":"1º Torneio Drive Tour Tejo – Montado","date":"2026-01-04","expectedYear":"2026"},{"ccode":"987","tcode":"10206","name":"1º Torneio Drive Tour Norte – Estela GC","date":"2026-01-04","expectedYear":"2026"},{"ccode":"988","tcode":"10292","name":"1º Torneio Drive Tour Sul – Laguna G.C.","date":"2026-01-11","expectedYear":"2026"},{"ccode":"983","tcode":"10149","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-01-24","expectedYear":"2026"},{"ccode":"983","tcode":"10148","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-01-24","expectedYear":"2026"},{"ccode":"983","tcode":"10147","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-01-24","expectedYear":"2026"},{"ccode":"983","tcode":"10146","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-01-24","expectedYear":"2026"},{"ccode":"983","tcode":"10145","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-01-24","expectedYear":"2026"},{"ccode":"988","tcode":"10293","name":"2º Torneio Drive Tour Sul – Vila Sol","date":"2026-02-01","expectedYear":"2026"},{"ccode":"982","tcode":"10199","name":"2º Torneio Drive Tour Madeira - Santo da Serra","date":"2026-02-07","expectedYear":"2026"},{"ccode":"982","tcode":"10211","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2026-02-08","expectedYear":"2026"},{"ccode":"982","tcode":"10210","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub16","date":"2026-02-08","expectedYear":"2026"},{"ccode":"982","tcode":"10209","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2026-02-08","expectedYear":"2026"},{"ccode":"982","tcode":"10208","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2026-02-08","expectedYear":"2026"},{"ccode":"982","tcode":"10207","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2026-02-08","expectedYear":"2026"},{"ccode":"988","tcode":"10300","name":"2º Torneio Drive Challenge Sul - Laguna G C Sub 16","date":"2026-02-21","expectedYear":"2026"},{"ccode":"988","tcode":"10297","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 18","date":"2026-02-21","expectedYear":"2026"},{"ccode":"988","tcode":"10296","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 14","date":"2026-02-21","expectedYear":"2026"},{"ccode":"988","tcode":"10295","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 12","date":"2026-02-21","expectedYear":"2026"},{"ccode":"988","tcode":"10294","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 10","date":"2026-02-21","expectedYear":"2026"},{"ccode":"985","tcode":"10215","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 18","date":"2026-02-22","expectedYear":"2026"},{"ccode":"985","tcode":"10214","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 16","date":"2026-02-22","expectedYear":"2026"},{"ccode":"985","tcode":"10213","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 14","date":"2026-02-22","expectedYear":"2026"},{"ccode":"985","tcode":"10212","name":"2º Torneio Drive Challenge Tejo-Montado- Sub 12","date":"2026-02-22","expectedYear":"2026"},{"ccode":"985","tcode":"10211","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 10","date":"2026-02-22","expectedYear":"2026"},{"ccode":"983","tcode":"10154","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-02-28","expectedYear":"2026"},{"ccode":"983","tcode":"10153","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-02-28","expectedYear":"2026"},{"ccode":"983","tcode":"10152","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-02-28","expectedYear":"2026"},{"ccode":"983","tcode":"10151","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-02-28","expectedYear":"2026"},{"ccode":"983","tcode":"10150","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-02-28","expectedYear":"2026"},{"ccode":"987","tcode":"10208","name":"3º Torneio Drive Tour Norte – Vale Pisão","date":"2026-02-28","expectedYear":"2026"},{"ccode":"982","tcode":"10200","name":"3º Torneio Drive Tour Madeira - Palheiro Golf","date":"2026-03-07","expectedYear":"2026"},{"ccode":"982","tcode":"10226","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2026-03-08","expectedYear":"2026"},{"ccode":"982","tcode":"10225","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2026-03-08","expectedYear":"2026"},{"ccode":"982","tcode":"10224","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub16","date":"2026-03-08","expectedYear":"2026"},{"ccode":"982","tcode":"10223","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2026-03-08","expectedYear":"2026"},{"ccode":"982","tcode":"10222","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2026-03-08","expectedYear":"2026"},{"ccode":"985","tcode":"10220","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 18","date":"2026-03-21","expectedYear":"2026"},{"ccode":"985","tcode":"10219","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 16","date":"2026-03-21","expectedYear":"2026"},{"ccode":"985","tcode":"10218","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 14","date":"2026-03-21","expectedYear":"2026"},{"ccode":"985","tcode":"10217","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 12","date":"2026-03-21","expectedYear":"2026"},{"ccode":"985","tcode":"10216","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 10","date":"2026-03-21","expectedYear":"2026"},{"ccode":"983","tcode":"10155","name":"1º Torneio Drive Tour Terceira","date":"2026-03-22","expectedYear":"2026"},{"ccode":"988","tcode":"10301","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 16","date":"2026-03-22","expectedYear":"2026"},{"ccode":"988","tcode":"10271","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 18","date":"2026-03-22","expectedYear":"2026"},{"ccode":"988","tcode":"10270","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 14","date":"2026-03-22","expectedYear":"2026"},{"ccode":"988","tcode":"10269","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 12","date":"2026-03-22","expectedYear":"2026"},{"ccode":"988","tcode":"10268","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 10","date":"2026-03-22","expectedYear":"2026"},{"ccode":"985","tcode":"10204","name":"3º Torneio Drive Tour Tejo – Santo Estêvão","date":"2026-03-28","expectedYear":"2026"},{"ccode":"987","tcode":"10224","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 18","date":"2026-03-29","expectedYear":"2026"},{"ccode":"987","tcode":"10223","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 16","date":"2026-03-29","expectedYear":"2026"},{"ccode":"987","tcode":"10222","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 14","date":"2026-03-29","expectedYear":"2026"},{"ccode":"987","tcode":"10221","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 12","date":"2026-03-29","expectedYear":"2026"},{"ccode":"987","tcode":"10220","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 10","date":"2026-03-29","expectedYear":"2026"},{"ccode":"988","tcode":"10308","name":"3º Torneio do Circuito Drive Tour - Quinta do Vale","date":"2026-04-03","expectedYear":"2026"},{"ccode":"983","tcode":"10168","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-04-06","expectedYear":"2026"},{"ccode":"983","tcode":"10167","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-04-06","expectedYear":"2026"},{"ccode":"983","tcode":"10166","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-04-06","expectedYear":"2026"},{"ccode":"983","tcode":"10165","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-04-06","expectedYear":"2026"},{"ccode":"983","tcode":"10164","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-04-06","expectedYear":"2026"},{"ccode":"983","tcode":"10156","name":"2º Torneio Drive Tour Terceira","date":"2026-04-07","expectedYear":"2026"},{"ccode":"983","tcode":"10163","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-04-08","expectedYear":"2026"},{"ccode":"983","tcode":"10162","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-04-08","expectedYear":"2026"},{"ccode":"983","tcode":"10161","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-04-08","expectedYear":"2026"},{"ccode":"983","tcode":"10160","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-04-08","expectedYear":"2026"},{"ccode":"983","tcode":"10159","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-04-08","expectedYear":"2026"},{"ccode":"982","tcode":"10201","name":"4º Torneio Drive Tour Madeira – Porto Santo Golfe","date":"2026-04-10","expectedYear":"2026"},{"ccode":"988","tcode":"10302","name":"4º Torneio Drive Challenge Sul–Penina-Sub16","date":"2026-04-10","expectedYear":"2026"},{"ccode":"988","tcode":"10275","name":"4º Torneio Drive Challenge Sul–Penina-Sub18","date":"2026-04-10","expectedYear":"2026"},{"ccode":"988","tcode":"10274","name":"4º Torneio Drive Challenge Sul–Penina-Sub14","date":"2026-04-10","expectedYear":"2026"},{"ccode":"988","tcode":"10273","name":"4º Torneio Drive Challenge Sul–Penina-Sub12","date":"2026-04-10","expectedYear":"2026"},{"ccode":"988","tcode":"10272","name":"4º Torneio Drive Challenge Sul–Penina-Sub10","date":"2026-04-10","expectedYear":"2026"},{"ccode":"982","tcode":"10221","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 18","date":"2026-04-11","expectedYear":"2026"},{"ccode":"982","tcode":"10220","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 16","date":"2026-04-11","expectedYear":"2026"},{"ccode":"982","tcode":"10219","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 14","date":"2026-04-11","expectedYear":"2026"},{"ccode":"982","tcode":"10218","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 12","date":"2026-04-11","expectedYear":"2026"},{"ccode":"982","tcode":"10217","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 10","date":"2026-04-11","expectedYear":"2026"},{"ccode":"985","tcode":"10205","name":"4º Torneio Drive Tour Tejo – Lisbon SC","date":"2026-04-11","expectedYear":"2026"},{"ccode":"000","tcode":"10935","name":"Campeonato Nacional Jovens 10935","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10936","name":"Campeonato Nacional Jovens 10936","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10937","name":"Campeonato Nacional Jovens 10937","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10938","name":"Campeonato Nacional Jovens 10938","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10939","name":"Campeonato Nacional Jovens 10939","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10940","name":"Campeonato Nacional Jovens 10940","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10941","name":"Campeonato Nacional Jovens 10941","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10942","name":"Campeonato Nacional Jovens 10942","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10943","name":"Campeonato Nacional Jovens 10943","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10944","name":"Campeonato Nacional Jovens 10944","date":"2026-05-01","expectedYear":"2026"},{"ccode":"000","tcode":"10839","name":"Campeonato Nacional de Jovens Sub 12 2025","date":"2025-06-01","expectedYear":"2025"},{"ccode":"000","tcode":"10840","name":"Campeonato Nacional de Jovens Sub 12 F 2025","date":"2025-06-01","expectedYear":"2025"},{"ccode":"000","tcode":"10841","name":"Campeonato Nacional de Jovens Sub 10 2025","date":"2025-06-01","expectedYear":"2025"},{"ccode":"000","tcode":"10842","name":"Campeonato Nacional de Jovens Sub 10 F 2025","date":"2025-06-01","expectedYear":"2025"},{"ccode":"000","tcode":"10810","name":"1º Torneio do Circuito Aquapor","date":"2025-01-18","expectedYear":"2025"},{"ccode":"000","tcode":"10811","name":"2º Torneio do Circuito Aquapor","date":"2025-03-15","expectedYear":"2025"},{"ccode":"000","tcode":"10812","name":"3º Torneio do Circuito Aquapor","date":"2025-04-04","expectedYear":"2025"},{"ccode":"000","tcode":"10813","name":"4º Torneio do Circuito Aquapor","date":"2025-05-16","expectedYear":"2025"},{"ccode":"000","tcode":"10814","name":"5º Torneio do Circuito Aquapor","date":"2025-09-19","expectedYear":"2025"},{"ccode":"000","tcode":"10815","name":"6º Torneio do Circuito Aquapor","date":"2025-10-17","expectedYear":"2025"},{"ccode":"000","tcode":"10816","name":"7º Torneio do Circuito Aquapor","date":"2025-11-15","expectedYear":"2025"},{"ccode":"988","tcode":"10229","name":"1º Torneio Drive Challenge Sul-Amendoeira - Sub 18","date":"2025-01-12","expectedYear":"2025"},{"ccode":"988","tcode":"10228","name":"1º Torneio Drive Challenge Sul-Amendoeira - Sub 14","date":"2025-01-12","expectedYear":"2025"},{"ccode":"988","tcode":"10227","name":"1º Torneio Drive Challenge Sul-Amendoeira - Sub 12","date":"2025-01-12","expectedYear":"2025"},{"ccode":"988","tcode":"10226","name":"1º Torneio Drive Challenge Sul-Amendoeira - Sub 10","date":"2025-01-12","expectedYear":"2025"},{"ccode":"985","tcode":"10198","name":"1º Torneio Drive Tour Tejo – Montado Golf","date":"2025-01-25","expectedYear":"2025"},{"ccode":"988","tcode":"10233","name":"2º Torneio Drive Challenge Sul-Qtªdo Vale-Sub 18","date":"2025-01-26","expectedYear":"2025"},{"ccode":"988","tcode":"10232","name":"2º Torneio Drive Challenge Sul-Qtªdo Vale-Sub 14","date":"2025-01-26","expectedYear":"2025"},{"ccode":"988","tcode":"10231","name":"2º Torneio Drive Challenge Sul-Qtªdo Vale-Sub 12","date":"2025-01-26","expectedYear":"2025"},{"ccode":"988","tcode":"10230","name":"2º Torneio Drive Challenge Sul-Qtª do Vale-Sub 10","date":"2025-01-26","expectedYear":"2025"},{"ccode":"988","tcode":"10246","name":"1º Torneio Drive Tour Sul – Palmares","date":"2025-02-01","expectedYear":"2025"},{"ccode":"982","tcode":"10173","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 18","date":"2025-02-09","expectedYear":"2025"},{"ccode":"982","tcode":"10172","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 14","date":"2025-02-09","expectedYear":"2025"},{"ccode":"982","tcode":"10171","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 12","date":"2025-02-09","expectedYear":"2025"},{"ccode":"982","tcode":"10170","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 10","date":"2025-02-09","expectedYear":"2025"},{"ccode":"985","tcode":"10173","name":"1º Torneio Drive Challenge Tejo -Campo Real- Sub18","date":"2025-02-09","expectedYear":"2025"},{"ccode":"985","tcode":"10172","name":"1º Torneio Drive Challenge Tejo -Campo Real- Sub14","date":"2025-02-09","expectedYear":"2025"},{"ccode":"985","tcode":"10171","name":"1º Torneio Drive Challenge Tejo -Campo Real- Sub12","date":"2025-02-09","expectedYear":"2025"},{"ccode":"985","tcode":"10170","name":"1º Torneio Drive Challenge Tejo -Campo Real- Sub10","date":"2025-02-09","expectedYear":"2025"},{"ccode":"987","tcode":"10177","name":"1º Torneio Drive Challenge Norte - Estela - Sub18","date":"2025-02-09","expectedYear":"2025"},{"ccode":"987","tcode":"10176","name":"1º Torneio Drive Challenge Norte - Estela - Sub14","date":"2025-02-09","expectedYear":"2025"},{"ccode":"987","tcode":"10175","name":"1º Torneio Drive Challenge Norte - Estela - Sub12","date":"2025-02-09","expectedYear":"2025"},{"ccode":"987","tcode":"10174","name":"1º Torneio Drive Challenge Norte - Estela - Sub10","date":"2025-02-09","expectedYear":"2025"},{"ccode":"988","tcode":"10237","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 18","date":"2025-02-09","expectedYear":"2025"},{"ccode":"988","tcode":"10236","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 14","date":"2025-02-09","expectedYear":"2025"},{"ccode":"988","tcode":"10235","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 12","date":"2025-02-09","expectedYear":"2025"},{"ccode":"988","tcode":"10234","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 10","date":"2025-02-09","expectedYear":"2025"},{"ccode":"987","tcode":"10202","name":"1º Torneio Drive Tour Norte – Estela GC","date":"2025-02-16","expectedYear":"2025"},{"ccode":"984","tcode":"10118","name":"2º Torn. Drive Challenge Açores - Batalha - Sub 18","date":"2025-03-08","expectedYear":"2025"},{"ccode":"984","tcode":"10117","name":"2º Torn. Drive Challenge Açores - Batalha - Sub 14","date":"2025-03-08","expectedYear":"2025"},{"ccode":"983","tcode":"10128","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2025-03-10","expectedYear":"2025"},{"ccode":"983","tcode":"10127","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2025-03-10","expectedYear":"2025"},{"ccode":"983","tcode":"10126","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2025-03-10","expectedYear":"2025"},{"ccode":"983","tcode":"10125","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2025-03-10","expectedYear":"2025"},{"ccode":"985","tcode":"10177","name":"2º Torn. Drive Challenge Tejo - Jamor - Sub18","date":"2025-03-15","expectedYear":"2025"},{"ccode":"985","tcode":"10176","name":"2º Torn. Drive Challenge Tejo - Jamor - Sub14","date":"2025-03-15","expectedYear":"2025"},{"ccode":"985","tcode":"10175","name":"2º Torn. Drive Challenge Tejo - Jamor - Sub12","date":"2025-03-15","expectedYear":"2025"},{"ccode":"985","tcode":"10174","name":"2º Torn. Drive Challenge Tejo - Jamor - Sub10","date":"2025-03-15","expectedYear":"2025"},{"ccode":"983","tcode":"10132","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2025-03-22","expectedYear":"2025"},{"ccode":"983","tcode":"10131","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2025-03-22","expectedYear":"2025"},{"ccode":"983","tcode":"10130","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2025-03-22","expectedYear":"2025"},{"ccode":"983","tcode":"10129","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2025-03-22","expectedYear":"2025"},{"ccode":"987","tcode":"10203","name":"2º Torneio Drive Tour Norte – Amarante","date":"2025-03-22","expectedYear":"2025"},{"ccode":"985","tcode":"10199","name":"2 Torneio Drive Tour Tejo – Campo Real","date":"2025-03-30","expectedYear":"2025"},{"ccode":"982","tcode":"10181","name":"3ºTorn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2025-04-05","expectedYear":"2025"},{"ccode":"982","tcode":"10180","name":"3ºTorn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2025-04-05","expectedYear":"2025"},{"ccode":"982","tcode":"10179","name":"3ºTorn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2025-04-05","expectedYear":"2025"},{"ccode":"982","tcode":"10178","name":"3ºTorn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2025-04-05","expectedYear":"2025"},{"ccode":"985","tcode":"10181","name":"3º Torn. Drive Challenge Tejo - Montado- Sub18","date":"2025-04-12","expectedYear":"2025"},{"ccode":"985","tcode":"10180","name":"3º Torn. Drive Challenge Tejo - Montado- Sub14","date":"2025-04-12","expectedYear":"2025"},{"ccode":"985","tcode":"10179","name":"3º Torn. Drive Challenge Tejo - Montado- Sub12","date":"2025-04-12","expectedYear":"2025"},{"ccode":"985","tcode":"10178","name":"3º Torn. Drive Challenge Tejo - Montado- Sub10","date":"2025-04-12","expectedYear":"2025"},{"ccode":"987","tcode":"10185","name":"3º Torneio Drive Challenge Norte - Vidago - Sub18","date":"2025-04-12","expectedYear":"2025"},{"ccode":"987","tcode":"10184","name":"3º Torneio Drive Challenge Norte - Vidago - Sub14","date":"2025-04-12","expectedYear":"2025"},{"ccode":"987","tcode":"10183","name":"3º Torneio Drive Challenge Norte - Vidago - Sub12","date":"2025-04-12","expectedYear":"2025"},{"ccode":"987","tcode":"10182","name":"3º Torneio Drive Challenge Norte - Vidago - Sub10","date":"2025-04-12","expectedYear":"2025"},{"ccode":"983","tcode":"10136","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2025-05-09","expectedYear":"2025"},{"ccode":"983","tcode":"10135","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2025-05-09","expectedYear":"2025"},{"ccode":"983","tcode":"10134","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2025-05-09","expectedYear":"2025"},{"ccode":"983","tcode":"10133","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2025-05-09","expectedYear":"2025"},{"ccode":"985","tcode":"10185","name":"4º Torn. Drive Challenge Tejo-Santo Estevão- Sub18","date":"2025-05-09","expectedYear":"2025"},{"ccode":"985","tcode":"10184","name":"4º Torn. Drive Challenge Tejo-Santo Estevão- Sub14","date":"2025-05-09","expectedYear":"2025"},{"ccode":"985","tcode":"10183","name":"4º Torn. Drive Challenge Tejo-Santo Estevão- Sub12","date":"2025-05-09","expectedYear":"2025"},{"ccode":"985","tcode":"10182","name":"4º Torn. Drive Challenge Tejo-Santo Estevão- Sub10","date":"2025-05-09","expectedYear":"2025"},{"ccode":"987","tcode":"10189","name":"4º Torneio Drive Challenge Norte- Vale Pisão-Sub18","date":"2025-05-09","expectedYear":"2025"},{"ccode":"987","tcode":"10188","name":"4º Torneio Drive Challenge Norte- Vale Pisão-Sub14","date":"2025-05-09","expectedYear":"2025"},{"ccode":"987","tcode":"10187","name":"4º Torneio Drive Challenge Norte- Vale Pisão-Sub12","date":"2025-05-09","expectedYear":"2025"},{"ccode":"987","tcode":"10186","name":"4º Torneio Drive Challenge Norte- Vale Pisão-Sub10","date":"2025-05-09","expectedYear":"2025"},{"ccode":"988","tcode":"10241","name":"4º Torneio Drive Challenge Sul-Pine Cliffs- Sub 18","date":"2025-05-09","expectedYear":"2025"},{"ccode":"988","tcode":"10240","name":"4º Torneio Drive Challenge Sul-Pine Cliffs- Sub 14","date":"2025-05-09","expectedYear":"2025"},{"ccode":"988","tcode":"10239","name":"4º Torneio Drive Challenge Sul-Pine Cliffs- Sub 12","date":"2025-05-09","expectedYear":"2025"},{"ccode":"988","tcode":"10238","name":"4º Torneio Drive Challenge Sul-Pine Cliffs- Sub 10","date":"2025-05-09","expectedYear":"2025"},{"ccode":"982","tcode":"10185","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 18","date":"2025-05-10","expectedYear":"2025"},{"ccode":"982","tcode":"10184","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 14","date":"2025-05-10","expectedYear":"2025"},{"ccode":"982","tcode":"10183","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 12","date":"2025-05-10","expectedYear":"2025"},{"ccode":"982","tcode":"10182","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 10","date":"2025-05-10","expectedYear":"2025"},{"ccode":"983","tcode":"10140","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2025-05-23","expectedYear":"2025"},{"ccode":"983","tcode":"10139","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2025-05-23","expectedYear":"2025"},{"ccode":"983","tcode":"10138","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2025-05-23","expectedYear":"2025"},{"ccode":"983","tcode":"10137","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2025-05-23","expectedYear":"2025"},{"ccode":"984","tcode":"10122","name":"3º Torn. Drive Challenge Açores - Batalha - Sub 18","date":"2025-05-23","expectedYear":"2025"},{"ccode":"984","tcode":"10121","name":"3º Torn. Drive Challenge Açores - Batalha - Sub 14","date":"2025-05-23","expectedYear":"2025"},{"ccode":"987","tcode":"10204","name":"3º Torneio Drive Tour Norte – Vale Pisão","date":"2025-05-23","expectedYear":"2025"},{"ccode":"988","tcode":"10247","name":"2º Torneio Drive Tour Sul – Pinhal","date":"2025-05-23","expectedYear":"2025"},{"ccode":"985","tcode":"10200","name":"3º Torneio Drive Tour Tejo – Ribagolfe Oaks","date":"2025-05-30","expectedYear":"2025"},{"ccode":"982","tcode":"10189","name":"5ºTorn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2025-05-31","expectedYear":"2025"},{"ccode":"982","tcode":"10188","name":"5ºTorn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2025-05-31","expectedYear":"2025"},{"ccode":"982","tcode":"10187","name":"5ºTorn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2025-05-31","expectedYear":"2025"},{"ccode":"982","tcode":"10186","name":"5ºTorn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2025-05-31","expectedYear":"2025"},{"ccode":"984","tcode":"10126","name":"4º Torn. Drive Challenge Açores - Batalha - Sub 18","date":"2025-06-07","expectedYear":"2025"},{"ccode":"984","tcode":"10124","name":"4º Torn. Drive Challenge Açores - Batalha - Sub 12","date":"2025-06-07","expectedYear":"2025"},{"ccode":"985","tcode":"10189","name":"5º Torneio Drive Challenge Tejo - Lisbon - Sub18","date":"2025-06-07","expectedYear":"2025"},{"ccode":"985","tcode":"10188","name":"5º Torneio Drive Challenge Tejo - Lisbon - Sub14","date":"2025-06-07","expectedYear":"2025"},{"ccode":"985","tcode":"10187","name":"5º Torneio Drive Challenge Tejo - Lisbon - Sub12","date":"2025-06-07","expectedYear":"2025"},{"ccode":"985","tcode":"10186","name":"5º Torneio Drive Challenge Tejo - Lisbon - Sub10","date":"2025-06-07","expectedYear":"2025"},{"ccode":"988","tcode":"10245","name":"5º Torneio Drive Challenge Sul-Benamor- Sub 18","date":"2025-06-07","expectedYear":"2025"},{"ccode":"988","tcode":"10244","name":"5º Torneio Drive Challenge Sul-Benamor- Sub 14","date":"2025-06-07","expectedYear":"2025"},{"ccode":"988","tcode":"10243","name":"5º Torneio Drive Challenge Sul-Benamor- Sub 12","date":"2025-06-07","expectedYear":"2025"},{"ccode":"988","tcode":"10242","name":"5º Torneio Drive Challenge Sul-Benamor- Sub 10","date":"2025-06-07","expectedYear":"2025"},{"ccode":"988","tcode":"10248","name":"3º Torneio Drive Tour Sul – Boavista","date":"2025-06-20","expectedYear":"2025"},{"ccode":"982","tcode":"10177","name":"2º Torn.Drive Challenge Madeira-Porto Santo-Sub 18","date":"2025-06-21","expectedYear":"2025"},{"ccode":"982","tcode":"10176","name":"2º Torn.Drive Challenge Madeira-Porto Santo-Sub 14","date":"2025-06-21","expectedYear":"2025"},{"ccode":"982","tcode":"10175","name":"2º Torn.Drive Challenge Madeira-Porto Santo-Sub 12","date":"2025-06-21","expectedYear":"2025"},{"ccode":"982","tcode":"10174","name":"2º Torn.Drive Challenge Madeira-Porto Santo-Sub 10","date":"2025-06-21","expectedYear":"2025"},{"ccode":"984","tcode":"10114","name":"1º Torn. Drive Challenge Açores - Batalha - Sub 18","date":"2025-06-21","expectedYear":"2025"},{"ccode":"984","tcode":"10113","name":"1º Torn. Drive Challenge Açores - Batalha - Sub 14","date":"2025-06-21","expectedYear":"2025"},{"ccode":"984","tcode":"10112","name":"1º Torn. Drive Challenge Açores - Batalha - Sub 12","date":"2025-06-21","expectedYear":"2025"},{"ccode":"985","tcode":"10201","name":"4º Torneio Drive Tour Tejo – Lisbon SC","date":"2025-06-21","expectedYear":"2025"},{"ccode":"987","tcode":"10205","name":"4º Torneio Drive Tour Norte – Ponte de Lima","date":"2025-06-21","expectedYear":"2025"},{"ccode":"982","tcode":"10193","name":"6º Torneio Drive Challenge Madeira-Palheiro-Sub 18","date":"2025-07-10","expectedYear":"2025"},{"ccode":"982","tcode":"10192","name":"6º Torneio Drive Challenge Madeira-Palheiro-Sub 14","date":"2025-07-10","expectedYear":"2025"},{"ccode":"982","tcode":"10191","name":"6º Torneio Drive Challenge Madeira-Palheiro-Sub 12","date":"2025-07-10","expectedYear":"2025"},{"ccode":"982","tcode":"10190","name":"6º Torneio Drive Challenge Madeira-Palheiro-Sub 10","date":"2025-07-10","expectedYear":"2025"},{"ccode":"982","tcode":"10197","name":"Final Drive Challenge Madeira-Stº da Serra-Sub 18","date":"2025-07-11","expectedYear":"2025"},{"ccode":"982","tcode":"10196","name":"Final Drive Challenge Madeira-Stº da Serra-Sub 14","date":"2025-07-11","expectedYear":"2025"},{"ccode":"982","tcode":"10195","name":"Final Drive Challenge Madeira-Stº da Serra-Sub 12","date":"2025-07-11","expectedYear":"2025"},{"ccode":"982","tcode":"10194","name":"Final Drive Challenge Madeira-Stº da Serra-Sub 10","date":"2025-07-11","expectedYear":"2025"},{"ccode":"985","tcode":"10193","name":"6º Torn. Drive Challenge Tejo-Penha Longa M -Sub18","date":"2025-07-11","expectedYear":"2025"},{"ccode":"985","tcode":"10192","name":"6º Torn. Drive Challenge Tejo-Penha Longa M -Sub14","date":"2025-07-11","expectedYear":"2025"},{"ccode":"985","tcode":"10191","name":"6º Torn. Drive Challenge Tejo-Penha Longa M -Sub12","date":"2025-07-11","expectedYear":"2025"},{"ccode":"985","tcode":"10190","name":"6º Torn. Drive Challenge Tejo-Penha Longa M -Sub10","date":"2025-07-11","expectedYear":"2025"},{"ccode":"987","tcode":"10197","name":"6º Torn. Drive Challenge Norte - QtºBarca - Sub18","date":"2025-07-11","expectedYear":"2025"},{"ccode":"987","tcode":"10196","name":"6º Torn. Drive Challenge Norte - QtºBarca - Sub14","date":"2025-07-11","expectedYear":"2025"},{"ccode":"987","tcode":"10195","name":"6º Torn. Drive Challenge Norte - QtºBarca - Sub12","date":"2025-07-11","expectedYear":"2025"},{"ccode":"987","tcode":"10194","name":"6º Torn. Drive Challenge Norte - QtºBarca - Sub10","date":"2025-07-11","expectedYear":"2025"},{"ccode":"988","tcode":"10252","name":"6º Torneio Drive Challenge Sul - Laguna - Sub 18","date":"2025-07-12","expectedYear":"2025"},{"ccode":"988","tcode":"10251","name":"6º Torneio Drive Challenge Sul - Laguna - Sub 14","date":"2025-07-12","expectedYear":"2025"},{"ccode":"988","tcode":"10250","name":"6º Torneio Drive Challenge Sul - Laguna - Sub 12","date":"2025-07-12","expectedYear":"2025"},{"ccode":"988","tcode":"10249","name":"6º Torneio Drive Challenge Sul - Laguna - Sub 10","date":"2025-07-12","expectedYear":"2025"},{"ccode":"987","tcode":"10181","name":"2º Torneio Drive Challenge Norte - Miramar - Sub18","date":"2025-07-13","expectedYear":"2025"},{"ccode":"987","tcode":"10180","name":"2º Torneio Drive Challenge Norte - Miramar - Sub14","date":"2025-07-13","expectedYear":"2025"},{"ccode":"987","tcode":"10179","name":"2º Torneio Drive Challenge Norte - Miramar - Sub12","date":"2025-07-13","expectedYear":"2025"},{"ccode":"987","tcode":"10178","name":"2º Torneio Drive Challenge Norte - Miramar - Sub10","date":"2025-07-13","expectedYear":"2025"},{"ccode":"988","tcode":"10253","name":"4º Torneio Drive Tour Sul- Quinta do Lago Norte","date":"2025-08-23","expectedYear":"2025"},{"ccode":"987","tcode":"10201","name":"Final Regional Drive Challenge Norte-Oporto-Sub18","date":"2025-09-04","expectedYear":"2025"},{"ccode":"987","tcode":"10200","name":"Final Regional Drive Challenge Norte-Oporto-Sub14","date":"2025-09-04","expectedYear":"2025"},{"ccode":"987","tcode":"10199","name":"Final Regional Drive Challenge Norte-Oporto-Sub12","date":"2025-09-04","expectedYear":"2025"},{"ccode":"987","tcode":"10198","name":"Final Regional Drive Challenge Norte-Oporto-Sub10","date":"2025-09-04","expectedYear":"2025"},{"ccode":"985","tcode":"10197","name":"Final Regional Drive Challenge Tejo - Sub18","date":"2025-09-05","expectedYear":"2025"},{"ccode":"985","tcode":"10196","name":"Final Regional Drive Challenge Tejo - Sub14","date":"2025-09-05","expectedYear":"2025"},{"ccode":"985","tcode":"10195","name":"Final Regional Drive Challenge Tejo - Sub12","date":"2025-09-05","expectedYear":"2025"},{"ccode":"985","tcode":"10194","name":"Final Regional Drive Challenge Tejo - Sub10","date":"2025-09-05","expectedYear":"2025"},{"ccode":"988","tcode":"10260","name":"Final Drive Challenge Sul - Castro Marim - Sub 12","date":"2025-09-06","expectedYear":"2025"},{"ccode":"988","tcode":"10259","name":"Final Drive Challenge Sul - Castro Marim - Sub 14","date":"2025-09-06","expectedYear":"2025"},{"ccode":"988","tcode":"10258","name":"Final  Drive Challenge Sul-Castro Marim -  Sub 18","date":"2025-09-06","expectedYear":"2025"},{"ccode":"988","tcode":"10257","name":"Final Drive Challenge Sul - Castro Marim - Sub 10","date":"2025-09-06","expectedYear":"2025"}];

  const MAX_ROUNDS = 3;
  const DELAY_MS   = 250;
  const ACK_DRAW   = "XH256YF45T";

  // ═══════════════════════════════════════════════════════
  // PARSERS
  // ═══════════════════════════════════════════════════════
  const strip = s => (s||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&#\d+;/g,"").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  const num   = s => { if(!s||s==="-"||s==="–") return null; const n=parseFloat(String(s).replace(",",".")); return isNaN(n)?null:n; };
  const cells = r => { const c=[],re=/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi; let m; while((m=re.exec(r))!==null) c.push(strip(m[1])); return c; };

  function parseAdmissions(html) {
    if (!html || html.length < 500) return { error: "empty-html", players: [] };
    if (/Param_Errors|Err=999|Runtime Error/.test(html)) return { error: "param-errors", players: [] };

    const clean = html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"");
    const rows = []; const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
    while ((m = trRe.exec(clean)) !== null) rows.push(m[1]);

    // Meta — tenta padrões do scoring.fpg.pt (lblTdesc/lbldt) e do scoring-pt.datagolf.pt (spans simples)
    const mName = html.match(/<span[^>]*id=["']lblTdesc["'][^>]*>([^<]*)<\/span>/i)
      || html.match(/<td[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
    const mDate = html.match(/<span[^>]*id=["']lbldt["'][^>]*>([^<]*)<\/span>/i);
    const mCount = html.match(/<span[^>]*id=["']PlayersCount["'][^>]*>([^<]*)<\/span>/i);
    const mStatus = html.match(/<span[^>]*id=["']lblTournStatus["'][^>]*>([^<]*)<\/span>/i);

    const out = {
      name: mName ? strip(mName[1]) : null,
      status: mStatus ? strip(mStatus[1]) : null,
      totalInscritos: 0, reservas: 0,
      players: [],
    };
    if (mDate) {
      const raw = strip(mDate[1]);
      const mm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      out.date = mm ? `${mm[3]}-${mm[2].padStart(2,"0")}-${mm[1].padStart(2,"0")}` : raw;
    }
    if (mCount) {
      const c = strip(mCount[1]).match(/(\d+)\s*(?:\(\+(\d+)\))?/);
      if (c) { out.totalInscritos = parseInt(c[1],10); out.reservas = c[2] ? parseInt(c[2],10) : 0; }
    }

    if (rows.length < 2) return out;

    // descobrir linha de header
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const t = cells(rows[i]).join(" ").toLowerCase();
      let s = 0;
      if (/fed|lic/.test(t)) s += 3;
      if (/nome|jogador/.test(t)) s += 3;
      if (/hcp|handicap|ndice/.test(t)) s += 2;
      if (/\bvac\b/.test(t)) s += 2;
      if (/data|insc/.test(t)) s += 2;
      if (/clube|assoc/.test(t)) s += 1;
      if (s > best) { best = s; hi = i; }
    }
    const h = cells(rows[hi]).map(c => c.toLowerCase());
    const iN = h.findIndex(x => /nome|jogador/.test(x));
    const iF = h.findIndex(x => /fed|lic/.test(x));
    const iH = h.findIndex(x => /hcp|handicap|ndice/.test(x));
    const iV = h.findIndex(x => /vac/.test(x));
    const iC = h.findIndex(x => /clube|assoc/.test(x));
    const iD = h.findIndex(x => /data|insc/.test(x));

    for (let i = hi + 1; i < rows.length; i++) {
      const cs = cells(rows[i]);
      if (cs.length < 2) continue;
      let fed = iF >= 0 ? ((cs[iF].match(/\b(\d{4,6})\b/)||[])[1] || null) : null;
      let fi = iF;
      if (!fed) {
        for (let j = 0; j < cs.length; j++) {
          const x = cs[j].match(/\b(\d{4,6})\b/);
          if (x) { fed = x[1]; fi = j; break; }
        }
      }
      const nome = iN >= 0 ? (cs[iN] || "") : (cs.find(c => c.length > 4 && /[a-záéíóú]/i.test(c) && !/^\d/.test(c)) || "");
      const clube = iC >= 0 ? (cs[iC] || "") : "";
      let hcp = iH >= 0 ? num(cs[iH]) : null;
      let vac = iV >= 0 ? num(cs[iV]) : null;
      if ((hcp === null || vac === null) && fi >= 0) {
        for (let j = fi + 1; j < cs.length; j++) {
          const raw = cs[j] || "";
          // Ignora células com formato de data — evita apanhar o ano como VAC
          if (/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(raw)) continue;
          const v = num(raw); if (v === null) continue;
          if (hcp === null && v >= -10 && v <= 54) { hcp = v; continue; }
          if (vac === null && v > 60 && v < 200) { vac = v; break; }
        }
      }
      let data = iD >= 0 ? (cs[iD] || null) : null;
      if (!data) { const x = cs.find(c => /\d{4}\/\d{2}\/\d{2}/.test(c)); if (x) data = x; }
      const pos = parseInt(cs[0], 10) || null;
      if (!nome && !fed) continue;
      out.players.push({ pos, fed: fed || null, nome, clube, hcp, vac, dataInscricao: data, status: "confirmed" });
    }
    // Marcar reservas (pos reinicia em 1)
    let maxPos = 0, inRes = false;
    for (const p of out.players) {
      if (!inRes && p.pos === 1 && maxPos > 1) inRes = true;
      else if (p.pos != null) maxPos = Math.max(maxPos, p.pos);
      if (inRes) p.status = "reserva";
    }
    if (out.totalInscritos === 0 && out.players.length > 0) {
      out.totalInscritos = out.players.filter(p => p.status === "confirmed").length;
      out.reservas = out.players.filter(p => p.status === "reserva").length;
    }
    return out;
  }

  function parseDraw(html) {
    if (!html || html.length < 200) return { error: "empty-html", groups: [] };
    if (/Param_Errors|Err=999|Runtime Error/.test(html)) return { error: "param-errors", groups: [] };

    const mName = html.match(/<td[^>]*align=["']left["'][^>]*>([^<]*?)<\/td>\s*<td[^>]*align=["']right["'][^>]*>\s*Federa/i);
    const mDate = html.match(/<td[^>]*align=["']right["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i);
    const mTotal = html.match(/<td[^>]*align=["']right["'][^>]*>\s*Jogadores\s+(\d+)\s*<\/td>/i);

    const out = {
      name: mName ? strip(mName[1]) : null,
      date: mDate ? mDate[1] : null,
      totalJogadores: mTotal ? parseInt(mTotal[1],10) : 0,
      groups: [],
    };

    // Cores de tee conhecidas na FPG (uses & variants)
    const TEE_COLORS_RE = /^\s*(Brancas?|Azuis|Azul(?:\s+Claro|\s+Escuro)?|Amarelas?|Vermelhas?|Verdes?|Roxas?|Pretas?|Douradas?|Negras?|Laranjas?|Rosas?)\s*$/i;

    const trRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
    let tm, currentGroup = null, isFirstDataRow = true;
    while ((tm = trRe.exec(html)) !== null) {
      const attrs = tm[1] || "", inner = tm[2];
      const cs = cells(inner);
      if (cs.length === 0) continue;
      const first = cs[0];
      if (!/^\d{1,2}:\d{2}$/.test(first)) continue;

      // Detectar estrutura de colunas — 2 variantes observadas na FPG:
      //   Padrão A (pre-tournament): [Hora, Tee#, Cor, Nome, Clube, ...]
      //   Padrão B (post-tournament): [Hora, Tee#, Nome, Fed, Clube, ...]  (sem cor)
      const maybeColor = (cs[2] || "").trim();
      let teeVal, nomeIdx, clubeIdx;
      if (TEE_COLORS_RE.test(maybeColor)) {
        teeVal = maybeColor; nomeIdx = 3; clubeIdx = 4;
      } else {
        teeVal = null; nomeIdx = 2;
        // Se cs[3] parece fed code, clube está em cs[4]; senão em cs[3]
        clubeIdx = /^\d{4,6}$/.test((cs[3]||"").trim()) ? 4 : 3;
      }

      const newFlight = /border-top:\s*2pt\s+solid/i.test(attrs) || isFirstDataRow;
      if (newFlight) {
        currentGroup = {
          teeTime: first,
          startHole: cs[1] ? parseInt(cs[1],10) : null,
          tee: teeVal,
          players: [],
        };
        out.groups.push(currentGroup);
        isFirstDataRow = false;
      }
      const nome = cs[nomeIdx] || ""; const clube = cs[clubeIdx] || "";
      if (nome) currentGroup.players.push({ nome, clube: clube || null });
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════
  // FETCH
  // ═══════════════════════════════════════════════════════
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fetchHTML(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return { ok: false, status: r.status, html: "" };
      const html = await r.text();
      if (/Param_Errors|Err=999/.test(html)) return { ok: false, status: 200, html, errKind: "param-errors" };
      return { ok: true, status: 200, html };
    } catch (e) {
      return { ok: false, status: 0, html: "", error: e.message };
    }
  }

  /** Detecta reutilização de tcode comparando a data completa do torneio.
   *  Se `expectedDate` existe, compara por dias (tolerância 30d).
   *  Caso contrário, cai em comparação por ano (menos precisa).
   *  Retorna { _suspect, _suspectReason } ou null. */
  function checkSuspect(parsedDate, expectedYear, expectedDate) {
    if (!parsedDate) return null;
    if (expectedDate) {
      const p = Date.parse(parsedDate);
      const e = Date.parse(expectedDate);
      if (!isNaN(p) && !isNaN(e)) {
        const days = Math.round(Math.abs(p - e) / 86400000);
        if (days > 30) return { _suspect: true, _suspectReason: `data da página=${parsedDate}, esperada=${expectedDate} (${days}d de diferença)` };
        return null;
      }
    }
    // Fallback: comparar ano
    if (expectedYear) {
      const got = String(parsedDate).slice(0, 4);
      if (got && got !== String(expectedYear) && /^\d{4}$/.test(got)) {
        return { _suspect: true, _suspectReason: `data da página=${got}, esperada=${expectedYear}` };
      }
    }
    return null;
  }

  // Detectar MODE a partir do hostname actual do tab
  const HOST = (location && location.hostname) || "";
  const MODE = HOST === "scoring-pt.datagolf.pt" ? "draws"
             : HOST === "scoring.datagolf.pt"    ? "admissions"
             : HOST === "scoring.fpg.pt"          ? "admissions"
             : "unknown";

  async function scrapeOne(t) {
    const out = {
      ccode: t.ccode, tcode: t.tcode, name: t.name, date: t.date,
      expectedYear: t.expectedYear || ((t.date||"").slice(0,4) || null),
      admissions: null, draws: {},
      scrapedAt: new Date().toISOString(),
    };

    // ── ADMISSIONS (só em tab scoring.datagolf.pt ou scoring.fpg.pt) ──
    if (MODE === "admissions") {
      const admUrls = [
        `https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=${t.ccode}&tcode=${t.tcode}`,
        `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${t.ccode}&tcode=${t.tcode}`,
      ];
      for (const url of admUrls) {
        const res = await fetchHTML(url);
        if (!res.ok) continue;
        const adm = parseAdmissions(res.html);
        if (adm.error || (adm.players || []).length === 0) continue;
        const suspect = checkSuspect(adm.date, out.expectedYear, t.date);
        if (suspect) Object.assign(adm, suspect);
        adm._url = url;
        out.admissions = adm;
        if (adm.name && !out.name) out.name = adm.name;
        if (adm.date && !out.date) out.date = adm.date;
        break;
      }
      if (!out.admissions) out.admissions = { error: "all-urls-failed", players: [] };
    }

    // ── DRAWS (só em tab scoring-pt.datagolf.pt) ──
    if (MODE === "draws") {
      for (let r = 1; r <= MAX_ROUNDS; r++) {
        await sleep(DELAY_MS);
        const drawUrls = [
          `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=${t.ccode}&tourn=${t.tcode}&round_number=${r}&LANG_TXT=PT&ack=${ACK_DRAW}`,
          `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=${t.ccode}&tourn=${t.tcode}&round_number=${r}&LANG_TXT=PT&ack=8428ACK987`,
        ];
        let drawOk = false;
        for (const url of drawUrls) {
          const res = await fetchHTML(url);
          if (!res.ok) continue;
          const draw = parseDraw(res.html);
          if ((draw.groups || []).length === 0) continue;
          const suspect = checkSuspect(draw.date, out.expectedYear, t.date);
          if (suspect) Object.assign(draw, suspect);
          draw._url = url;
          out.draws[r] = draw;
          drawOk = true;
          break;
        }
        if (!drawOk) {
          if (r === 1) out.draws[1] = { groups: [], note: "sem draw disponível" };
          break;
        }
      }
    }

    return out;
  }

  // ═══════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════
  if (MODE === "unknown") {
    console.error(`%c⚠ Hostname "${HOST}" não suportado.`, "color:red;font-weight:bold;font-size:14px");
    console.error("Abre um destes URLs e corre o script nesse tab:");
    console.error("  • Admissions: https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T (redirect para scoring.datagolf.pt)");
    console.error("  • Draws:     https://scoring-pt.datagolf.pt/scripts/draw.asp?club=000&tourn=10941&round_number=1&LANG_TXT=PT&ack=XH256YF45T");
    return;
  }
  console.log(`%cFPG scrape (modo: ${MODE}): ${TORNEIOS.length} torneios`, "font-weight:bold;font-size:14px;color:#0a0");
  console.log(`Tab origem: ${HOST}`);
  if (MODE === "admissions") console.log("→ vai descarregar admissions (ignora draws)");
  if (MODE === "draws")      console.log("→ vai descarregar draws (ignora admissions)");
  console.log("");

  const results = [];
  let okAdm = 0, errAdm = 0, okDraw = 0, errDraw = 0, suspectAdm = 0, suspectDraw = 0;
  const t0 = Date.now();

  for (let i = 0; i < TORNEIOS.length; i++) {
    const t = TORNEIOS[i];
    const pct = Math.round(((i+1)/TORNEIOS.length)*100);
    try {
      const result = await scrapeOne(t);
      results.push(result);
      const nAdm = result.admissions?.players?.length ?? 0;
      const nDraws = Object.values(result.draws||{}).filter(d => d.groups && d.groups.length > 0).length;
      const admSuspect = result.admissions?._suspect ? " ⚠SUSP" : "";
      const anyDrawSuspect = Object.values(result.draws||{}).some(d => d._suspect) ? " ⚠SUSP" : "";
      if (nAdm > 0) okAdm++; else errAdm++;
      if (nDraws > 0) okDraw++; else errDraw++;
      if (result.admissions?._suspect) suspectAdm++;
      if (Object.values(result.draws||{}).some(d => d._suspect)) suspectDraw++;
      console.log(`[${pct}%] ${i+1}/${TORNEIOS.length} ${t.ccode}/${t.tcode} (${t.expectedYear||"?"}) — ${(t.name||"").slice(0,42)} → ${nAdm} insc${admSuspect}, ${nDraws} draws${anyDrawSuspect}`);
    } catch (e) {
      console.warn(`[${pct}%] ${i+1}/${TORNEIOS.length} ${t.ccode}/${t.tcode} ERRO: ${e.message}`);
      errAdm++; errDraw++;
      results.push({ ccode: t.ccode, tcode: t.tcode, name: t.name, error: e.message });
    }
    await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);

  console.log("");
  console.log(`%c✅ Completo em ${elapsed}s`, "font-weight:bold;color:#0a0");
  if (MODE === "admissions") console.log(`   Admissions: ${okAdm} com dados, ${errAdm} vazio/erro (${suspectAdm} SUSPECT)`);
  if (MODE === "draws")      console.log(`   Draws:      ${okDraw} com dados, ${errDraw} sem draw (${suspectDraw} SUSPECT)`);

  const filename = MODE === "draws" ? "fpg-draws-new.json" : "fpg-admissions-new.json";
  const out = {
    scrapedAt: new Date().toISOString(),
    total: TORNEIOS.length,
    source: `${HOST} (browser console, mode=${MODE})`,
    mode: MODE,
    tournaments: results,
  };

  // ⚠ Encoding: codificar explicitamente em UTF-8 bytes (caracteres especiais
  // como á/é/ç têm múltiplos bytes em UTF-8; sem este passo, o Blob calcula
  // o size com contagem de chars JS e trunca o ficheiro ao descarregar).
  const jsonStr = JSON.stringify(out, null, 2);
  const utf8Bytes = new TextEncoder().encode(jsonStr);
  const blob = new Blob([utf8Bytes], { type: "application/json;charset=utf-8" });
  console.log(`Ficheiro: ${jsonStr.length} chars, ${utf8Bytes.length} bytes UTF-8`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);

  console.log(`%c📥 Descarregado: ${filename}`, "font-weight:bold;color:#0a0");
  console.log(`   → Copia para C:\\golf-fpg\\public\\data\\${filename}`);
  if (MODE === "admissions") {
    console.log(`   ⏭ Falta correr os DRAWS: abre um tab em`);
    console.log(`      https://scoring-pt.datagolf.pt/scripts/draw.asp?club=000&tourn=10941&round_number=1&LANG_TXT=PT&ack=XH256YF45T`);
    console.log(`      e cola este mesmo script lá.`);
  } else {
    console.log(`   📦 Depois de teres também o fpg-admissions-new.json:`);
    console.log(`      node scripts/merge-fpg-admissions-draws.js`);
  }

})();
