/**
 * Os testes da /drive com os DADOS REAIS (decisões A–I, 22/10/2026) correm
 * todos neste ficheiro, num só processo: cada um lê ~25 MB de JSON, e em
 * paralelo (um processo por ficheiro) atrasavam o resto do `npm test` até dar
 * timeouts noutros testes. A cache dos pedidos (`cachedFetchJson`) é partilhada.
 */
import "./driveOpenLatest.realdata";
import "./driveUrl.realdata";
import "./driveEscFilter.realdata";
import "./driveCalendar.realdata";
import "./driveFlags.realdata";
import "./driveProgressive.realdata";
import "../../../pages/drive/__tests__/driveRanking.realdata";
