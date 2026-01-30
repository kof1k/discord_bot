# ⚡ Швидкий старт на VPS

## За 5 хвилин від нуля до робочого бота!

### 1️⃣ Підключіться до VPS

```bash
ssh root@your_vps_ip
```

### 2️⃣ Одна команда для всього

```bash
cd /home && \
git clone https://github.com/your-username/discord_bot.git && \
cd discord_bot && \
chmod +x setup-vps.sh deploy.sh scripts/*.sh && \
sudo ./setup-vps.sh
```

Скрипт запитає:
- ✅ Пароль для БД (придумайте складний)

Він встановить **ВСЕ автоматично**:
- Node.js, Python, PostgreSQL, FFmpeg
- PM2 для управління процесами
- yt-dlp для скачування музики
- Налаштує базу даних
- Створить всі директорії

### 3️⃣ Додайте токени

```bash
nano .env
```

Заповніть тільки ці 3 поля:

```env
DISCORD_TOKEN=ваш_токен_дискорд
TELEGRAM_TOKEN=ваш_токен_телеграм
TELEGRAM_ADMIN_ID=ваш_айді_телеграм
```

Збережіть: `Ctrl+X` → `Y` → `Enter`

### 4️⃣ Запустіть

```bash
npm install
npm run init-db
npm run pm2:start
```

### 5️⃣ Перевірте

```bash
npm run pm2:logs
```

**Готово! 🎉**

---

## 🎮 Основні команди

```bash
npm run pm2:logs      # Логи
npm run pm2:restart   # Перезапуск
npm run pm2:stop      # Зупинка
npm run health        # Статус системи
npm run deploy        # Оновлення
```

---

## 🆘 Щось не працює?

### Перевірте статус:

```bash
npm run health
```

### Подивіться логи:

```bash
npm run pm2:logs
```

### Частиші проблеми:

**"Cannot connect to database"**
```bash
sudo systemctl restart postgresql
psql -U music_bot_user -d music_bot -c "SELECT 1"
```

**"Module not found"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**"Permission denied"**
```bash
sudo chown -R $USER:$USER /var/music_bot
chmod 755 -R /var/music_bot
```

---

## 📖 Детальна документація

- [VPS-GUIDE.md](VPS-GUIDE.md) - Повний гайд
- [README-SETUP.md](README-SETUP.md) - Локальне налаштування

---

## 🔄 Автоматичні оновлення

Створіть cron job:

```bash
crontab -e
```

Додайте:

```cron
# Оновлення щодня о 4:00
0 4 * * * cd /home/discord_bot && ./deploy.sh >> /var/music_bot/logs/deploy.log 2>&1

# Бекап щодня о 2:00
0 2 * * * /home/discord_bot/scripts/backup.sh

# Health check кожні 15 хвилин
*/15 * * * * /home/discord_bot/scripts/health-check.sh >> /var/music_bot/logs/health.log 2>&1
```

---

**Успіхів! 🚀**

Потрібна допомога? Дивіться [VPS-GUIDE.md](VPS-GUIDE.md)
