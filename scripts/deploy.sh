#!/bin/bash
# =============================================================================
# deploy.sh — Grafinorte: deploy seguro com backup + build atômico
# Uso (da sua máquina local):
#   bash scripts/deploy.sh grafinorte@sistema.grafinorte.com.br
#   bash scripts/deploy.sh grafinorte@sistema.grafinorte.com.br --skip-backup
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔  $1${NC}"; }
info() { echo -e "${BLUE}→  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
err()  { echo -e "${RED}✖  $1${NC}"; exit 1; }
step() { echo -e "\n${BLUE}[$1]${NC}"; }

[ -z "${1:-}" ] && err "Uso: bash scripts/deploy.sh grafinorte@servidor"
SERVER="$1"
SKIP_BACKUP="${2:-}"
REMOTE_DIR="/home/grafinorte/app"

# Ler versão do package.json local
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "?")
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Grafinorte v$VERSION — Deploy${NC}"
echo -e "${BLUE}  Servidor: $SERVER${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"

# ── 1. Enviar arquivos ────────────────────────────────────────────────────────
step "1/4 — Enviando arquivos"
rsync -az --progress \
  --exclude 'node_modules' \
  --exclude 'client/node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'server/dist' \
  --exclude 'server/src/generated' \
  --exclude 'client/dist' \
  --exclude 'server/data' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude 'C:/Backups' \
  ./ "$SERVER:$REMOTE_DIR/"
ok "Arquivos enviados."

# ── 2–4. Tudo no servidor ─────────────────────────────────────────────────────
ssh "$SERVER" bash << REMOTE
set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "\${GREEN}✔  \$1\${NC}"; }
info() { echo -e "\${BLUE}→  \$1\${NC}"; }
err()  { echo -e "\${RED}✖  \$1\${NC}"; exit 1; }

APP="$REMOTE_DIR"
BACKUP_DIR="/home/grafinorte/backups"
VERSION="$VERSION"

# ── 2. Backup antes de qualquer coisa ────────────────────────────────────────
echo -e "\n\${BLUE}[2/4 — Backup pré-deploy]\${NC}"
if [ "$SKIP_BACKUP" != "--skip-backup" ]; then
  bash "\$APP/scripts/backup.sh"
  ok "Backup criado."
else
  echo -e "\${YELLOW}⚠  Backup ignorado (--skip-backup)\${NC}"
fi

# Salvar versão anterior do dist (para rollback rápido)
if [ -d "\$APP/server/dist" ]; then
  rm -rf "\$APP/server/dist-previous"
  cp -r "\$APP/server/dist" "\$APP/server/dist-previous"
fi
if [ -d "\$APP/client/dist" ]; then
  rm -rf "\$APP/client/dist-previous"
  cp -r "\$APP/client/dist" "\$APP/client/dist-previous"
fi

# ── 3. Build (em paralelo, não derruba o app ainda) ──────────────────────────
echo -e "\n\${BLUE}[3/4 — Build]\${NC}"
cd "\$APP"

info "Instalando dependências do servidor..."
cd server && npm install --omit=dev --silent

info "Compilando servidor TypeScript..."
npm run build

info "Gerando cliente Prisma..."
npx prisma generate --silent

cd "\$APP/client"
info "Instalando dependências do frontend..."
npm install --silent

info "Compilando frontend..."
npm run build
ok "Build v\$VERSION concluído."

# ── 4. Migração do banco + restart (momento de downtime mínimo) ───────────────
echo -e "\n\${BLUE}[4/4 — Migração + Restart]\${NC}"
cd "\$APP/server"

info "Aplicando migrations do banco..."
npx prisma migrate deploy

info "Reiniciando app (graceful reload)..."
cd "\$APP"
pm2 reload grafinorte --update-env || pm2 start pm2.config.js
pm2 save

# Salvar versão deployada
echo "\$VERSION" > "\$APP/.version"
ok "v\$VERSION no ar!"
echo ""
pm2 status grafinorte
REMOTE

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy v$VERSION concluído com sucesso!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo -e "  Para reverter se algo der errado:"
echo -e "  ${YELLOW}bash scripts/rollback.sh $SERVER${NC}"
