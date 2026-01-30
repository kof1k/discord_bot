# 🚀 Повний гайд по розгортанню на VPS

Детальна інструкція по встановленню та налаштуванню музичного бота на Ubuntu VPS.

## 📋 Зміст

- [Вимоги до VPS](#вимоги-до-vps)
- [Швидкий старт](#швидкий-старт)
- [Детальне встановлення](#детальне-встановлення)
- [Управління через PM2](#управління-через-pm2)
- [Systemd сервіси](#systemd-сервіси)
- [Моніторинг](#моніторинг)
- [Резервне копіювання](#резервне-копіювання)
- [Оновлення](#оновлення)
- [Troubleshooting](#troubleshooting)

## 💻 Вимоги до VPS

### Мінімальні характеристики
- **OS**: Ubuntu 20.04 LTS або новіше
- **CPU**: 2 cores
- **RAM**: 2GB (рекомендовано 4GB)
- **Диск**: 20GB + місце для музики (180GB+)
- **Мережа**: Безлімітний трафік

### Рекомендовані провайдери
- **DigitalOcean** - від $12/місяць (2GB RAM, 50GB SSD)
- **Hetzner** - від €4.5/місяць (4GB RAM, 40GB SSD)
- **Vultr** - від $12/місяць (2GB RAM, 55GB SSD)
- **Contabo** - від €5/місяць (4GB RAM, 50GB SSD)

## 🚀 Швидкий старт

### 1. Підключення до VPS

```bash
ssh root@your_vps_ip
```

### 2. Клонування репозиторію

```bash
cd /home
git clone https://github.com/your-username/discord_bot.git
cd discord_bot
```

### 3. Автоматичне налаштування

```bash
# Надати права на виконання
chmod +x setup-vps.sh deploy.sh scripts/*.sh

# Запустити налаштування
sudo ./setup-vps.sh
```

Скрипт встановить:
- ✅ Node.js 18
- ✅ Python 3 та pip
- ✅ PostgreSQL
- ✅ FFmpeg
- ✅ PM2
- ✅ yt-dlp

### 4. Налаштування токенів

```bash
nano .env
```

Заповніть:
```env
DISCORD_TOKEN=your_discord_token
TELEGRAM_TOKEN=your_telegram_token
TELEGRAM_ADMIN_ID=your_telegram_id
```

### 5. Запуск

```bash
# Встановити залежності
npm install

# Ініціалізувати БД
npm run init-db

# Запустити через PM2
pm2 start ecosystem.config.js
pm2 save
```

**Готово!** Ваші боти працюють 🎉

## 📚 Детальне встановлення

### Крок 1: Оновлення системи

```bash
sudo apt update && sudo apt upgrade -y
```

### Крок 2: Встановлення Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Перевірка версії
```

### Крок 3: Встановлення PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Створення бази даних:

```bash
sudo -u postgres psql
```

В psql консолі:

```sql
CREATE DATABASE music_bot;
CREATE USER music_bot_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE music_bot TO music_bot_user;
\q
```

### Крок 4: Встановлення інших залежностей

```bash
# Python та pip
sudo apt install -y python3 python3-pip

# FFmpeg
sudo apt install -y ffmpeg

# yt-dlp
pip3 install yt-dlp

# PM2
sudo npm install -g pm2
```

### Крок 5: Налаштування проєкту

```bash
cd /home/discord_bot

# Створення .env
cp .env.example .env
nano .env

# Встановлення залежностей
npm install

# Створення директорій
sudo mkdir -p /var/music_bot/{music,downloads,logs}
sudo chown -R $USER:$USER /var/music_bot

# Ініціалізація БД
npm run init-db
```

## 🎮 Управління через PM2

### Основні команди

```bash
# Запуск
pm2 start ecosystem.config.js

# Статус
pm2 status
pm2 list

# Логи
pm2 logs                    # Всі логи
pm2 logs discord-bot        # Тільки Discord
pm2 logs telegram-bot       # Тільки Telegram

# Перезапуск
pm2 restart all
pm2 restart discord-bot
pm2 restart telegram-bot

# Зупинка
pm2 stop all
pm2 stop discord-bot

# Видалення з PM2
pm2 delete all

# Моніторинг
pm2 monit

# Збереження конфігурації
pm2 save

# Автозапуск при старті системи
pm2 startup
# Скопіюйте команду з виводу та виконайте її
```

### Корисні команди

```bash
# Інформація про процес
pm2 info discord-bot

# Метрики
pm2 describe discord-bot

# Очистити логи
pm2 flush

# Оновити PM2
npm install -g pm2
pm2 update
```

## ⚙️ Systemd сервіси

Альтернатива PM2 - використання systemd.

### Встановлення сервісів

```bash
# Відредагувати файли сервісів
sudo nano systemd/discord-bot.service
# Замінити YOUR_USER на ваше ім'я користувача

sudo nano systemd/telegram-bot.service
# Замінити YOUR_USER на ваше ім'я користувача

# Копіювання в systemd
sudo cp systemd/*.service /etc/systemd/system/

# Перезавантаження systemd
sudo systemctl daemon-reload

# Запуск сервісів
sudo systemctl start discord-bot
sudo systemctl start telegram-bot

# Автозапуск
sudo systemctl enable discord-bot
sudo systemctl enable telegram-bot

# Перевірка статусу
sudo systemctl status discord-bot
sudo systemctl status telegram-bot
```

### Управління сервісами

```bash
# Перезапуск
sudo systemctl restart discord-bot
sudo systemctl restart telegram-bot

# Зупинка
sudo systemctl stop discord-bot
sudo systemctl stop telegram-bot

# Логи
sudo journalctl -u discord-bot -f
sudo journalctl -u telegram-bot -f
```

## 📊 Моніторинг

### Health Check

Запустіть скрипт моніторингу:

```bash
chmod +x scripts/health-check.sh
./scripts/health-check.sh
```

Вивід покаже:
- ✅ Статус PM2 процесів
- ✅ Статус PostgreSQL
- ✅ Використання диску
- ✅ Використання пам'яті
- ✅ Статистику БД
- ✅ Помилки в логах

### Автоматичний моніторинг

Додайте в crontab:

```bash
crontab -e
```

Додайте рядок:

```cron
# Перевірка кожні 15 хвилин
*/15 * * * * /home/discord_bot/scripts/health-check.sh >> /var/music_bot/logs/health-check.log 2>&1
```

### Моніторинг через PM2

```bash
# Web dashboard
pm2 web

# Відкрийте в браузері: http://your_vps_ip:9615
```

### Налаштування alerts

```bash
# Email сповіщення при падінні процесу
pm2 install pm2-auto-pull
pm2 set pm2-auto-pull:apps "['discord-bot', 'telegram-bot']"
```

## 💾 Резервне копіювання

### Автоматичний бекап БД

```bash
chmod +x scripts/backup.sh

# Додати в crontab (щоденно о 2:00)
crontab -e
```

Додайте:

```cron
0 2 * * * /home/discord_bot/scripts/backup.sh
```

### Ручний бекап

```bash
# Тільки БД
pg_dump -U music_bot_user music_bot | gzip > backup_$(date +%Y%m%d).sql.gz

# БД + музика
tar -czf full_backup_$(date +%Y%m%d).tar.gz \
  backup_$(date +%Y%m%d).sql.gz \
  /var/music_bot/music
```

### Відновлення

```bash
# Відновлення БД
gunzip -c backup_20240101.sql.gz | psql -U music_bot_user music_bot

# Відновлення музики
tar -xzf full_backup_20240101.tar.gz -C /
```

## 🔄 Оновлення

### Через deploy скрипт

```bash
chmod +x deploy.sh
./deploy.sh
```

Скрипт автоматично:
- ✅ Отримає нові зміни з git
- ✅ Встановить залежності
- ✅ Оновить yt-dlp
- ✅ Перезапустить боти
- ✅ Покаже логи

### Ручне оновлення

```bash
# Отримати зміни
git pull

# Оновити залежності
npm install
pip3 install -U yt-dlp

# Перезапустити
pm2 restart all
```

## 🔐 Безпека

### Firewall

```bash
# Встановити UFW
sudo apt install -y ufw

# Налаштування
sudo ufw allow OpenSSH
sudo ufw allow 5432/tcp  # Тільки якщо потрібен зовнішній доступ до БД
sudo ufw enable

# Перевірка
sudo ufw status
```

### Захист SSH

```bash
# Відредагувати конфіг
sudo nano /etc/ssh/sshd_config
```

Налаштування:

```
Port 2222                    # Змінити порт
PermitRootLogin no           # Заборонити root
PasswordAuthentication no    # Тільки SSH ключі
```

Перезапустити SSH:

```bash
sudo systemctl restart sshd
```

### Оновлення системи

```bash
# Автоматичні оновлення
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 📈 Оптимізація

### PostgreSQL

Відредагуйте конфіг:

```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

Використайте налаштування з `config/postgresql.conf`

Перезапуск:

```bash
sudo systemctl restart postgresql
```

### Node.js

Збільшення ліміту пам'яті:

```javascript
// ecosystem.config.js
node_args: '--max-old-space-size=512'
```

### Swap файл

Для VPS з малою RAM:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Додати в /etc/fstab
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 🐛 Troubleshooting

### Боти не запускаються

```bash
# Перевірити логи
pm2 logs --err

# Перевірити права
ls -la /var/music_bot

# Перевірити БД
psql -U music_bot_user -d music_bot -c "SELECT 1"
```

### Помилка "Cannot find module"

```bash
# Переустановити залежності
rm -rf node_modules package-lock.json
npm install
```

### PostgreSQL не підключається

```bash
# Перевірити статус
sudo systemctl status postgresql

# Перезапустити
sudo systemctl restart postgresql

# Перевірити логи
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Закінчилось місце на диску

```bash
# Очистити старі треки
npm run cleanup

# Очистити логи
pm2 flush
sudo journalctl --vacuum-time=7d

# Видалити старі бекапи
find /var/backups/music_bot -mtime +30 -delete
```

### Бот вилітає з пам'яті

```bash
# Збільшити ліміт в PM2
pm2 delete all
# Відредагувати ecosystem.config.js: max_memory_restart: '1000M'
pm2 start ecosystem.config.js
pm2 save

# Або додати swap
sudo fallocate -l 2G /swapfile
```

## 📞 Підтримка

### Корисні команди діагностики

```bash
# Системна інформація
uname -a
lsb_release -a
free -m
df -h

# Перевірка портів
sudo netstat -tulpn | grep node

# Процеси Node.js
ps aux | grep node

# Версії
node -v
npm -v
python3 --version
ffmpeg -version
pm2 -v
```

### Логи

```bash
# PM2 логи
pm2 logs --lines 100

# Systemd логи
sudo journalctl -u discord-bot -n 100
sudo journalctl -u telegram-bot -n 100

# PostgreSQL логи
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Системні логи
sudo tail -f /var/log/syslog
```

## 📚 Додаткові ресурси

- [PM2 документація](https://pm2.keymetrics.io/)
- [PostgreSQL документація](https://www.postgresql.org/docs/)
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)
- [Discord.js Guide](https://discordjs.guide/)

---

**Успішного розгортання! 🚀**

Якщо виникли питання - перевірте логи та використайте health-check скрипт.
