#!/bin/bash

# Скрипт для резервного копіювання бази даних
# Додайте в crontab: 0 2 * * * /path/to/backup.sh

set -e

BACKUP_DIR="/var/backups/music_bot"
DATE=$(date +"%Y%m%d_%H%M%S")
DB_NAME="music_bot"
DB_USER="music_bot_user"
RETENTION_DAYS=7

# Створення директорії для бекапів
mkdir -p $BACKUP_DIR

# Резервна копія БД
echo "🔄 Створення резервної копії бази даних..."
pg_dump -U $DB_USER -d $DB_NAME | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Резервна копія музичних файлів (опціонально)
# tar -czf "$BACKUP_DIR/music_backup_$DATE.tar.gz" /var/music_bot/music

# Видалення старих бекапів
echo "🧹 Видалення старих резервних копій..."
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
# find $BACKUP_DIR -name "music_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "✅ Резервне копіювання завершено: $BACKUP_DIR/db_backup_$DATE.sql.gz"

# Показати розмір бекапу
ls -lh "$BACKUP_DIR/db_backup_$DATE.sql.gz"
