const User = require('../database/models/User');
const Track = require('../database/models/Track');
const db = require('../database/config');
const fs = require('fs');
const path = require('path');

class AdminPanel {
    constructor(bot) {
        this.bot = bot;
        this.setupCommands();
    }

    setupCommands() {
        // /admin - головне меню адміна
        this.bot.onText(/\/admin/, async (msg) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '👥 Користувачі', callback_data: 'admin_users' },
                        { text: '💾 Сховище', callback_data: 'admin_storage' }
                    ],
                    [
                        { text: '🎵 Треки', callback_data: 'admin_tracks' },
                        { text: '📊 Статистика', callback_data: 'admin_stats' }
                    ],
                    [
                        { text: '🧹 Очистити старі треки', callback_data: 'admin_cleanup' }
                    ],
                    [
                        { text: '🔄 Оновити БД', callback_data: 'admin_refresh_db' }
                    ]
                ]
            };

            this.bot.sendMessage(msg.chat.id, '⚙️ **Адмін панель**\n\nОберіть дію:', {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });

        // Обробники callback запитів
        this.bot.on('callback_query', async (query) => {
            const isAdmin = await this.checkAdmin(query.message);
            if (!isAdmin) return;

            const data = query.data;

            if (data === 'admin_users') {
                await this.showUsers(query.message.chat.id);
            } else if (data === 'admin_storage') {
                await this.showStorage(query.message.chat.id);
            } else if (data === 'admin_tracks') {
                await this.showTracks(query.message.chat.id);
            } else if (data === 'admin_stats') {
                await this.showStats(query.message.chat.id);
            } else if (data === 'admin_cleanup') {
                await this.cleanupTracks(query.message.chat.id);
            } else if (data === 'admin_refresh_db') {
                await this.refreshDatabase(query.message.chat.id);
            } else if (data.startsWith('admin_promote_')) {
                const userId = parseInt(data.split('_')[2]);
                await this.promoteUser(query.message.chat.id, userId);
            } else if (data.startsWith('admin_demote_')) {
                const userId = parseInt(data.split('_')[2]);
                await this.demoteUser(query.message.chat.id, userId);
            }

            this.bot.answerCallbackQuery(query.id);
        });

        // /users - список користувачів
        this.bot.onText(/\/users/, async (msg) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            await this.showUsers(msg.chat.id);
        });

        // /storage - інформація про сховище
        this.bot.onText(/\/storage/, async (msg) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            await this.showStorage(msg.chat.id);
        });

        // /cleanup - очистити старі треки
        this.bot.onText(/\/cleanup/, async (msg) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            await this.cleanupTracks(msg.chat.id);
        });

        // /promote <user_id> - зробити адміном
        this.bot.onText(/\/promote (\d+)/, async (msg, match) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            const userId = parseInt(match[1]);
            await this.promoteUser(msg.chat.id, userId);
        });

        // /demote <user_id> - забрати адміна
        this.bot.onText(/\/demote (\d+)/, async (msg, match) => {
            const isAdmin = await this.checkAdmin(msg);
            if (!isAdmin) return;

            const userId = parseInt(match[1]);
            await this.demoteUser(msg.chat.id, userId);
        });
    }

    async checkAdmin(msg) {
        const telegramId = msg.from?.id || msg.chat?.id;
        const user = await User.findByTelegramId(telegramId);

        if (!user || user.role !== 'admin') {
            this.bot.sendMessage(msg.chat?.id || telegramId, '❌ Немає доступу');
            return false;
        }

        return true;
    }

    async showUsers(chatId) {
        try {
            const result = await db.query(`
                SELECT u.*, COUNT(DISTINCT t.id) as tracks_added, COUNT(DISTINCT p.id) as playlists_count
                FROM users u
                LEFT JOIN tracks t ON u.id = t.added_by_user_id
                LEFT JOIN playlists p ON u.id = p.owner_id
                GROUP BY u.id
                ORDER BY u.created_at DESC
                LIMIT 20
            `);

            const users = result.rows;

            let text = '👥 **Користувачі** (останні 20)\n\n';

            users.forEach((user, index) => {
                const roleEmoji = user.role === 'admin' ? '👑' : '👤';
                text += `${index + 1}. ${roleEmoji} **${user.username}**\n`;
                text += `   ID: \`${user.id}\` | Telegram: \`${user.telegram_id}\`\n`;
                text += `   Треків: ${user.tracks_added} | Плейлистів: ${user.playlists_count}\n`;
                text += `   Зареєстрований: ${new Date(user.created_at).toLocaleDateString('uk-UA')}\n\n`;
            });

            text += '\n💡 /promote <ID> - зробити адміном\n💡 /demote <ID> - забрати права';

            this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async showStorage(chatId) {
        try {
            const musicDir = process.env.MUSIC_DIR || './music';

            // Отримуємо інформацію про файли
            const files = fs.readdirSync(musicDir);
            let totalSize = 0;

            files.forEach(file => {
                const filePath = path.join(musicDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });

            // Отримуємо статистику з БД
            const dbStats = await db.query(`
                SELECT
                    COUNT(*) as total_tracks,
                    SUM(file_size) as total_size,
                    COUNT(*) FILTER (WHERE is_deleted = FALSE) as active_tracks,
                    COUNT(*) FILTER (WHERE is_deleted = TRUE) as deleted_tracks
                FROM tracks
            `);

            const stats = dbStats.rows[0];

            const totalGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);
            const maxGB = parseInt(process.env.MAX_STORAGE_GB || 180);
            const usagePercent = ((totalSize / (maxGB * 1024 * 1024 * 1024)) * 100).toFixed(1);

            const text = `
💾 **Інформація про сховище**

📁 Шлях: \`${musicDir}\`
📊 Розмір: ${totalGB} GB / ${maxGB} GB (${usagePercent}%)
📄 Файлів на диску: ${files.length}

**База даних:**
🎵 Всього треків: ${stats.total_tracks}
✅ Активних: ${stats.active_tracks}
🗑️ Видалених: ${stats.deleted_tracks}
💽 Розмір в БД: ${(stats.total_size / 1024 / 1024 / 1024).toFixed(2)} GB

${usagePercent > 90 ? '⚠️ **УВАГА:** Сховище майже заповнене!' : ''}
${usagePercent > 80 ? '💡 Рекомендується виконати /cleanup' : ''}
            `.trim();

            this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async showTracks(chatId) {
        try {
            const result = await db.query(`
                SELECT t.*, u.username as added_by
                FROM tracks t
                LEFT JOIN users u ON t.added_by_user_id = u.id
                WHERE t.is_deleted = FALSE
                ORDER BY t.created_at DESC
                LIMIT 15
            `);

            const tracks = result.rows;

            let text = '🎵 **Останні треки** (15 шт.)\n\n';

            tracks.forEach((track, index) => {
                text += `${index + 1}. **${track.title}**\n`;
                text += `   👤 ${track.author}\n`;
                text += `   📊 Прослухань: ${track.play_count}\n`;
                text += `   👨‍💻 Додав: ${track.added_by || 'Невідомо'}\n`;
                text += `   📅 ${new Date(track.created_at).toLocaleDateString('uk-UA')}\n\n`;
            });

            this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async showStats(chatId) {
        try {
            const stats = await db.query(`
                SELECT
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
                    (SELECT COUNT(*) FROM tracks WHERE is_deleted = FALSE) as total_tracks,
                    (SELECT COUNT(*) FROM playlists) as total_playlists,
                    (SELECT COUNT(*) FROM play_history) as total_plays,
                    (SELECT COUNT(*) FROM play_history WHERE DATE(played_at) = CURRENT_DATE) as plays_today
            `);

            const data = stats.rows[0];

            const text = `
📊 **Загальна статистика бота**

**Користувачі:**
👥 Всього: ${data.total_users}
👑 Адміністраторів: ${data.admin_count}

**Музика:**
🎵 Треків в БД: ${data.total_tracks}
📋 Плейлистів: ${data.total_playlists}

**Прослуховування:**
🎧 Всього: ${data.total_plays}
📅 Сьогодні: ${data.plays_today}

Оновлено: ${new Date().toLocaleString('uk-UA')}
            `.trim();

            this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async cleanupTracks(chatId) {
        try {
            const msg = await this.bot.sendMessage(chatId, '🧹 Шукаю старі треки...');

            const daysInactive = parseInt(process.env.CLEANUP_DAYS || 7);
            const tracksToDelete = await Track.getTracksToDelete(daysInactive);

            if (tracksToDelete.length === 0) {
                await this.bot.editMessageText('✅ Немає треків для видалення', {
                    chat_id: chatId,
                    message_id: msg.message_id
                });
                return;
            }

            let deletedCount = 0;
            let freedSpace = 0;

            for (const track of tracksToDelete) {
                try {
                    // Видаляємо файл
                    if (fs.existsSync(track.file_path)) {
                        const stats = fs.statSync(track.file_path);
                        freedSpace += stats.size;
                        fs.unlinkSync(track.file_path);
                    }

                    // Позначаємо як видалений в БД
                    await Track.markAsDeleted(track.id);
                    deletedCount++;

                } catch (err) {
                    console.error(`Помилка видалення треку ${track.id}:`, err);
                }
            }

            const freedMB = (freedSpace / 1024 / 1024).toFixed(2);

            const text = `
✅ **Очищення завершено**

🗑️ Видалено треків: ${deletedCount} з ${tracksToDelete.length}
💾 Звільнено місця: ${freedMB} MB

Критерій: не слухались ${daysInactive} днів і не в плейлистах
            `.trim();

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async promoteUser(chatId, userId) {
        try {
            const user = await User.findById(userId);

            if (!user) {
                this.bot.sendMessage(chatId, '❌ Користувача не знайдено');
                return;
            }

            if (user.role === 'admin') {
                this.bot.sendMessage(chatId, '⚠️ Користувач вже адміністратор');
                return;
            }

            await User.updateRole(userId, 'admin');

            this.bot.sendMessage(chatId, `✅ Користувач **${user.username}** тепер адміністратор`, {
                parse_mode: 'Markdown'
            });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async demoteUser(chatId, userId) {
        try {
            const user = await User.findById(userId);

            if (!user) {
                this.bot.sendMessage(chatId, '❌ Користувача не знайдено');
                return;
            }

            if (user.role !== 'admin') {
                this.bot.sendMessage(chatId, '⚠️ Користувач не є адміністратором');
                return;
            }

            await User.updateRole(userId, 'user');

            this.bot.sendMessage(chatId, `✅ У користувача **${user.username}** забрано права адміністратора`, {
                parse_mode: 'Markdown'
            });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async refreshDatabase(chatId) {
        try {
            const msg = await this.bot.sendMessage(chatId, '🔄 Оновлення бази даних...');

            // Перевіряємо всі файли в БД
            const tracks = await db.query('SELECT * FROM tracks WHERE is_deleted = FALSE');

            let missingCount = 0;

            for (const track of tracks.rows) {
                if (!fs.existsSync(track.file_path)) {
                    await Track.markAsDeleted(track.id);
                    missingCount++;
                }
            }

            await this.bot.editMessageText(
                `✅ Оновлення завершено\n\n🗑️ Видалено записів про відсутні файли: ${missingCount}`,
                {
                    chat_id: chatId,
                    message_id: msg.message_id
                }
            );

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }
}

module.exports = AdminPanel;
