# =====================================================================
#  uskids-aplicar-consola.ps1 - aplica sozinho o ficheiro da consola USKids
#  (Agendador: "USKids - aplicar ficheiro da consola", de 10 em 10 minutos).
#  Corre em pwsh (UTF-8).
#
#  Quando aparece nas Transferências um ficheiro gravado pela consola
#  (scripts/uskids-consola.js: uskids-AAAA-MM-DD-HHMM*.json, ou o nome antigo
#  uskids-inscritos-…), faz o que até 16/11/2026 se fazia à mão:
#    1. git pull
#    2. node scripts/fetch-uskids-field.js   --replay <ficheiro>   (inscritos)
#       node scripts/fetch-uskids-results.js --replay <ficheiro>   (resultados)
#    3. npm test (repete uma vez se falhar) e npm run build
#    4. commit + push SÓ dos public/data/uskids-*  (o Vercel publica)
#    5. arquiva o ficheiro em logs\uskids-consola\ e mostra o resumo
#  Se os testes ou o build falharem: desfaz os dados, guarda o ficheiro em
#  logs\uskids-consola\falhou\ e avisa. Se já houver alterações por gravar nos
#  public/data/uskids-* (alguém a trabalhar no repo), não mexe e tenta depois.
#  Vários ficheiros (um «-parcial» e o final): aplica o mais recente, que tem tudo.
#  Log: C:\golf-fpg\logs\uskids-consola.log
# =====================================================================
$ErrorActionPreference = 'Stop'
$Repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Log  = Join-Path $Repo 'logs\uskids-consola.log'
$Arq  = Join-Path $Repo 'logs\uskids-consola'
$Down = Join-Path $env:USERPROFILE 'Downloads'
try { $d = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; if ($d) { $Down = $d } } catch {}
# Só para testar: outra pasta e sem janelas de aviso.
if ($env:USKIDS_CONSOLA_PASTA) { $Down = $env:USKIDS_CONSOLA_PASTA }
$SemAvisos = [bool]$env:USKIDS_CONSOLA_SEM_AVISOS

function Log($m) { Add-Content -Path $Log -Value ("{0}  [aplicar] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 }
function Aviso([string]$texto, [string]$tipo = 'Information') {
    Log ("aviso: " + ($texto -replace "`n+", ' / '))
    if ($SemAvisos) { return }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($texto, 'USKids - recolha semanal', 'OK', $tipo) | Out-Null
}
# (não se pode chamar «Git»: o PowerShell não distingue maiúsculas e a função chamava-se a si própria)
function G { & git.exe -C $Repo @args 2>&1 | ForEach-Object { "$_" } }

$ficheiros = @(Get-ChildItem -Path $Down -File -Filter 'uskids-*.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^uskids-(inscritos-)?\d{4}-\d{2}-\d{2}-\d{4}' } | Sort-Object LastWriteTime)
if ($ficheiros.Count -eq 0) { exit 0 }

$f = $ficheiros[-1]
# O browser pode ainda estar a escrever: esperar que o tamanho pare.
$t1 = $f.Length; Start-Sleep -Seconds 5; $f.Refresh(); if ($f.Length -ne $t1) { exit 0 }

$Dados = @('public/data/uskids-field.json', 'public/data/uskids-pid-anchors.json',
           'public/data/uskids-results.json', 'public/data/uskids-results-index.json')
New-Item -ItemType Directory -Force -Path $Arq | Out-Null

function Arquivar([string]$destino) {
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
    foreach ($x in $ficheiros) { Move-Item -LiteralPath $x.FullName -Destination (Join-Path $destino $x.Name) -Force }
}

try {
    Log "ficheiro: $($f.Name) ($([math]::Round($f.Length / 1KB)) KB)"
    $sujos = G status --porcelain -- $Dados
    if ($sujos) { Log "há alterações por gravar nos dados USKids — não mexo, tento daqui a pouco: $($sujos -join '; ')"; exit 0 }

    $j = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json
    $nIns = @($j.torneios).Count; $nAlt = @($j.alteracoes).Count
    $nRes = if ($j.resultados) { @($j.resultados.torneios).Count } else { 0 }
    $recusa = if ($j.recusa) { " A USKids recusou a meio (HTTP $($j.recusa.status)); vai o que veio até aí." } else { '' }
    if ($nIns -eq 0 -and $nRes -eq 0) {
        Log 'ficheiro sem torneios — nada a aplicar.'
        Arquivar $Arq
        Aviso "O ficheiro da consola não trouxe torneios nenhuns — nada a publicar.$recusa" 'Warning'
        exit 0
    }

    G pull --rebase --autostash -q | ForEach-Object { Log "git: $_" }
    if ($LASTEXITCODE -ne 0) { throw 'git pull falhou' }

    Push-Location $Repo
    try {
        & node scripts/fetch-uskids-field.js --replay $f.FullName *>> $Log
        if ($LASTEXITCODE -notin 0, 2) { throw "fetch-uskids-field --replay saiu com $LASTEXITCODE" }
        if ($j.resultados) {
            & node scripts/fetch-uskids-results.js --replay $f.FullName *>> $Log
            if ($LASTEXITCODE -notin 0, 2) { throw "fetch-uskids-results --replay saiu com $LASTEXITCODE" }
        }

        $mudou = G status --porcelain -- $Dados
        if (-not $mudou) {
            Log 'nada de novo para gravar.'
            Arquivar $Arq
            Aviso "Ficheiro aplicado: nada de novo (inscritos de $nIns torneios, resultados de $nRes).$recusa"
            exit 0
        }

        & npm.cmd test *>> $Log
        if ($LASTEXITCODE -ne 0) { Log 'testes falharam — repito uma vez.'; & npm.cmd test *>> $Log }
        if ($LASTEXITCODE -ne 0) { throw 'npm test falhou' }
        & npm.cmd run build *>> $Log
        if ($LASTEXITCODE -ne 0) { throw 'npm run build falhou' }

        G add -- $Dados | Out-Null
        G commit -q -m "data: USKids pela consola do browser ($($f.Name): inscritos $nIns, resultados $nRes)" | ForEach-Object { Log "git: $_" }
        $ok = $false
        foreach ($i in 1..3) {
            G push -q | ForEach-Object { Log "git: $_" }
            if ($LASTEXITCODE -eq 0) { $ok = $true; break }
            G pull --rebase --autostash -q | ForEach-Object { Log "git: $_" }
        }
        if (-not $ok) { throw 'git push falhou 3 vezes (o commit ficou feito no PC)' }
    } finally { Pop-Location }

    Log "publicado: inscritos $nIns torneios ($nAlt alterações), resultados $nRes torneios."
    Arquivar $Arq
    Aviso ("Site actualizado com a recolha da consola.`n`n" +
        "Inscritos: $nIns torneios ($nAlt alterações).`nResultados: $nRes torneios novos.$recusa`n`n" +
        "Daqui a uns minutos já se vê em golf-fpg.vercel.app.")
} catch {
    $msg = $_.Exception.Message
    Log "ERRO: $msg"
    # Desfazer os dados (só os USKids) e pôr o ficheiro de lado, para não repetir de 10 em 10 minutos.
    G checkout -- $Dados | Out-Null
    Arquivar (Join-Path $Arq 'falhou')
    Aviso ("A recolha USKids NÃO foi publicada: $msg.`n`nO ficheiro ficou em $Arq\falhou\ e o registo em $Log.`nDiz ao Claude para ver.") 'Warning'
    exit 1
}
