#!/bin/bash

# Скрипт моніторингу здоров'я ботів
# Використання: ./health-check.sh

set -e

echo "🏥 Перевірка здоров'я системи..."
echo ""

# Кольори
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_ok() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
}

# Перевірка PM2 процесів
echo "📊 Статус PM2 процесів:"
if pm2 list | grep -q "discord-bot"; then
    DISCORD_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="discord-bot") | .pm2_env.status')
    if [ "$DISCORD_STATUS" == "online" ]; then
        check_ok "Discord Bot: $DISCORD_STATUS"
    else
        check_fail "Discord Bot: $DISCORD_STATUS"
    fi
else
    check_fail "Discord Bot: не запущено"
fi

if pm2 list | grep -q "telegram-bot"; then
    TELEGRAM_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="telegram-bot") | .pm2_env.status')
    if [ "$TELEGRAM_STATUS" == "online" ]; then
        check_ok "Telegram Bot: $TELEGRAM_STATUS"
    else
        check_fail "Telegram Bot: $TELEGRAM_STATUS"
    fi
else
    check_fail "Telegram Bot: не запущено"
fi

echo ""

# Перевірка PostgreSQL
echo "🗄️  PostgreSQL:"
if systemctl is-active --quiet postgresql; then
    check_ok "PostgreSQL активний"

    # Перевірка підключення
    if psql -U music_bot_user -d music_bot -c "SELECT 1" &> /dev/null; then
        check_ok "Підключення до БД успішне"
    else
        check_fail "Помилка підключення до БД"
    fi
else
    check_fail "PostgreSQL не активний"
fi

echo ""

# Перевірка дискового простору
echo "💾 Дисковий простір:"
DISK_USAGE=$(df -h /var/music_bot | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -lt 80 ]; then
    check_ok "Використання диску: ${DISK_USAGE}%"
elif [ $DISK_USAGE -lt 90 ]; then
    check_warn "Використання диску: ${DISK_USAGE}%"
else
    check_fail "Використання диску: ${DISK_USAGE}% (критично!)"
fi

# Розмір музичної папки
MUSIC_SIZE=$(du -sh /var/music_bot/music 2>/dev/null | cut -f1)
echo "   Музика: $MUSIC_SIZE"

echo ""

# Перевірка пам'яті
echo "🧠 Використання пам'яті:"
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
USED_MEM=$(free -m | awk 'NR==2{printf "%.0f", $3}')
MEM_PERCENT=$(awk "BEGIN {printf \"%.0f\", ($USED_MEM/$TOTAL_MEM)*100}")

if [ $MEM_PERCENT -lt 80 ]; then
    check_ok "RAM: ${USED_MEM}MB / ${TOTAL_MEM}MB (${MEM_PERCENT}%)"
else
    check_warn "RAM: ${USED_MEM}MB / ${TOTAL_MEM}MB (${MEM_PERCENT}%)"
fi

echo ""

# Статистика БД
echo "📈 Статистика бази даних:"
TRACKS_COUNT=$(psql -U music_bot_user -d music_bot -t -c "SELECT COUNT(*) FROM tracks WHERE is_deleted = FALSE" 2>/dev/null | xargs)
USERS_COUNT=$(psql -U music_bot_user -d music_bot -t -c "SELECT COUNT(*) FROM users" 2>/dev/null | xargs)
PLAYLISTS_COUNT=$(psql -U music_bot_user -d music_bot -t -c "SELECT COUNT(*) FROM playlists" 2>/dev/null | xargs)

echo "   🎵 Треків: $TRACKS_COUNT"
echo "   👥 Користувачів: $USERS_COUNT"
echo "   📋 Плейлистів: $PLAYLISTS_COUNT"

echo ""

# Останні помилки в логах
echo "📝 Останні помилки:"
if [ -f /var/music_bot/logs/discord-bot-error.log ]; then
    ERROR_COUNT=$(tail -n 100 /var/music_bot/logs/discord-bot-error.log 2>/dev/null | grep -i "error" | wc -l)
    if [ $ERROR_COUNT -gt 0 ]; then
        check_warn "Discord Bot: $ERROR_COUNT помилок за останні 100 рядків"
    else
        check_ok "Discord Bot: немає помилок"
    fi
fi

if [ -f /var/music_bot/logs/telegram-bot-error.log ]; then
    ERROR_COUNT=$(tail -n 100 /var/music_bot/logs/telegram-bot-error.log 2>/dev/null | grep -i "error" | wc -l)
    if [ $ERROR_COUNT -gt 0 ]; then
        check_warn "Telegram Bot: $ERROR_COUNT помилок за останні 100 рядків"
    else
        check_ok "Telegram Bot: немає помилок"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Перевірка завершена: $(date)"
