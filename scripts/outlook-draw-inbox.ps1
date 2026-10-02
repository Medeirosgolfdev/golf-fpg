# outlook-draw-inbox.ps1 — tarefa do Windows "GolfFPG-DrawsEmail".
#
# Os draws do CGSS chegam por email do clube (João Góis, joaogoes@santodaserragolf.com)
# ao Outlook da BetaSol — não ao Gmail, por isso a inbox cloud (draw-inbox-email.yml)
# nunca os vê. Este script:
#   1. lê o Outlook do PC (COM) e procura emails do domínio santodaserragolf.com
#      dos últimos -Dias dias com anexos PDF cujo nome tenha "draw" (havendo
#      versão "extenso" no mesmo email, só essa);
#   2. grava cada PDF ainda não visto em C:\golf-fpg\draws-inbox\ (o nome leva a
#      data/hora do email, para as versões "DRAW ATUALIZADO" ficarem por ordem);
#   3. corre o scripts\process-draw-inbox.js, que insere/actualiza o torneio
#      (add-cgss-draw.js --strict-cgss --update), corre os testes e faz commit + push.
#
# O que já foi visto fica em draws-inbox\outlook-vistos.json (EntryID + nome do
# anexo). Log em draws-inbox\outlook-log.txt.
#
# ⚠ NÃO ler endereços de email (SenderEmailAddress, GetExchangeUser…): disparam o
# "Object Model Guard" do Outlook, que pede um clique e pendura a tarefa. O remetente
# filtra-se por DASL dentro do Restrict (padrão do extract_outlook.ps1 das viagens).
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\outlook-draw-inbox.ps1
#        [-Dias 7] [-SoGravar] [-Destino <pasta>]

param([int]$Dias = 7, [switch]$SoGravar, [string]$Destino = 'C:\golf-fpg\draws-inbox',
      [int]$TimeoutSegundos = 600)
$ErrorActionPreference = 'Stop'
$repo = 'C:\golf-fpg'
New-Item -ItemType Directory -Force $Destino | Out-Null
$logFile = Join-Path $Destino 'outlook-log.txt'
$vistosFile = Join-Path $Destino 'outlook-vistos.json'
function Log($m) {
    $l = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
    Write-Host $l
    Add-Content -LiteralPath $logFile -Value $l -Encoding UTF8
}

$vistos = @{}
if (Test-Path -LiteralPath $vistosFile) {
    foreach ($k in (Get-Content -LiteralPath $vistosFile -Raw -Encoding UTF8 | ConvertFrom-Json)) { $vistos[$k] = $true }
}

# --- ligação ao Outlook, com repetição (o COM recusa chamadas enquanto arranca/fecha)
$outlook = $null
for ($try = 1; $try -le 5; $try++) {
    try {
        $outlook = New-Object -ComObject Outlook.Application
        $ns = $outlook.GetNamespace('MAPI')
        $null = $ns.Stores.Count
        break
    } catch {
        if ($try -eq 5) { Log "ERRO: não consegui falar com o Outlook: $($_.Exception.Message)"; exit 1 }
        Start-Sleep -Seconds (5 * $try)
    }
}

$desde = (Get-Date).AddDays(-$Dias)
$deadline = (Get-Date).AddSeconds($TimeoutSegundos)
$sql = "@SQL=(""urn:schemas:httpmail:datereceived"" >= '$($desde.ToString('yyyy-MM-dd HH:mm'))') AND " +
       "(""urn:schemas:httpmail:fromemail"" LIKE '%@santodaserragolf.com')"

$novos = New-Object System.Collections.Generic.List[string]
function Scan($folder) {
    if ((Get-Date) -gt $deadline) { return }
    if ($folder.Name -match 'Calend|Contact|Tarefa|Task|Sincroniz|Sync Issues|RSS|Conversation History|Notas|Notes|Itens Eliminados|Deleted Items|Lixo|Junk') { return }
    try { $items = $folder.Items } catch { return }
    try {
        foreach ($item in $items.Restrict($sql)) {
            $draws = @($item.Attachments | Where-Object { $_.FileName -match '\.pdf$' -and $_.FileName -match 'draw' })
            # o clube manda o mesmo draw "extenso" e "em colunas": a versão em colunas
            # cola o handicap a alguns nomes; a extensa traz o clube de cada jogador
            $extenso = @($draws | Where-Object { $_.FileName -match 'extenso' })
            foreach ($att in $draws) {
                $fn = $att.FileName
                $chave = "$($item.EntryID)|$fn"
                if ($script:vistos.ContainsKey($chave)) { continue }
                if ($extenso.Count -gt 0 -and $fn -notmatch 'extenso') {
                    $script:vistos[$chave] = $true
                    Log "ignorado (há versão extensa no mesmo email): $fn"
                    continue
                }
                $quando = $item.ReceivedTime
                $nome = '{0}_{1}' -f $quando.ToString('yyyyMMdd-HHmm'), ($fn -replace '[\\/:*?"<>|]', '_')
                $dest = Join-Path $Destino $nome
                if (-not (Test-Path -LiteralPath $dest)) {
                    $att.SaveAsFile($dest)
                    # mtime antigo: o process-draw-inbox.js ignora PDFs com <60 s (ainda a gravar)
                    (Get-Item -LiteralPath $dest).LastWriteTime = $quando
                    $script:novos.Add($nome)
                    Log "novo: $nome  (assunto: $($item.Subject))"
                }
                $script:vistos[$chave] = $true
            }
        }
    } catch {}
    foreach ($sub in $folder.Folders) { Scan $sub }
}
foreach ($store in $ns.Stores) {
    try { Scan $store.GetRootFolder() } catch {}
}
($vistos.Keys | Sort-Object) | ConvertTo-Json | Set-Content -LiteralPath $vistosFile -Encoding UTF8

if ($novos.Count -eq 0) { Log "sem draws novos nos últimos $Dias dias."; exit 0 }
Log "$($novos.Count) PDF(s) de draw novos."
if ($SoGravar) { exit 0 }

Set-Location -LiteralPath $repo
# a saída do node vem em UTF-8; sem isto o log fica com os acentos trocados
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$out = & node scripts\process-draw-inbox.js 2>&1
$out | ForEach-Object { Add-Content -LiteralPath $logFile -Value "    $_" -Encoding UTF8 }
Log "process-draw-inbox terminou (saída $LASTEXITCODE)."
exit $LASTEXITCODE
