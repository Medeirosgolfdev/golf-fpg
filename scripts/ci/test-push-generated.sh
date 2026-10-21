#!/usr/bin/env bash
# Teste do scripts/ci/push-generated.sh com um origin bare local (sem rede).
# Corre pelo vitest (push-generated.test.js) ou à mão: bash scripts/ci/test-push-generated.sh
set -u
SCRIPT="${1:-$(cd "$(dirname "$0")" && pwd)/push-generated.sh}"
T=$(mktemp -d)
cd "$T"
PASS=0; FAIL=0
ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
ko() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

git init -q --bare -b main origin.git
git clone -q origin.git seed 2>/dev/null
cd seed
git config user.name t; git config user.email t@t
mkdir -p src gen
printf '{\n  "a": 1,\n  "b": 2,\n  "c": 3,\n  "d": 4,\n  "e": 5,\n  "f": 6\n}\n' > src/a.json
echo '{"n":1}' > src/x.json
echo '{"o":1}' > src/old.json
cat > regen.js <<'EOF'
const fs=require('fs');const f=fs.readdirSync('src').filter(x=>x.endsWith('.json')).sort();
fs.writeFileSync('gen/agg.json', JSON.stringify({files:f})+'\n');
EOF
node regen.js
git add -A; git commit -qm init; git push -q origin HEAD:main
cd ..

clone() { rm -rf "$1"; git clone -q --depth=1 "file://$T/origin.git" "$1"; (cd "$1"; git config user.name "$1"; git config user.email "$1@t"); }

echo "== 1: alterações concorrentes em linhas diferentes + agregado regenerado"
clone A; clone B
( cd B; sed -i 's/"b": 2/"b": 20/' src/a.json; echo '{"n":2}' > src/fromB.json; node regen.js; git add -A; git commit -qm B; git push -q origin HEAD:main )
( cd A; sed -i 's/"f": 6/"f": 60/' src/a.json; echo '{"n":3}' > src/fromA.json; git rm -q src/old.json; node regen.js
  GITHUB_OUTPUT=$T/out1 bash "$SCRIPT" -m "A data" -g 'gen/agg.json' -r 'node regen.js' -- src gen/agg.json > ../log1 2>&1; echo $? > ../rc1 )
cat log1
[ "$(cat rc1)" = 0 ] && ok "exit 0" || ko "exit $(cat rc1)"
clone C
grep -q '"b": 20' C/src/a.json && grep -q '"f": 60' C/src/a.json && ok "a.json fundido" || ko "a.json não fundido"
grep -q fromA C/gen/agg.json && grep -q fromB C/gen/agg.json && ! grep -q old C/gen/agg.json && ok "agregado regenerado com A+B" || ko "agregado: $(cat C/gen/agg.json)"
[ ! -f C/src/old.json ] && ok "deleção publicada" || ko "deleção perdida"
grep -q pushed=true out1 && ok "GITHUB_OUTPUT pushed=true" || ko "output"

echo "== 2: conflito real na mesma linha → exit 1, nada publicado"
clone A; clone B
( cd B; sed -i 's/"c": 3/"c": 30/' src/a.json; git commit -qam B2; git push -q origin HEAD:main )
BEFORE=$(git --git-dir=origin.git rev-parse main)
( cd A; sed -i 's/"c": 3/"c": 31/' src/a.json; bash "$SCRIPT" -m "A2" -- src > ../log2 2>&1; echo $? > ../rc2 )
cat log2
[ "$(cat rc2)" = 1 ] && ok "exit 1 no conflito" || ko "exit $(cat rc2)"
[ "$(git --git-dir=origin.git rev-parse main)" = "$BEFORE" ] && ok "main intacto" || ko "main mudou"

echo "== 3: -o ours ganha no conflito"
clone A; clone B
( cd B; sed -i 's/"d": 4/"d": 40/' src/a.json; git commit -qam B3; git push -q origin HEAD:main )
( cd A; sed -i 's/"d": 4/"d": 41/' src/a.json; bash "$SCRIPT" -m "A3" -o 'src/a.json' -- src > ../log3 2>&1; echo $? > ../rc3 )
clone C
[ "$(cat rc3)" = 0 ] && grep -q '"d": 41' C/src/a.json && ok "ours ganhou" || { cat log3; ko "ours"; }

echo "== 4: main não avançou → sem regenerar, publica tal e qual"
clone A
( cd A; echo '{"n":9}' > src/x.json; node regen.js; bash "$SCRIPT" -m "A4" -g 'gen/agg.json' -r 'echo REGEN-CORREU; node regen.js' -- src gen > ../log4 2>&1; echo $? > ../rc4 )
[ "$(cat rc4)" = 0 ] && ! grep -q REGEN-CORREU log4 && ok "sem regen quando o main não mexeu" || { cat log4; ko "4"; }

echo "== 5: nada mudou → exit 0, pushed=false"
clone A
( cd A; GITHUB_OUTPUT=$T/out5 bash "$SCRIPT" -m "A5" -- src > ../log5 2>&1; echo $? > ../rc5 )
[ "$(cat rc5)" = 0 ] && grep -q pushed=false out5 && ok "no-op" || { cat log5; ko "5"; }

echo "== 6: JSON fundido inválido → conflito"
clone A; clone B
( cd B; printf '{\n  "a": 1,\n  "b": 20,\n  "c": 30,\n  "d": 41,\n  "e": 5,\n  "f": 60,\n  "g": 7\n}\n' > src/a.json; git commit -qam B6; git push -q origin HEAD:main )
( cd A; printf '{\n  "a": 1,\n  "b": 20,\n  "c": 30,\n  "d": 41,\n  "e": 5,\n  "f": 60\n,"z": 1}\n' > src/a.json; bash "$SCRIPT" -m "A6" -- src > ../log6 2>&1; echo $? > ../rc6 )
cat log6
[ "$(cat rc6)" = 1 ] && ok "fusão inválida recusada" || ko "6 rc=$(cat rc6)"

echo "== 7: push recusado à 1.ª (corrida) → retry"
clone A; clone B
( cd A; echo '{"n":77}' > src/x.json
  # hook: na 1.ª tentativa, outro clone empurra entre o fetch e o push
  git config core.hooksPath "$T/hooks"; mkdir -p "$T/hooks"
  cat > "$T/hooks/pre-push" <<EOF
#!/usr/bin/env bash
if [ ! -f "$T/raced" ]; then touch "$T/raced"; (cd "$T/B"; echo '{"race":1}' > src/race.json; git add -A; git commit -qm race; git push -q origin HEAD:main); fi
exit 0
EOF
  chmod +x "$T/hooks/pre-push"
  bash "$SCRIPT" -m "A7" -g 'gen/agg.json' -r 'node regen.js' -- src gen > ../log7 2>&1; echo $? > ../rc7 )
cat log7
clone C
[ "$(cat rc7)" = 0 ] && grep -q race C/gen/agg.json && grep -q 77 C/src/x.json && ok "retry com regeneração" || ko "7"

echo "RESULTADO: $PASS passaram, $FAIL falharam"
rm -rf "$T"
[ $FAIL = 0 ]
