#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — Grafinorte: backup diário automático
# Uso: ./scripts/backup.sh
# Cron (todo dia às 03:00): 0 3 * * * /home/grafinorte/app/scripts/backup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configurações ─────────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # raiz do projeto
BACKUP_DIR="/home/grafinorte/backups"          # onde salvar os backups
KEEP_DAYS=30                                   # quantos dias manter
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/grafinorte_$DATE.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

# ── Criar pasta de backup ─────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup..." | tee -a "$LOG_FILE"

# ── Criar arquivo tar.gz com tudo importante ──────────────────────────────────
tar -czf "$BACKUP_FILE" \
  --exclude="$APP_DIR/server/data/*.bak*" \
  --exclude="$APP_DIR/server/data/grafinorte_backup_*.db" \
  -C "$APP_DIR" \
  server/data/grafinorte.db \
  server/data/avatars \
  server/data/attachments \
  server/data/hr-documents \
  server/.env \
  downloads \
  base-conhecimento \
  arquivos \
  2>/dev/null || true

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup criado: $BACKUP_FILE ($SIZE)" | tee -a "$LOG_FILE"

# ── Remover backups antigos ───────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "grafinorte_*.tar.gz" -mtime +$KEEP_DAYS -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $DELETED backup(s) antigo(s) removido(s)." | tee -a "$LOG_FILE"
fi

# ── (Opcional) Enviar para Google Drive via rclone ───────────────────────────
# Descomente as linhas abaixo após configurar: rclone config
# RCLONE_DEST="gdrive:Grafinorte/Backups"
# rclone copy "$BACKUP_FILE" "$RCLONE_DEST" --log-file="$LOG_FILE" --log-level INFO
# echo "[$(date '+%Y-%m-%d %H:%M:%S')] Enviado para Google Drive." | tee -a "$LOG_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Concluído." | tee -a "$LOG_FILE"

# ── Listar últimos 5 backups ──────────────────────────────────────────────────
echo ""
echo "Últimos backups:"
ls -lh "$BACKUP_DIR"/grafinorte_*.tar.gz 2>/dev/null | tail -5
