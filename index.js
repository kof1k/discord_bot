require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const TOKEN = process.env.TOKEN;
const PREFIX = '!';

const queues = new Map();

function createQueue() {
    return {
        songs: [],
        connection: null,
        player: createAudioPlayer(),
        playing: false,
        loop: false
    };
}

// Функция для скачивания через Python
function downloadSong(query) {
    return new Promise((resolve, reject) => {
        console.log('[DOWNLOAD] Начинаю скачивание:', query);
        
        const python = spawn('python', ['downloader.py', query]);
        
        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
            console.log('[PYTHON STDOUT]:', data.toString());
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('[PYTHON STDERR]:', data.toString());
        });

        python.on('close', (code) => {
            console.log('[PYTHON] Завершён с кодом:', code);
            console.log('[PYTHON] Output:', output);
            
            try {
                const lines = output.trim().split('\n');
                const jsonLine = lines[lines.length - 1];
                const result = JSON.parse(jsonLine);
                
                if (result.success) {
                    console.log('[DOWNLOAD] Успешно:', result.file);
                    resolve(result);
                } else {
                    console.log('[DOWNLOAD] Ошибка:', result.error);
                    reject(new Error(result.error));
                }
            } catch (e) {
                console.log('[DOWNLOAD] Ошибка парсинга:', e.message);
                reject(new Error(errorOutput || 'Failed to parse response'));
            }
        });

        python.on('error', (err) => {
            console.log('[PYTHON] Ошибка запуска:', err.message);
            reject(err);
        });
    });
}

client.once('clientReady', () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    client.user.setActivity('!help | Музыка 🎵');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    switch (command) {
        case 'play':
        case 'p':
            await handlePlay(message, args);
            break;
        case 'skip':
        case 's':
            handleSkip(message);
            break;
        case 'stop':
            handleStop(message);
            break;
        case 'queue':
        case 'q':
            handleQueue(message);
            break;
        case 'pause':
            handlePause(message);
            break;
        case 'resume':
            handleResume(message);
            break;
        case 'loop':
            handleLoop(message);
            break;
        case 'np':
        case 'nowplaying':
            handleNowPlaying(message);
            break;
        case 'shuffle':
            handleShuffle(message);
            break;
        case 'leave':
        case 'disconnect':
            handleLeave(message);
            break;
        case 'help':
        case 'h':
            handleHelp(message);
            break;
    }
});

async function handlePlay(message, args) {
    console.log('\n=== PLAY COMMAND ===');
    
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
        return message.reply('❌ Войдите в голосовой канал!');
    }

    if (!args.length) {
        return message.reply('❌ Укажите название или ссылку!');
    }

    let queue = queues.get(message.guild.id);

    if (!queue) {
        queue = createQueue();
        queues.set(message.guild.id, queue);
        console.log('[QUEUE] Создана новая очередь');
    }

    const searchQuery = args.join(' ');
    const loadingMsg = await message.reply('🔍 Ищу и скачиваю...');

    try {
        const songData = await downloadSong(searchQuery);

        const song = {
            title: songData.title,
            duration: formatDuration(songData.duration),
            thumbnail: songData.thumbnail,
            url: songData.url,
            file: songData.file,
            author: songData.author,
            requestedBy: message.author.tag
        };

        console.log('[SONG] Добавлен:', song.title);
        console.log('[SONG] Файл:', song.file);
        console.log('[SONG] Файл существует:', fs.existsSync(song.file));

        queue.songs.push(song);

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎵 Добавлено в очередь')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: '⏱️ Длительность', value: song.duration, inline: true },
                { name: '👤 Автор', value: song.author, inline: true },
                { name: '📍 Позиция', value: `${queue.songs.length}`, inline: true }
            )
            .setFooter({ text: `Запросил: ${song.requestedBy}` });

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        await loadingMsg.edit({ content: '', embeds: [embed] });

        // Подключаемся к каналу
        if (!queue.connection) {
            console.log('[VOICE] Подключаюсь к каналу:', voiceChannel.name);
            
            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            });

            queue.connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('[VOICE] Подключен!');
            });

            queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                console.log('[VOICE] Отключен');
                try {
                    await Promise.race([
                        entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch {
                    queue.connection?.destroy();
                    queues.delete(message.guild.id);
                }
            });

            queue.player.on(AudioPlayerStatus.Playing, () => {
                console.log('[PLAYER] Воспроизведение началось!');
            });

            queue.player.on(AudioPlayerStatus.Idle, () => {
                console.log('[PLAYER] Idle - трек закончился');
                
                const oldSong = queue.songs[0];
                
                // Удаляем старый файл
                if (oldSong?.file && fs.existsSync(oldSong.file)) {
                    try {
                        fs.unlinkSync(oldSong.file);
                        console.log('[FILE] Удалён:', oldSong.file);
                    } catch (e) {
                        console.log('[FILE] Ошибка удаления:', e.message);
                    }
                }

                if (queue.loop && queue.songs.length > 0) {
                    const song = queue.songs[0];
                    downloadSong(song.url).then(data => {
                        song.file = data.file;
                        playNext(message.guild.id, message.channel);
                    });
                } else {
                    queue.songs.shift();
                    playNext(message.guild.id, message.channel);
                }
            });

            queue.player.on('error', error => {
                console.error('[PLAYER] Ошибка:', error.message);
                console.error('[PLAYER] Полная ошибка:', error);
                queue.songs.shift();
                playNext(message.guild.id, message.channel);
            });

            queue.connection.subscribe(queue.player);
            console.log('[VOICE] Player подписан на connection');
        }

        if (!queue.playing) {
            console.log('[QUEUE] Начинаю воспроизведение');
            playNext(message.guild.id, message.channel);
        }

    } catch (error) {
        console.error('[ERROR]:', error.message);
        loadingMsg.edit('❌ Не удалось найти или скачать трек!');
    }
}

function playNext(guildId, channel) {
    console.log('\n=== PLAY NEXT ===');
    
    const queue = queues.get(guildId);

    console.log('[QUEUE] Существует:', !!queue);
    console.log('[QUEUE] Треков:', queue?.songs?.length);

    if (!queue || queue.songs.length === 0) {
        console.log('[QUEUE] Пуста, останавливаюсь');
        if (queue) queue.playing = false;
        return;
    }

    const song = queue.songs[0];

    console.log('[SONG] Название:', song.title);
    console.log('[SONG] Файл:', song.file);
    
    // Проверяем абсолютный путь
    const absolutePath = path.resolve(song.file);
    console.log('[SONG] Абсолютный путь:', absolutePath);
    console.log('[SONG] Файл существует:', fs.existsSync(absolutePath));

    if (!fs.existsSync(absolutePath)) {
        console.error('[ERROR] Файл не найден!');
        channel.send(`❌ Файл не найден: **${song.title}**`);
        queue.songs.shift();
        playNext(guildId, channel);
        return;
    }

    queue.playing = true;

    try {
        console.log('[PLAYER] Создаю ресурс...');
        const resource = createAudioResource(absolutePath, {
            inlineVolume: true
        });
        
        console.log('[PLAYER] Ресурс создан, запускаю...');
        queue.player.play(resource);
        console.log('[PLAYER] play() вызван');

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎶 Сейчас играет')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: '⏱️ Длительность', value: song.duration, inline: true },
                { name: '👤 Автор', value: song.author, inline: true }
            )
            .setFooter({ text: `Запросил: ${song.requestedBy}` });

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('[PLAYER] Ошибка воспроизведения:', error.message);
        console.error('[PLAYER] Stack:', error.stack);
        channel.send(`❌ Ошибка: **${song.title}**`);
        queue.songs.shift();
        playNext(guildId, channel);
    }
}

function handleSkip(message) {
    const queue = queues.get(message.guild.id);
    if (!queue?.playing) return message.reply('❌ Ничего не играет!');
    queue.player.stop();
    message.reply('⏭️ Пропущено!');
}

function handleStop(message) {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('❌ Ничего не играет!');
    
    queue.songs.forEach(song => {
        if (song.file && fs.existsSync(song.file)) {
            try { fs.unlinkSync(song.file); } catch {}
        }
    });
    
    queue.songs = [];
    queue.player.stop();
    queue.playing = false;
    message.reply('⏹️ Остановлено!');
}

function handleQueue(message) {
    const queue = queues.get(message.guild.id);
    if (!queue?.songs.length) return message.reply('❌ Очередь пуста!');

    const list = queue.songs.slice(0, 10).map((song, i) => {
        return `${i === 0 ? '▶️' : `${i}.`} **${song.title}** [${song.duration}]`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle('📜 Очередь')
        .setDescription(list)
        .setFooter({ text: `Всего: ${queue.songs.length} | Повтор: ${queue.loop ? 'Вкл' : 'Выкл'}` });

    message.reply({ embeds: [embed] });
}

function handlePause(message) {
    const queue = queues.get(message.guild.id);
    if (!queue?.playing) return message.reply('❌ Ничего не играет!');
    queue.player.pause();
    message.reply('⏸️ Пауза!');
}

function handleResume(message) {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('❌ Ничего не играет!');
    queue.player.unpause();
    message.reply('▶️ Продолжаю!');
}

function handleLoop(message) {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('❌ Ничего не играет!');
    queue.loop = !queue.loop;
    message.reply(queue.loop ? '🔁 Повтор включен!' : '➡️ Повтор выключен!');
}

function handleNowPlaying(message) {
    const queue = queues.get(message.guild.id);
    if (!queue?.playing || !queue.songs[0]) return message.reply('❌ Ничего не играет!');

    const song = queue.songs[0];
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎶 Сейчас играет')
        .setDescription(`**${song.title}**`)
        .addFields(
            { name: '⏱️ Длительность', value: song.duration, inline: true },
            { name: '👤 Автор', value: song.author, inline: true }
        )
        .setFooter({ text: `Запросил: ${song.requestedBy}` });

    if (song.thumbnail) embed.setThumbnail(song.thumbnail);
    message.reply({ embeds: [embed] });
}

function handleShuffle(message) {
    const queue = queues.get(message.guild.id);
    if (!queue || queue.songs.length <= 2) return message.reply('❌ Мало треков!');

    const current = queue.songs.shift();
    for (let i = queue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
    }
    queue.songs.unshift(current);
    message.reply('🔀 Перемешано!');
}

function handleLeave(message) {
    const queue = queues.get(message.guild.id);
    if (queue) {
        queue.songs.forEach(song => {
            if (song.file && fs.existsSync(song.file)) {
                try { fs.unlinkSync(song.file); } catch {}
            }
        });
        queue.songs = [];
        queue.player.stop();
        queue.connection?.destroy();
        queues.delete(message.guild.id);
    }
    message.reply('👋 До встречи!');
}

function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle('🎵 Команды бота')
        .addFields(
            { name: '▶️ Музыка', value: 
                '`!play <запрос>` - Воспроизвести\n' +
                '`!pause` - Пауза\n' +
                '`!resume` - Продолжить\n' +
                '`!skip` - Пропустить\n' +
                '`!stop` - Остановить'
            },
            { name: '📜 Очередь', value: 
                '`!queue` - Очередь\n' +
                '`!np` - Текущий трек\n' +
                '`!shuffle` - Перемешать\n' +
                '`!loop` - Повтор'
            },
            { name: '🔧 Прочее', value: 
                '`!leave` - Отключить\n' +
                '`!help` - Справка'
            }
        );

    message.reply({ embeds: [embed] });
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

client.login(TOKEN);