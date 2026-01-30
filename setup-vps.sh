#!/bin/bash

# Скрипт первинного налаштування VPS для Music Bot
# Використання: sudo ./setup-vps.sh

set -e

echo "🔧 Налаштування VPS для Music Bot..."

# Кольори
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

error() {
    echo -e "${RED}❌ Помилка: $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

ask() {
    echo -e "${BLUE}❓ $1${NC}"
}

# Перевірка прав root
if [[ $EUID -ne 0 ]]; then
   error "Запустіть скрипт з sudo: sudo ./setup-vps.sh"
fi

# Оновлення системи
info "Оновлення системи..."
apt update && apt upgrade -y
success "Систему оновлено"

# Встановлення необхідних пакетів
info "Встановлення базових пакетів..."
apt install -y curl wget git build-essential software-properties-common
success "Базові пакети встановлено"

# Встановлення Node.js 18
info "Встановлення Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    success "Node.js встановлено: $(node -v)"
else
    success "Node.js вже встановлено: $(node -v)"
fi

# Встановлення Python 3 та pip
info "Встановлення Python 3..."
if ! command -v python3 &> /dev/null; then
    apt install -y python3 python3-pip
    success "Python встановлено: $(python3 --version)"
else
    success "Python вже встановлено: $(python3 --version)"
fi

# Встановлення FFmpeg
info "Встановлення FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    apt install -y ffmpeg
    success "FFmpeg встановлено: $(ffmpeg -version | head -n 1)"
else
    success "FFmpeg вже встановлено"
fi

# Встановлення PostgreSQL
info "Встановлення PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
    success "PostgreSQL встановлено"
else
    success "PostgreSQL вже встановлено"
fi

# Налаштування PostgreSQL
info "Налаштування бази даних..."
ask "Введіть пароль для бази даних music_bot:"
read -s DB_PASSWORD
echo ""

sudo -u postgres psql <<EOF
-- Створення користувача
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'music_bot_user') THEN
      CREATE USER music_bot_user WITH PASSWORD '$DB_PASSWORD';
   END IF;
END
\$\$;

-- Створення бази даних
SELECT 'CREATE DATABASE music_bot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'music_bot')\gexec

-- Надання прав
GRANT ALL PRIVILEGES ON DATABASE music_bot TO music_bot_user;
EOF

success "База даних налаштовано"

# Встановлення PM2
info "Встановлення PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER
    success "PM2 встановлено"
else
    success "PM2 вже встановлено"
fi

# Встановлення yt-dlp
info "Встановлення yt-dlp..."
pip3 install yt-dlp
success "yt-dlp встановлено"

# Налаштування firewall
info "Налаштування firewall..."
if command -v ufw &> /dev/null; then
    ufw allow OpenSSH
    ufw allow 5432/tcp  # PostgreSQL (тільки якщо потрібен зовнішній доступ)
    ufw --force enable
    success "Firewall налаштовано"
fi

# Створення .env файлу
info "Створення .env файлу..."
if [ ! -f .env ]; then
    cat > .env <<EOF
# Discord Bot
DISCORD_TOKEN=

# Telegram Bot
TELEGRAM_TOKEN=
TELEGRAM_ADMIN_ID=

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=music_bot
DB_USER=music_bot_user
DB_PASSWORD=$DB_PASSWORD

# Music Storage
MUSIC_DIR=/var/music_bot/music
TEMP_DIR=/var/music_bot/downloads

# Settings
MAX_STORAGE_GB=180
CLEANUP_DAYS=7
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 3 * * *
NODE_ENV=production
EOF
    chown $SUDO_USER:$SUDO_USER .env
    chmod 600 .env
    success ".env файл створено"
else
    info ".env файл вже існує, пропускаємо"
fi

# Створення директорій
info "Створення робочих директорій..."
mkdir -p /var/music_bot/{music,downloads,logs}
chown -R $SUDO_USER:$SUDO_USER /var/music_bot
chmod -R 755 /var/music_bot
success "Директорії створено"

# Налаштування logrotate
info "Налаштування ротації логів..."
cat > /etc/logrotate.d/music-bot <<EOF
/var/music_bot/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0644 $SUDO_USER $SUDO_USER
}
EOF
success "Ротація логів налаштовано"

# Налаштування swap (якщо менше 2GB RAM)
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
if [ $TOTAL_MEM -lt 2048 ] && [ ! -f /swapfile ]; then
    info "Створення swap файлу (RAM < 2GB)..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    success "Swap файл створено"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "🎉 VPS налаштовано успішно!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Наступні кроки:"
echo "1. Відредагуйте .env файл та додайте токени ботів"
echo "   nano .env"
echo ""
echo "2. Встановіть залежності проєкту:"
echo "   npm install"
echo ""
echo "3. Ініціалізуйте базу даних:"
echo "   npm run init-db"
echo ""
echo "4. Запустіть боти через PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "5. Перегляньте логи:"
echo "   pm2 logs"
echo ""
info "Пароль бази даних збережено в .env файлі"
info "Робочі директорії: /var/music_bot/"
echo ""
