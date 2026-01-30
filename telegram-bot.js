require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database/config');
const User = require('./database/models/User');
const Track = require('./database/models/Track');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Підключаємо модулі
const AdminPanel = require('./telegram/admin');
const PlaylistManager = require('./telegram/playlists');
const DiscordControl = require('./telegram/discord-control');
const { startScheduledCleanup } = require('./scripts/cleanup-tracks');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const MUSIC_DIR = process.env.MUSIC_DIR || './music';

// Створюємо папки
[MUSIC_DIR, './downloads'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Глобальний об'єкт для зв'язку з Discord ботом
global.discordBotControl = {
    joinChannel: null,
    playTrack: null,
    skip: null,
    stop: null,
    pause: null,
    getQueue: null,
    leaveChannel: null
};

// Middleware для авторизації
async function checkUser(msg) {
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    let user = await User.findByTelegramId(telegramId);

    if (!user) {
        user = await User.findOrCreate({
            telegram_id: telegramId,
            username: username
        });
        console.log(`✅ Новий користувач: ${username} (${telegramId})`);
    } else {
        await User.updateLastActive(user.id);
    }

    return user;
}

// Функція для завантаження треку
async function downloadTrack(query, userId) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', ['downloader.py', query]);

        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        python.on('close', async (code) => {
            try {
                const lines = output.trim().split('\n');
                const jsonLine = lines[lines.length - 1];
                const result = JSON.parse(jsonLine);

                if (result.success) {
                    const youtubeId = result.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
                    let track = youtubeId ? await Track.findByYoutubeId(youtubeId) : null;

                    if (!track) {
                        const newFileName = `${youtubeId || Date.now()}.mp3`;
                        const newPath = path.join(MUSIC_DIR, newFileName);

                        fs.renameSync(result.file, newPath);
                        const stats = fs.statSync(newPath);

                        track = await Track.create({
                            title: result.title,
                            author: result.author,
                            duration: result.duration,
                            file_path: newPath,
                            file_size: stats.size,
                            thumbnail_url: result.thumbnail,
                            youtube_url: result.url,
                            youtube_id: youtubeId,
                            added_by_user_id: userId
                        });

                        console.log(`✅ Трек збережено в БД: ${track.title}`);
                    }

                    resolve({ ...result, track, file: track.file_path });
                } else {
                    reject(new Error(result.error));
                }
            } catch (e) {
                reject(new Error(errorOutput || 'Failed to parse response'));
            }
        });

        python.on('error', (err) => {
            reject(err);
        });
    });
}

// Функція форматування тривалості
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===== ОСНОВНІ КОМАНДИ =====

bot.onText(/\/start/, async (msg) => {
    const user = await checkUser(msg);

    const welcomeText = `
🎵 **Вітаємо в Music Bot!**

Я допоможу керувати Discord музичним ботом прямо з Telegram!

**Основні команди:**
/help - Список всіх команд
/download - Скачати трек
/search - Знайти музику
/playlists - Мої плейлисти
/favorites - Улюблені треки
/discord - Управління Discord ботом

${user.role === 'admin' ? '**Адмін:**\n/admin - Панель адміністратора\n' : ''}
    `.trim();

    bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    const user = await checkUser(msg);

    const helpText = `
📖 **Довідка по командам**

**🎵 Музика:**
/download <назва> - Скачати трек
/search <запит> - Пошук музики
/get <ID> - Отримати трек за ID
/popular - Популярні треки

**📋 Плейлисти:**
/playlists - Мої плейлисти
/create_playlist - Створити плейлист
/playlist <ID> - Переглянути плейлист

**🎮 Discord:**
/discord - Меню управління
/servers - Вибрати сервер
/channels - Вибрати канали
/join - Підключитись

**📊 Статистика:**
/stats - Моя статистика

${user.role === 'admin' ? '**⚙️ Адмін:**\n/admin - Адмін панель\n/users - Користувачі\n/storage - Сховище\n/cleanup - Очистити\n' : ''}
    `.trim();

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/download (.+)/, async (msg, match) => {
    const user = await checkUser(msg);
    const query = match[1];

    const statusMsg = await bot.sendMessage(msg.chat.id, '🔍 Шукаю та завантажую...');

    try {
        const result = await downloadTrack(query, user.id);

        await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

        const text = `
✅ **Трек завантажено!**

🎵 ${result.track.title}
👤 ${result.track.author}
⏱️ ${formatDuration(result.track.duration)}

ID: \`${result.track.id}\`
        `.trim();

        await bot.sendAudio(msg.chat.id, result.track.file_path, {
            caption: text,
            parse_mode: 'Markdown',
            title: result.track.title,
            performer: result.track.author,
            duration: result.track.duration
        });

    } catch (error) {
        await bot.deleteMessage(msg.chat.id, statusMsg.message_id);
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

bot.onText(/\/search (.+)/, async (msg, match) => {
    await checkUser(msg);
    const query = match[1];

    try {
        const tracks = await Track.search(query, 10);

        if (tracks.length === 0) {
            bot.sendMessage(msg.chat.id, '❌ Нічого не знайдено');
            return;
        }

        let text = `🔍 **Результати пошуку:** "${query}"\n\n`;

        tracks.forEach((track, index) => {
            text += `${index + 1}. **${track.title}**\n`;
            text += `   👤 ${track.author} | ⏱️ ${formatDuration(track.duration)}\n`;
            text += `   ID: \`${track.id}\` | Прослухань: ${track.play_count}\n\n`;
        });

        text += '\n💡 /get <ID> щоб отримати трек';

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

bot.onText(/\/get (\d+)/, async (msg, match) => {
    await checkUser(msg);
    const trackId = parseInt(match[1]);

    try {
        const track = await Track.findById(trackId);

        if (!track) {
            bot.sendMessage(msg.chat.id, '❌ Трек не знайдено');
            return;
        }

        const text = `
🎵 **${track.title}**
👤 ${track.author}
⏱️ ${formatDuration(track.duration)}
📊 Прослухань: ${track.play_count}
        `.trim();

        await bot.sendAudio(msg.chat.id, track.file_path, {
            caption: text,
            parse_mode: 'Markdown',
            title: track.title,
            performer: track.author,
            duration: track.duration
        });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

bot.onText(/\/stats/, async (msg) => {
    const user = await checkUser(msg);

    try {
        const stats = await User.getStatistics(user.id);

        const text = `
📊 **Ваша статистика**

🎵 Всього прослухано: ${stats.total_plays || 0}
🎼 Унікальних треків: ${stats.unique_tracks_played || 0}
➕ Додано треків: ${stats.tracks_added || 0}
📋 Створено плейлистів: ${stats.playlists_created || 0}
⭐ Улюблених: ${stats.favorite_tracks || 0}

📅 З нами з: ${new Date(stats.created_at).toLocaleDateString('uk-UA')}
        `.trim();

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

bot.onText(/\/popular/, async (msg) => {
    await checkUser(msg);

    try {
        const tracks = await Track.getPopular(7, 10);

        if (tracks.length === 0) {
            bot.sendMessage(msg.chat.id, '📊 Поки немає популярних треків');
            return;
        }

        let text = '🔥 **Топ треків за тиждень:**\n\n';

        tracks.forEach((track, index) => {
            text += `${index + 1}. **${track.title}**\n`;
            text += `   👤 ${track.author}\n`;
            text += `   📊 ${track.play_count} прослухань\n`;
            text += `   ID: \`${track.track_id}\`\n\n`;
        });

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

// Обробка текстових повідомлень (автоматичне скачування)
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    // Пропускаємо якщо це callback або інший тип
    if (msg.reply_to_message) return;

    const user = await checkUser(msg);
    const query = msg.text;

    if (query.length < 3) return;

    const statusMsg = await bot.sendMessage(msg.chat.id, '🔍 Шукаю...');

    try {
        const result = await downloadTrack(query, user.id);
        await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

        const text = `✅ ${result.track.title} - ${result.track.author}`;

        await bot.sendAudio(msg.chat.id, result.track.file_path, {
            caption: text,
            title: result.track.title,
            performer: result.track.author
        });

    } catch (error) {
        await bot.deleteMessage(msg.chat.id, statusMsg.message_id);
    }
});

// Запуск бота
async function startBot() {
    console.log('🤖 Telegram бот запускається...\n');

    const connected = await db.testConnection();

    if (!connected) {
        console.error('❌ Не вдалося підключитися до БД');
        process.exit(1);
    }

    // Ініціалізуємо модулі
    new AdminPanel(bot);
    new PlaylistManager(bot);

    // Discord Control буде ініціалізовано через global.initDiscordControl()

    // Запускаємо планувальник очищення
    if (process.env.CLEANUP_ENABLED === 'true') {
        startScheduledCleanup();
    }

    console.log('✅ Telegram бот запущено!');
    console.log(`👤 Адмін ID: ${ADMIN_ID || 'не вказано'}\n`);

    if (!ADMIN_ID) {
        console.log('⚠️  УВАГА: TELEGRAM_ADMIN_ID не встановлено в .env');
        console.log('Надішліть /start боту @userinfobot щоб дізнатись ваш ID\n');
    }
}

// Експорт функції для ініціалізації Discord Control
global.initDiscordControl = (discordClient) => {
    new DiscordControl(bot, discordClient);
    console.log('✅ Discord Control ініціалізовано');
};

startBot().catch(err => {
    console.error('❌ Критична помилка:', err);
    process.exit(1);
});

module.exports = bot;
