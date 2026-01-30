require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database/config');
const User = require('./database/models/User');
const Track = require('./database/models/Track');
const Playlist = require('./database/models/Playlist');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const MUSIC_DIR = process.env.MUSIC_DIR || './music';

// Створюємо папки якщо їх немає
[MUSIC_DIR, './downloads'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Стан користувача для діалогів
const userStates = new Map();

// Зв'язок з Discord ботом (глобальний об'єкт для передачі команд)
global.discordBotControl = {
    joinChannel: null,
    playTrack: null,
    getGuilds: null,
    getChannels: null
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

// Middleware для перевірки адміна
async function requireAdmin(msg) {
    const user = await checkUser(msg);
    return user.role === 'admin';
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
                    // Отримуємо YouTube ID з URL
                    const youtubeId = result.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];

                    // Перевіряємо чи є вже такий трек в БД
                    let track = youtubeId ? await Track.findByYoutubeId(youtubeId) : null;

                    if (!track) {
                        // Переміщуємо файл в постійне сховище
                        const newFileName = `${youtubeId || Date.now()}.mp3`;
                        const newPath = path.join(MUSIC_DIR, newFileName);

                        fs.renameSync(result.file, newPath);

                        const stats = fs.statSync(newPath);

                        // Зберігаємо в БД
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
                    } else {
                        // Трек вже є в БД
                        console.log(`ℹ️ Трек вже в БД: ${track.title}`);
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

// ===== КОМАНДИ =====

// /start
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
/stats - Моя статистика

/discord - Управління Discord ботом
/servers - Вибрати сервер

${user.role === 'admin' ? '\n**Адмін панель:**\n/admin - Панель адміністратора\n' : ''}
Скористайтесь /help для більш детальної інформації.
    `.trim();

    bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, async (msg) => {
    const user = await checkUser(msg);

    const helpText = `
📖 **Довідка по командам**

**🎵 Музика:**
/download <назва> - Скачати трек
/search <запит> - Пошук музики
/recent - Нещодавно додані

**📋 Плейлисти:**
/playlists - Мої плейлисти
/create_playlist - Створити плейлист
/popular_playlists - Популярні плейлисти

**⭐ Улюблене:**
/favorites - Мої улюблені
/add_favorite <ID> - Додати в улюблені

**🎮 Discord:**
/discord - Меню управління
/servers - Вибрати сервер
/channels - Вибрати канали
/join - Підключитись до голосового
/play <трек> - Відтворити трек
/queue - Черга відтворення
/skip - Пропустити трек
/stop - Зупинити

**📊 Статистика:**
/stats - Моя статистика
/popular - Популярні треки

${user.role === 'admin' ? `
**⚙️ Адмін:**
/admin - Адмін панель
/users - Список користувачів
/storage - Сховище
/cleanup - Очистити старі файли
` : ''}

💡 Ви також можете просто надіслати назву пісні, і я її скачаю!
    `.trim();

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// /download
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

        // Відправляємо аудіофайл
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

// /search
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

        text += '\n💡 Використайте /get <ID> щоб отримати трек';

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка пошуку: ${error.message}`);
    }
});

// /get - отримати трек з БД
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

// /stats
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
⭐ Улюблених треків: ${stats.favorite_tracks || 0}

📅 З нами з: ${new Date(stats.created_at).toLocaleDateString('uk-UA')}
        `.trim();

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
    }
});

// /popular
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

// Обробка текстових повідомлень (скачування музики)
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const user = await checkUser(msg);

    // Якщо користувач в стані діалогу - обробляємо окремо
    if (userStates.has(msg.from.id)) {
        return;
    }

    // Інакше - пробуємо скачати музику
    const query = msg.text;

    if (query.length < 3) return;

    const statusMsg = await bot.sendMessage(msg.chat.id, '🔍 Шукаю та завантажую...');

    try {
        const result = await downloadTrack(query, user.id);

        await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

        const text = `
✅ **Трек завантажено!**

🎵 ${result.track.title}
👤 ${result.track.author}
⏱️ ${formatDuration(result.track.duration)}
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
    }
});

// Функція форматування тривалості
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Запуск бота
async function startBot() {
    console.log('🤖 Telegram бот запускається...\n');

    // Перевіряємо з'єднання з БД
    const connected = await db.testConnection();

    if (!connected) {
        console.error('❌ Не вдалося підключитися до БД');
        process.exit(1);
    }

    console.log('✅ Telegram бот запущено!');
    console.log(`👤 Адмін ID: ${ADMIN_ID || 'не вказано'}\n`);

    if (!ADMIN_ID) {
        console.log('⚠️  УВАГА: TELEGRAM_ADMIN_ID не встановлено в .env');
        console.log('Надішліть /start боту @userinfobot щоб дізнатись ваш ID\n');
    }
}

startBot().catch(err => {
    console.error('❌ Критична помилка:', err);
    process.exit(1);
});
