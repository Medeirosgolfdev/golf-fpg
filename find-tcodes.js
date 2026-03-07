const https = require('https');

const ccodes = ['982','983','984','985','986','987','988','998'];
const CONCURRENCY = 30;
const found = [];
const tasks = [];

for (const cc of ccodes)
  for (let tc = 9000; tc <= 10600; tc++)
    tasks.push({ cc, tc });

let idx = 0, active = 0, done = 0;
const total = tasks.length;

function next() {
  while (active < CONCURRENCY && idx < total) {
    const { cc, tc } = tasks[idx++];
    active++;
    https.get({
      hostname: 'scoring-pt.datagolf.pt',
      path: '/scripts/draw.asp?club='+cc+'&tourn='+tc+'&round_number=1&ack=8428ACK987',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (d.includes('<tr') && !d.includes('sem jogadores') && d.length > 500) {
          const mNome = d.match(/<td align="left">([^<]{5,})<\/td>/);
          const mData = d.match(/(\d{4}-\d{2}-\d{2})/);
          const nome = mNome ? mNome[1].trim() : '?';
          const data = mData ? mData[1] : '?';
          found.push(cc+'\t'+tc+'\t'+data+'\t'+nome);
          process.stdout.write(cc+'\t'+tc+'\t'+data+'\t'+nome+'\n');
        }
        active--; done++;
        if (done % 500 === 0) process.stderr.write('  '+done+'/'+total+'...\n');
        if (done === total) finish();
        else next();
      });
    }).on('error', () => {
      active--; done++;
      if (done === total) finish();
      else next();
    });
  }
}

function finish() {
  process.stderr.write('\n=== TOTAL: '+found.length+' torneios ===\n');
}

process.stderr.write('A varrer '+total+' combinações (concorrência='+CONCURRENCY+')...\n');
next();
