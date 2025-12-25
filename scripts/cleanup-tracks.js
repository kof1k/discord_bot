require('dotenv').config();
const db = require('../database/config');
const Track = require('../database/models/Track');
const fs = require('fs');
const cron = require('cron');

const CLEANUP_DAYS = parseInt(process.env.CLEANUP_DAYS || 7);
const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED === 'true';
const CLEANUP_SCHEDULE = process.env.CLEANUP_SCHEDULE || '0 3 * * *'; // Щодня о 3:00

async function cleanupOldTracks() {
    console.log('\n🧹 Початок очищення старих треків...');
    console.log(`Критерій: не слухались ${CLEANUP_DAYS} днів і не в плейлистах/улюблених\n`);

    try {
        // Перевіряємо з'єднання з БД
        const connected = await db.testConnection();
        if (!connected) {
            console.error('❌ Не вдалося підключитися до БД');
            return;
        }

        // Отримуємо треки для видалення
        const tracksToDelete = await Track.getTracksToDelete(CLEANUP_DAYS);

        if (tracksToDelete.length === 0) {
            console.log('✅ Немає треків для видалення');
            return;
        }

        console.log(`📊 Знайдено треків для видалення: ${tracksToDelete.length}\n`);

        let deletedCount = 0;
        let freedSpace = 0;
        let errors = 0;

        for (const track of tracksToDelete) {
            try {
                console.log(`🗑️  Видалення: ${track.title}`);

                // Перевіряємо чи існує файл
                if (fs.existsSync(track.file_path)) {
                    const stats = fs.statSync(track.file_path);
                    freedSpace += stats.size;

                    // Видаляємо файл
                    fs.unlinkSync(track.file_path);
                    console.log(`   ✓ Файл видалено: ${track.file_path}`);
                } else {
                    console.log(`   ⚠ Файл не існує: ${track.file_path}`);
                }

                // Позначаємо в БД як видалений
                await Track.markAsDeleted(track.id);
                console.log(`   ✓ Позначено як видалений в БД`);

                deletedCount++;

            } catch (err) {
                console.error(`   ❌ Помилка: ${err.message}`);
                errors++;
            }

            console.log('');
        }

        const freedMB = (freedSpace / 1024 / 1024).toFixed(2);
        const freedGB = (freedSpace / 1024 / 1024 / 1024).toFixed(2);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Результати очищення:');
        console.log(`✅ Видалено треків: ${deletedCount}/${tracksToDelete.length}`);
        console.log(`💾 Звільнено місця: ${freedMB} MB (${freedGB} GB)`);
        if (errors > 0) {
            console.log(`⚠️  Помилок: ${errors}`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Зберігаємо статистику в БД
        await db.query(`
            INSERT INTO bot_statistics (date, data)
            VALUES (CURRENT_DATE, $1)
            ON CONFLICT (date) DO UPDATE
            SET data = bot_statistics.data || $1
        `, [{
            cleanup: {
                deleted: deletedCount,
                freed_space_mb: parseFloat(freedMB),
                timestamp: new Date().toISOString()
            }
        }]);

    } catch (error) {
        console.error('❌ Критична помилка:', error);
    }
}

// Функція для запуску з cron
function startScheduledCleanup() {
    if (!CLEANUP_ENABLED) {
        console.log('⚠️  Автоматичне очищення вимкнено (CLEANUP_ENABLED=false)');
        return;
    }

    console.log('🕐 Планувальник очищення запущено');
    console.log(`📅 Розклад: ${CLEANUP_SCHEDULE} (кожен день о 3:00 ночі)`);
    console.log(`🗑️  Критерій: видалення після ${CLEANUP_DAYS} днів неактивності\n`);

    const job = new cron.CronJob(CLEANUP_SCHEDULE, async () => {
        console.log(`\n[${new Date().toISOString()}] Запуск планового очищення...`);
        await cleanupOldTracks();
    });

    job.start();

    console.log('✅ Планувальник активний\n');
}

// Якщо скрипт запущено напряму - виконуємо очищення
if (require.main === module) {
    cleanupOldTracks().then(() => {
        console.log('✅ Готово!');
        process.exit(0);
    }).catch(err => {
        console.error('❌ Помилка:', err);
        process.exit(1);
    });
}

module.exports = {
    cleanupOldTracks,
    startScheduledCleanup
};
