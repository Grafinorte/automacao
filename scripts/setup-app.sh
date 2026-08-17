#!/bin/bash
# =============================================================================
# setup-app.sh — Grafinorte: configuração inicial do app no servidor
# Executar como usuário 'grafinorte' após enviar os arquivos:
#   su - grafinorte
#   cd app && bash scripts/setup-app.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $1${NC}"; }
info() { echo -e "${BLUE}→ $1${NC}"; }
err()  { echo -e "${RED}✖ $1${NC}"; exit 1; }
step() { echo -e "\n${BLUE}── $1 ──${NC}"; }

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

step "1/6 — Instalando dependências do servidor"
cd server && npm install --omit=dev --silent
ok "Dependências instaladas."

step "2/6 — Compilando TypeScript"
npm run build
ok "Build do servidor concluído."

step "3/6 — Compilando frontend"
cd "$APP_DIR/client"
npm install --silent
npm run build
ok "Build do frontend concluído."

step "4/6 — Banco de dados"
cd "$APP_DIR/server"
npx prisma db push --accept-data-loss
npx prisma generate
ok "Banco de dados atualizado."

step "5/6 — Verificando .env"
if [ ! -f "$APP_DIR/server/.env" ]; then
  err "Arquivo server/.env não encontrado. Copie o .env da máquina local para o servidor antes de continuar."
fi
ok ".env encontrado."

step "6/6 — Iniciando com PM2"
cd "$APP_DIR"
pm2 delete grafinorte 2>/dev/null || true
pm2 start pm2.config.js
pm2 save

# Configurar PM2 para iniciar no boot (precisa rodar o comando que ele imprimir como root)
echo ""
echo -e "${YELLOW}Para o app iniciar automaticamente no boot, rode como root:${NC}"
pm2 startup | tail -1
echo ""

ok "App rodando!"
pm2 status
echo ""
echo -e "${GREEN}Acesse: http://$(hostname -I | awk '{print $1}'):4000${NC}"
