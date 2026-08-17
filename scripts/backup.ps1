# ─────────────────────────────────────────────────────────────────────────────
# backup.ps1 — Grafinorte: backup para Windows (máquina atual)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# Agendar: Agendador de Tarefas do Windows, todo dia às 03:00
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ── Configurações ─────────────────────────────────────────────────────────────
$AppDir    = Split-Path -Parent $PSScriptRoot          # raiz do projeto
$BackupDir = "C:\Backups\Grafinorte"                   # onde salvar
$KeepDays  = 30                                         # dias para manter
$Date      = Get-Date -Format "yyyyMMdd_HHmmss"
$ZipFile   = "$BackupDir\grafinorte_$Date.zip"
$LogFile   = "$BackupDir\backup.log"

# ── Criar pasta ───────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

Log "Iniciando backup..."

# ── Itens a incluir no backup ─────────────────────────────────────────────────
$items = @(
    "$AppDir\server\data\grafinorte.db",
    "$AppDir\server\data\avatars",
    "$AppDir\server\data\attachments",
    "$AppDir\server\data\hr-documents",
    "$AppDir\server\.env",
    "$AppDir\downloads",
    "$AppDir\base-conhecimento",
    "$AppDir\arquivos"
)

# ── Cópia segura do banco (funciona com o servidor rodando) ───────────────────
$DbSource = "$AppDir\server\data\grafinorte.db"
$DbTemp   = "$BackupDir\grafinorte_db_temp.db"

node -e "
const DB = require('$($AppDir.Replace('\','/'))/node_modules/better-sqlite3');
const src = new DB('$($DbSource.Replace('\','/'))');
src.backup('$($DbTemp.Replace('\','/'))').then(() => { src.close(); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
"
if ($LASTEXITCODE -ne 0) { Log "ERRO: falha ao copiar banco de dados."; exit 1 }
Log "Cópia segura do banco criada."

# ── Criar ZIP ─────────────────────────────────────────────────────────────────
# Substituir o .db original pela cópia temporária na lista
$items = $items | Where-Object { $_ -ne $DbSource }
$items += $DbTemp

Add-Type -Assembly "System.IO.Compression.FileSystem"
$zip = [System.IO.Compression.ZipFile]::Open($ZipFile, 'Create')

foreach ($item in $items) {
    if (-not (Test-Path $item)) { continue }

    if (Test-Path $item -PathType Leaf) {
        $entryName = if ($item -eq $DbTemp) { "server\data\grafinorte.db" } else { $item.Substring($AppDir.Length + 1) }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item, $entryName) | Out-Null
    } else {
        Get-ChildItem $item -Recurse -File | ForEach-Object {
            $entry = $_.FullName.Substring($AppDir.Length + 1)
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry) | Out-Null
        }
    }
}

$zip.Dispose()
Remove-Item $DbTemp -Force -ErrorAction SilentlyContinue

$size = "{0:N2} MB" -f ((Get-Item $ZipFile).Length / 1MB)
Log "Backup criado: $ZipFile ($size)"

# ── Remover backups antigos ───────────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$KeepDays)
$old = Get-ChildItem "$BackupDir\grafinorte_*.zip" | Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old) {
    $old | Remove-Item -Force
    Log "$($old.Count) backup(s) antigo(s) removido(s)."
}

Log "Concluído."
Write-Host ""
Write-Host "Últimos backups:"
Get-ChildItem "$BackupDir\grafinorte_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 |
    Format-Table Name, @{N="Tamanho";E={"{0:N1} MB" -f ($_.Length/1MB)}}, LastWriteTime -AutoSize
