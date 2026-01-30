require('dotenv').config();
const { exec } = require('child_process');
const Track = require('../database/models/Track');
const fs = require('fs');
const path = require('path');

const MUSIC_DIR = process.env.MUSIC_DIR || './music';
const MAX_STORAGE_GB = parseInt(process.env.MAX_STORAGE_GB || 180);
const WARNING_THRESHOLD = 0.85; // 85% використання

async function checkDiskUsage() {
    return new Promise((resolve, reject) => {
        exec(`du -sb ${MUSIC_DIR}`, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }

            const sizeBytes = parseInt(stdout.split('\t')[0]);
            const sizeGB = sizeBytes / 1024 / 1024 / 1024;
            const usagePercent = sizeGB / MAX_STORAGE_GB;

            resolve({
                sizeBytes,
                sizeGB: sizeGB.toFixed(2),
                maxGB: MAX_STORAGE_GB,
                usagePercent: (usagePercent * 100).toFixed(1),
                needsCleanup: usagePercent > WARNING_THRESHOLD
            });
        });
    });
}

async function autoCleanup() {
    console.log('🧹 Автоматичне очищення через перевищення ліміту...\n');

    // Видаляємо найстаріші треки які не в плейлистах
    const tracksToDelete = await Track.getTracksToDelete(1); // Треки старші 1 дня

    let freedSpace = 0;
    let deletedCount = 0;

    for (const track of tracksToDelete) {
        if (fs.existsSync(track.file_path)) {
            const stats = fs.statSync(track.file_path);
            freedSpace += stats.size;
            fs.unlinkSync(track.file_path);
        }

        await Track.markAsDeleted(track.id);
        deletedCount++;

        // Перевіряємо чи достатньо звільнили
        const usage = await checkDiskUsage();
        if (!usage.needsCleanup) {
            break;
        }
    }

    const freedGB = (freedSpace / 1024 / 1024 / 1024).toFixed(2);
    console.log(`✅ Видалено: ${deletedCount} треків`);
    console.log(`💾 Звільнено: ${freedGB} GB\n`);
}

async function run() {
    console.log('📊 Перевірка використання диску...\n');

    try {
        const usage = await checkDiskUsage();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`💾 Використання диску: ${usage.sizeGB} GB / ${usage.maxGB} GB`);
        console.log(`📊 Відсоток: ${usage.usagePercent}%`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (usage.needsCleanup) {
            console.log(`⚠️  УВАГА: Використано понад ${WARNING_THRESHOLD * 100}%!`);
            console.log('🧹 Запускаю автоматичне очищення...\n');

            await autoCleanup();

            // Повторна перевірка
            const newUsage = await checkDiskUsage();
            console.log(`✅ Нове використання: ${newUsage.sizeGB} GB (${newUsage.usagePercent}%)`);
        } else {
            console.log(`✅ Диск в нормі (< ${WARNING_THRESHOLD * 100}%)`);
        }

        // Статистика БД
        const db = require('../database/config');
        const stats = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_deleted = FALSE) as active,
                COUNT(*) FILTER (WHERE is_deleted = TRUE) as deleted
            FROM tracks
        `);

        console.log('\n📈 Статистика треків:');
        console.log(`   🎵 Активних: ${stats.rows[0].active}`);
        console.log(`   🗑️  Видалених: ${stats.rows[0].deleted}`);
        console.log(`   📊 Всього: ${stats.rows[0].total}`);

    } catch (error) {
        console.error('❌ Помилка:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run().then(() => {
        console.log('\n✅ Готово!');
        process.exit(0);
    });
}

module.exports = { checkDiskUsage, autoCleanup };
