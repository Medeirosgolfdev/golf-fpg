// Smoke test for parseDivisionHtml. Run: node scripts/__test-gjgl-parser.js
const { parseDivisionHtml } = require('./scrape-gjgl.js');

const sampleHtml = `
<table class="ranking">
<tr><th>Pos</th><th>Nation</th><th></th><th>Name</th><th>R 1</th><th>R 2</th><th>R 3</th><th>Hole</th><th>To Par</th><th>Total</th><th>Age group</th><th>AG</th></tr>
<tr><td>1</td><td><img src="https://ssl.globaljuniorgolf.com/data/nationen/61.gif"></td><td></td><td><a href="javascript:displayPlayer('player_Tao_Pemerika');">Pemerika, Tao (m)</a></td><td>72</td><td>68</td><td>74</td><td>18</td><td>-2</td><td>214</td><td>18</td><td>18</td></tr>
<tr><td>2</td><td><img src="https://ssl.globaljuniorgolf.com/data/nationen/10.gif"></td><td></td><td><a href="javascript:displayPlayer('player_Jakob_Lehner');">Lehner, Jakob (m)</a></td><td>75</td><td>70</td><td>74</td><td>18</td><td>+3</td><td>219</td><td>23</td><td>23</td></tr>
<tr><td>14</td><td><img src="https://ssl.globaljuniorgolf.com/data/nationen/138.gif"></td><td></td><td><a href="javascript:displayPlayer('player_Santiago_Dias');">Dias, Santiago (m)</a></td><td>85</td><td>79</td><td>82</td><td>18</td><td>+30</td><td>246</td><td>14</td><td>14</td></tr>
</table>
<div id="player_Tao_Pemerika" style="display:none">
<table><tr><td>Club:</td><td>Golf de Cornouaille</td></tr><tr><td>HCP:</td><td>-4.1</td></tr></table>
<table>
<tr><th>Round 1</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th><th>16</th><th>17</th><th>18</th><th>Total</th></tr>
<tr><td>Score</td><td>4</td><td>3</td><td>4</td><td>3</td><td>3</td><td>5</td><td>4</td><td>5</td><td>3</td><td>3</td><td>4</td><td>4</td><td>8</td><td>3</td><td>4</td><td>4</td><td>4</td><td>4</td><td>72</td></tr>
<tr><td>PAR</td><td>4</td><td>3</td><td>4</td><td>4</td><td>3</td><td>5</td><td>5</td><td>4</td><td>4</td><td>4</td><td>4</td><td>3</td><td>5</td><td>4</td><td>5</td><td>3</td><td>4</td><td>4</td><td>72</td></tr>
</table>
</div>
<div id="player_Jakob_Lehner" style="display:none">
<table><tr><td>Club:</td><td>GC Wien</td></tr><tr><td>HCP:</td><td>2.0</td></tr></table>
</div>
`;

const out = parseDivisionHtml(sampleHtml, 14);
console.log("players:", out.players.length);
const tao = out.players[0];
console.log("name:", tao.name, "/ country:", tao.country, "/ pos:", tao.pos, "/ toPar:", tao.toPar);
console.log("club:", tao.club, "/ hcp:", tao.hcp);
console.log("rounds count:", tao.rounds.length);
const r1 = tao.rounds[0];
console.log("R1 gross:", r1.gross, "/ scores[5]:", r1.scores && r1.scores[4], "/ par[5]:", r1.par && r1.par[4]);
console.log("R1 scores valid 18?:", r1.scores && r1.scores.length === 18 && r1.scores.every(x => x !== null));
console.log("Jakob club:", out.players[1].club);
