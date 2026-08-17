#!/bin/bash
# =============================================================================
# install-server.sh — Grafinorte: instalação completa no Debian 13
# Execução: bash scripts/install-server.sh
# Precisa rodar como root: sudo bash scripts/install-server.sh
# =============================================================================

set -euo pipefail

# ── Cores ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $1${NC}"; }
info() { echo -e "${BLUE}→ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✖ $1${NC}"; exit 1; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# ── Verificações iniciais ──────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash $0"

step "Grafinorte — Instalação do Servidor"
echo ""
echo "Este script vai instalar:"
echo "  • Node.js 20 LTS"
echo "  • PM2 (gerenciador de processos)"
echo "  • Nginx (proxy reverso)"
echo "  • Certbot (SSL grátis)"
echo "  • UFW (firewall)"
echo ""

# ── Coletar configurações ──────────────────────────────────────────────────────
read -rp "Domínio do sistema (ex: sistema.grafinorte.com.br): " DOMAIN
[ -z "$DOMAIN" ] && err "Domínio obrigatório."

read -rp "E-mail para o certificado SSL: " SSL_EMAIL
[ -z "$SSL_EMAIL" ] && err "E-mail obrigatório."

APP_USER="grafinorte"
APP_DIR="/home/$APP_USER/app"
BACKUP_DIR="/home/$APP_USER/backups"
DATA_DIR="$APP_DIR/server/data"
NODE_VERSION="20"

echo ""
info "Domínio : $DOMAIN"
info "App dir : $APP_DIR"
info "Backups : $BACKUP_DIR"
echo ""
read -rp "Confirmar e iniciar instalação? (s/N): " CONFIRM
[[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && err "Instalação cancelada."

# ── 1. Atualizar sistema ───────────────────────────────────────────────────────
step "1/8 — Atualizando sistema"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg2 unzip git ufw
ok "Sistema atualizado."

# ── 2. Node.js via NodeSource ──────────────────────────────────────────────────
step "2/8 — Instalando Node.js $NODE_VERSION LTS"
if command -v node &>/dev/null && node -e "process.exit(parseInt(process.version.slice(1)) >= $NODE_VERSION ? 0 : 1)" 2>/dev/null; then
  ok "Node.js $(node -v) já instalado."
else
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - -qq
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) instalado."
fi

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
step "3/8 — Instalando PM2"
npm install -g pm2 --silent
ok "PM2 $(pm2 -v) instalado."

# ── 4. Nginx ──────────────────────────────────────────────────────────────────
step "4/8 — Instalando Nginx"
apt-get install -y -qq nginx
systemctl enable nginx
systemctl start nginx
ok "Nginx instalado e rodando."

# ── 5. Certbot ────────────────────────────────────────────────────────────────
step "5/8 — Instalando Certbot"
apt-get install -y -qq certbot python3-certbot-nginx
ok "Certbot instalado."

# ── 6. Usuário e diretórios ───────────────────────────────────────────────────
step "6/8 — Criando usuário e diretórios"
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  ok "Usuário '$APP_USER' criado."
else
  ok "Usuário '$APP_USER' já existe."
fi

mkdir -p \
  "$APP_DIR" \
  "$BACKUP_DIR" \
  "$DATA_DIR/avatars" \
  "$DATA_DIR/attachments" \
  "$DATA_DIR/hr-documents" \
  "$APP_DIR/downloads" \
  "$APP_DIR/base-conhecimento" \
  "$APP_DIR/arquivos"

chown -R "$APP_USER:$APP_USER" "/home/$APP_USER"
ok "Diretórios criados."

# ── 7. Nginx — configuração do site ───────────────────────────────────────────
step "7/8 — Configurando Nginx"

cat > /etc/nginx/sites-available/grafinorte << NGINXCONF
server {
    listen 80;
    server_name $DOMAIN;

    # Tamanho máximo de upload (avatares, anexos, PDFs)
    client_max_body_size 20M;

    # Proxy para o app Node.js
    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # SSE (notificações em tempo real)
        proxy_read_timeout 3600s;
        proxy_buffering    off;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/grafinorte /etc/nginx/sites-enabled/grafinorte
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
ok "Nginx configurado para $DOMAIN."

# ── 8. Firewall ───────────────────────────────────────────────────────────────
step "8/8 — Configurando firewall (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable
ok "Firewall ativo: SSH + HTTP + HTTPS liberados."

# ── Arquivo de configuração do PM2 ────────────────────────────────────────────
cat > "$APP_DIR/pm2.config.js" << 'PM2CONF'
module.exports = {
  apps: [{
    name: 'grafinorte',
    script: 'dist/index.js',
    cwd: './server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
    },
    error_file: '../logs/pm2-error.log',
    out_file: '../logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
PM2CONF

mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Arquivo pm2.config.js criado."

# ── Cron de backup ────────────────────────────────────────────────────────────
CRON_LINE="0 3 * * * $APP_DIR/scripts/backup.sh >> $BACKUP_DIR/backup.log 2>&1"
(crontab -u "$APP_USER" -l 2>/dev/null | grep -v "backup.sh"; echo "$CRON_LINE") | crontab -u "$APP_USER" -
ok "Backup automático agendado para 03h00 todo dia."

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Instalação concluída!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo ""
echo "  1. Envie os arquivos do app para o servidor:"
echo -e "     ${BLUE}rsync -avz --exclude node_modules --exclude 'server/dist' \\"
echo -e "       ./ $APP_USER@$DOMAIN:/home/$APP_USER/app/${NC}"
echo ""
echo "  2. No servidor, entre como grafinorte e configure:"
echo -e "     ${BLUE}su - $APP_USER"
echo -e "     cd app"
echo -e "     bash scripts/setup-app.sh${NC}"
echo ""
echo "  3. Ative o SSL (depois que o DNS apontar para este servidor):"
echo -e "     ${BLUE}sudo certbot --nginx -d $DOMAIN -m $SSL_EMAIL --agree-tos --non-interactive${NC}"
echo ""
echo -e "  Backups em: ${BLUE}$BACKUP_DIR${NC}"
echo -e "  Logs em:    ${BLUE}$APP_DIR/logs${NC}"
echo ""
