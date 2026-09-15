# PC de trabalho — arranque remoto e `claude rc`

Montado a **2026-09-15**. Objectivo: poder **ligar o PC à distância** e encontrar o
Claude Code já a correr, para trabalhar a partir do telemóvel (`claude.ai/code`)
sem ninguém estar em casa.

## Hardware

| | |
|---|---|
| Motherboard | **ASUS PRIME B760M-A WIFI D4** · BIOS **1825** (AMI 2.22.1286) |
| CPU | Intel Core **i5-14600KF** (⚠ `KF` = sem gráficos integrados) |
| RAM | 32 GB DDR4 (2× 16 GB, 2666 + 3200 — a correr a 2666, XMP `Disabled`) |
| Disco de arranque | NVMe M.2_1 — WD Green SN3000 1 TB |
| Rede | **Ethernet por cabo** — Realtek Gaming 2.5GbE, ligado a **1 Gbps** |
| Conta Windows | `Mariana` · **MicrosoftAccount** (`mariana.tomass@gmail.com`) |
| Projecto | `C:\golf-fpg` |

## A cadeia completa

```
[tomada Tapo]  ou  [RTC 08:55]  ou  [botão]
        ↓
   BIOS: Restore AC Power Loss = Power On
        ↓
   Windows: login automático (netplwiz)
        ↓
   Pasta de Arranque: claude-rc.cmd  →  claude rc  (em C:\)
        ↓
   claude.ai/code no telemóvel
```

---

## 1. BIOS — `Advanced \ APM Configuration`

Chega-se lá com **Del** no arranque → **F7** (Advanced Mode) → separador
**Advanced** → **APM Configuration**. Gravar com **F10**.

| Definição | Valor | Para quê |
|---|---|---|
| `Restore AC Power Loss` | **Power On** | arranca quando a corrente volta — é o que a tomada Tapo usa |
| `Max Power Saving` | Disabled | — |
| `ErP Ready` | **Disabled** | ⚠ se activo, corta a alimentação em standby e **estraga tudo o resto** |
| `Power On By PCI-E` | **Enabled** | Wake-on-LAN (funciona porque há cabo; por Wi-Fi não funcionaria) |
| `Power On By RTC` | **Enabled** | despertador |
| `RTC Alarm Date (Days)` | **0** | ⚠ `0` = **todos os dias**; 1–31 seria só nesse dia do mês |
| `- Hour` / `- Minute` | **8** / **55** | liga-se às **08:55**, hora local |

⚠ **`Restore AC Power Loss` já estava em `Power On`** antes de mexermos — não
apareceu na lista de alterações do F10. A tomada já funcionaria desde sempre.

⚠ `Last State` **não serve** no lugar de `Power On`: só religa se o PC estivesse
ligado quando a corrente faltou.

### O que isto implica no dia-a-dia

- Encerrar o Windows normalmente → **fica desligado**. A corrente não faltou.
- Um **apagão** em casa → quando a luz voltar, o PC acende. É o mesmo mecanismo,
  não dá para ter um sem o outro.
- Às **08:55 de todos os dias** o PC liga-se, esteja lá quem estiver. Se já
  estiver ligado, não acontece nada.

---

## 2. Tomada inteligente — TP-Link **Tapo P100**

`S/N 2263822011437` · MAC `18-69-45-44-85-1B` · 100-240 V, 10 A máx (2300 W).

Ligar o PC à distância: app Tapo → **desligar** a tomada → esperar ~15 s →
**ligar**. O PC arranca. Dar 1–2 minutos até o `claude rc` estar ligado.

⚠ **NUNCA desligar a tomada com o PC a trabalhar.** É arrancar a ficha da
parede — pode corromper ficheiros, o Git ou o Windows.

Para **desligar** à distância, usar a própria sessão do Claude:

```powershell
shutdown /s /t 0
```

A tomada fica ligada, pronta para o arranque seguinte.

---

## 3. Login automático

Necessário porque, sem ele, o PC liga-se mas fica no ecrã do PIN e o `claude rc`
**nunca arranca** — o objectivo inteiro falha.

### Como está configurado

```powershell
# (Administrador) revela a caixa do netplwiz no Windows 11
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device" `
  /v DevicePasswordLessBuildVersion /t REG_DWORD /d 0 /f
```

Depois `netplwiz` → separador **Utilizadores** → conta `Mariana` → **desmarcar**
"Os utilizadores têm de introduzir um nome de utilizador e uma palavra-passe…"
→ **Aplicar** → credenciais.

| Campo | Valor |
|---|---|
| Nome de utilizador | **`mariana.tomass@gmail.com`** |
| Palavra-passe | a da **conta Microsoft** |

### ⚠ As três armadilhas (todas apanhadas ao vivo)

**1. O nome de utilizador é o EMAIL, não "Mariana".** O `netplwiz` guarda por
defeito o nome curto, e com conta Microsoft isso dá *"O nome de utilizador ou
palavra-passe estão errados"* em todos os arranques.

**2. O PIN não serve.** O PIN é local ao dispositivo (Windows Hello); o login
automático valida a **palavra-passe da conta**. São credenciais diferentes — quem
só usa PIN muitas vezes não sabe a palavra-passe.

**3. A palavra-passe tem de estar em cache antes.** Nunca tendo sido usada neste
PC, o Windows valida-a **online** — e no arranque a frio a rede ainda não
levantou (link + DHCP demoram segundos), dando *"De momento, não é possível
ligar. Verifique a sua rede"*. **A cura:** entrar uma vez com a palavra-passe
(Win+L → *Opções de início de sessão* → ícone da palavra-passe) **com o PC já
ligado e online**. A partir daí fica em cache e os arranques seguintes já não
precisam de rede.

> ⚠ Nota de diagnóstico: esse erro *"não é possível ligar"* foi primeiro
> atribuído ao Wi-Fi. Errado — o PC está por **cabo** (`Get-NetAdapter` mostrou
> Ethernet 2 @ 1 Gbps). A causa é o *timing* da rede no arranque, não a falta
> dela.

### Como entrar se o automático falhar

Nunca se fica bloqueada:

1. **OK** no erro → **"Opções de início de sessão"** → ícone do **PIN** → PIN
2. Ou reiniciar com o **`Shift`** carregado (salta a tentativa automática)

### Como reverter

```powershell
# (Administrador)
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" `
  /v AutoAdminLogon /t REG_SZ /d 0 /f
```

E `netplwiz` → **marcar** a caixa de volta.

> `reg delete … /v DefaultPassword` responde `ERROR: … unable to find` — é o
> esperado: o `netplwiz` guarda a credencial cifrada no LSA, não em texto simples
> no registo.

### Segurança — o que isto custa

Quem se sentar fisicamente a este PC entra na conta sem palavra-passe, e a
credencial fica guardada na máquina (cifrada, mas acessível a administrador).
Aceite de propósito: é um PC de uso pessoal, só da Mariana.

---

## 4. Arranque do `claude rc`

Ficheiro na pasta de Arranque do utilizador:

```
C:\Users\Mariana\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\claude-rc.cmd
```

```bat
@echo off
start "" /min cmd /c "cd /d C:\ && claude rc"
```

Recriar/alterar:

```powershell
$startup = [Environment]::GetFolderPath('Startup')
@'
@echo off
start "" /min cmd /c "cd /d C:\ && claude rc"
'@ | Set-Content -Path "$startup\claude-rc.cmd" -Encoding ASCII
```

⚠ **Corre em `C:\` por decisão da utilizadora.** Consequência: as sessões
remotas nascem na raiz do disco — sem o `CLAUDE.md` do projecto e com acesso a
todo o disco. Para as prender ao projecto, trocar `C:\` por `C:\golf-fpg`.

⚠ **`claude rc` faz perguntas na PRIMEIRA vez em cada directório**
("Enable Remote Control? (y/n)", e depois o *spawn mode* `[1] same-dir` /
`[2] worktree`). Já respondidas em `C:\` e em `C:\golf-fpg` (ambas `same-dir`),
por isso o arranque automático não fica preso à espera. **Se um dia se apontar o
script a uma pasta nova, correr `claude rc` lá à mão uma vez primeiro.**

### Onde está o `claude`

`C:\Users\Mariana\AppData\Roaming\npm` (instalação npm global). Esta pasta
**não estava no PATH** — era esse o erro `claude : The term 'claude' is not
recognized`. Acrescentada ao PATH do utilizador; se voltar a desaparecer:

```powershell
$npmBin = "$env:APPDATA\npm"
$userPath = [Environment]::GetEnvironmentVariable("Path","User")
if ($userPath -notlike "*$npmBin*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$npmBin", "User")
}
```

⚠ Só faz efeito em **janelas novas**.

---

## 5. Energia — não adormecer

Sem isto o PC ligava às 08:55 e adormecia 20 minutos depois, matando a sessão.

```powershell
powercfg /change standby-timeout-ac 0     # nunca suspende
powercfg /change hibernate-timeout-ac 0   # nunca hiberna
powercfg /change monitor-timeout-ac 15    # ecrã apaga aos 15 min (inofensivo)
```

---

## 6. Problemas conhecidos

### A interface do Claude Code pisca (ecrã todo a redesenhar-se)

**Não é do terminal nem da placa gráfica** — isolado por eliminação: um
`ping -t` no mesmo terminal não pisca, só a interface do Claude. O *Terminal do
Windows* já é o predefinido e as opções de Renderização não resolveram.

**Contornado** com o `start "" /min` do script de arranque: a janela nasce
minimizada e não incomoda.

Por tentar: encolher a janela (o custo do redesenho é proporcional à área) e
reportar com `/bug` dentro de uma sessão (versão à data: **2.1.272**).

### `Everything` — popup no arranque

Já está **Desativado** nas Aplicações de arranque, mas o popup persiste — vem
provavelmente do **serviço** ou de uma **tarefa agendada**. Por confirmar:

```powershell
Get-Service -Name "*Everything*" | Select-Object Name, Status, StartType
Get-ScheduledTask | Where-Object TaskName -like "*Everything*" | Select-Object TaskName, State
```

Desligar (Administrador):

```powershell
Get-Service -Name "*Everything*" | Stop-Service -Force
Get-Service -Name "*Everything*" | Set-Service -StartupType Disabled
Get-ScheduledTask | Where-Object TaskName -like "*Everything*" | Disable-ScheduledTask
```

Mais limpo: dentro do Everything → **Tools → Options → General**, desmarcar
*"Start Everything on system startup"* e o *Everything Service* (ele tende a
repor-se se for desligado só por fora).

---

## 7. Teste de ponta a ponta

Sem tocar no PC:

1. Encerrar o Windows normalmente
2. App Tapo: desligar a tomada → ~15 s → ligar
3. Esperar 1–2 minutos
4. `claude.ai/code` no telemóvel — a sessão deve aparecer

---

## 8. Cartão de emergência

| Situação | O que fazer |
|---|---|
| Pede credenciais / erro no arranque | OK → *Opções de início de sessão* → **PIN** |
| Preso em ciclo de erro | Reiniciar com **`Shift`** carregado |
| Quero desfazer o login automático | `netplwiz` → **marcar** a caixa + `AutoAdminLogon = 0` |
| Quero que não ligue após apagão | BIOS → `Restore AC Power Loss` = **Power Off** (⚠ perde-se a tomada Tapo) |
| Quero acabar com o despertador | BIOS → `Power On By RTC` = **Disabled** |
| `claude` não é reconhecido | pôr `%APPDATA%\npm` no PATH e abrir janela nova |
| Desligar o PC à distância | pela sessão do Claude: `shutdown /s /t 0` |
