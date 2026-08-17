#!/bin/bash
# =============================================================================
# rollback.sh — Grafinorte: reverter para a versão anterior em segundos
# Uso (da sua máquina local):
#   bash scripts/rollback.sh grafinorte@sistema.grafinorte.com.br
# Ou diretamente no servidor:
#   bash /home/grafinorte/app/scripts/rollback.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
err()  { echo -e "${RED}✖  $1${NC}"; exit 1; }

APP_DIR="/home/grafinorte/app"
BACKUP_DIR="/home/grafinorte/backups"

do_rollback() {
  echo -e "${YELLOW}══════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  Grafinorte — ROLLBACK${NC}"
  echo -e "${YELLOW}══════════════════════════════════════════${NC}"
  echo ""

  CURRENT=$(cat "$APP_DIR/.version" 2>/dev/null || echo "desconhecida")
  warn "Versão atual: $CURRENT"
  echo ""

  # ── Opção 1: reverter dist (rápido, não mexe no banco) ─────────────────────
  if [ -d "$APP_DIR/server/dist-previous" ] && [ -d "$APP_DIR/client/dist-previous" ]; then
    echo "Opções de rollback:"
    echo "  1) Reverter código (dist anterior) — não mexe no banco [RÁPIDO]"
    echo "  2) Restaurar backup completo do banco — usa último backup [MAIS SEGURO]"
    echo "  3) Cancelar"
    echo ""
    read -rp "Escolha (1/2/3): " CHOICE

    case "$CHOICE" in
      1)
        echo ""
        warn "Revertendo código para versão anterior..."

        # Swap: current → broken, previous → active
        rm -rf "$APP_DIR/server/dist-broken" "$APP_DIR/client/dist-broken"
        mv "$APP_DIR/server/dist"          "$APP_DIR/server/dist-broken"
        mv "$APP_DIR/client/dist"          "$APP_DIR/client/dist-broken"
        mv "$APP_DIR/server/dist-previous" "$APP_DIR/server/dist"
        mv "$APP_DIR/client/dist-previous" "$APP_DIR/client/dist"

        pm2 reload grafinorte --update-env
        ok "Código revertido. App rodando com versão anterior."
        ;;

      2)
        echo ""
        echo "Últimos backups disponíveis:"
        ls -1t "$BACKUP_DIR"/grafinorte_*.tar.gz 2>/dev/null | head -5 | nl -w1 -s') '
        echo ""
        read -rp "Número do backup para restaurar (Enter = mais recente): " BNUM
        BNUM="${BNUM:-1}"

        BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/grafinorte_*.tar.gz 2>/dev/null | sed -n "${BNUM}p")
        [ -z "$BACKUP_FILE" ] && err "Backup não encontrado."

        warn "Restaurando: $(basename "$BACKUP_FILE")"
        read -rp "Tem certeza? Isso vai sobrescrever os dados atuais (s/N): " SURE
        [[ "$SURE" != "s" && "$SURE" != "S" ]] && err "Cancelado."

        # Parar app, restaurar, reiniciar
        pm2 stop grafinorte

        tar -xzf "$BACKUP_FILE" -C "$APP_DIR" \
          server/data/grafinorte.db \
          2>/dev/null || true

        # Reverter código também
        if [ -d "$APP_DIR/server/dist-previous" ]; then
          rm -rf "$APP_DIR/server/dist"
          mv "$APP_DIR/server/dist-previous" "$APP_DIR/server/dist"
        fi
        if [ -d "$APP_DIR/client/dist-previous" ]; then
          rm -rf "$APP_DIR/client/dist"
          mv "$APP_DIR/client/dist-previous" "$APP_DIR/client/dist"
        fi

        pm2 start grafinorte
        ok "Backup restaurado. App reiniciado."
        ;;

      *)
        err "Rollback cancelado."
        ;;
    esac
  else
    warn "Sem dist-previous disponível. Usando restauração de backup..."

    echo "Últimos backups disponíveis:"
    ls -1t "$BACKUP_DIR"/grafinorte_*.tar.gz 2>/dev/null | head -5 | nl -w1 -s') '
    echo ""
    read -rp "Número do backup (Enter = mais recente): " BNUM
    BNUM="${BNUM:-1}"
    BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/grafinorte_*.tar.gz 2>/dev/null | sed -n "${BNUM}p")
    [ -z "$BACKUP_FILE" ] && err "Nenhum backup encontrado em $BACKUP_DIR"

    warn "Restaurando banco de: $(basename "$BACKUP_FILE")"
    read -rp "Confirmar? (s/N): " SURE
    [[ "$SURE" != "s" && "$SURE" != "S" ]] && err "Cancelado."

    pm2 stop grafinorte
    tar -xzf "$BACKUP_FILE" -C "$APP_DIR" server/data/grafinorte.db 2>/dev/null || true
    pm2 start grafinorte
    ok "Banco restaurado. App reiniciado."
  fi

  echo ""
  pm2 status grafinorte
}

# Rodar local ou remoto
if [ -n "${1:-}" ]; then
  # Executar no servidor via SSH
  SERVER="$1"
  echo -e "${YELLOW}Conectando em $SERVER para rollback...${NC}"
  ssh "$SERVER" "bash $APP_DIR/scripts/rollback.sh"
else
  # Já está no servidor
  do_rollback
fi
