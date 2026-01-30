const User = require('../database/models/User');

class DiscordControl {
    constructor(bot, discordClient) {
        this.bot = bot;
        this.discordClient = discordClient;
        this.userGuildSelections = new Map(); // Зберігає вибір сервера для кожного користувача
        this.setupCommands();
    }

    setupCommands() {
        // /discord - головне меню управління
        this.bot.onText(/\/discord/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🌐 Вибрати сервер', callback_data: 'dc_select_server' }
                    ],
                    [
                        { text: '📝 Вибрати канали', callback_data: 'dc_select_channels' }
                    ],
                    [
                        { text: '🔊 Підключитись', callback_data: 'dc_join' },
                        { text: '🔇 Відключитись', callback_data: 'dc_leave' }
                    ],
                    [
                        { text: '▶️ Відтворити', callback_data: 'dc_play' },
                        { text: '⏸️ Пауза', callback_data: 'dc_pause' }
                    ],
                    [
                        { text: '⏭️ Пропустити', callback_data: 'dc_skip' },
                        { text: '⏹️ Стоп', callback_data: 'dc_stop' }
                    ],
                    [
                        { text: '📋 Черга', callback_data: 'dc_queue' }
                    ]
                ]
            };

            this.bot.sendMessage(msg.chat.id, '🎮 **Управління Discord ботом**\n\nОберіть дію:', {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });

        // /servers - список серверів
        this.bot.onText(/\/servers/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            await this.showServers(msg.chat.id);
        });

        // /channels - список каналів обраного сервера
        this.bot.onText(/\/channels/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            const guildId = this.userGuildSelections.get(msg.from.id);

            if (!guildId) {
                this.bot.sendMessage(msg.chat.id, '❌ Спочатку виберіть сервер: /servers');
                return;
            }

            await this.showChannels(msg.chat.id, guildId);
        });

        // /join - підключитись до голосового каналу
        this.bot.onText(/\/join/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            const guildId = this.userGuildSelections.get(msg.from.id);

            if (!guildId) {
                this.bot.sendMessage(msg.chat.id, '❌ Спочатку виберіть сервер: /servers');
                return;
            }

            // Отримуємо налаштування сервера з БД
            const guildSettings = await this.getGuildSettings(guildId);

            if (!guildSettings || !guildSettings.default_voice_channel_id) {
                this.bot.sendMessage(msg.chat.id,
                    '❌ Голосовий канал не вибрано\n\n💡 Виберіть канал: /channels'
                );
                return;
            }

            try {
                await this.joinVoiceChannel(guildId, guildSettings.default_voice_channel_id);
                this.bot.sendMessage(msg.chat.id, '✅ Підключено до голосового каналу');
            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
            }
        });

        // Обробка callback запитів
        this.bot.on('callback_query', async (query) => {
            const data = query.data;

            if (data.startsWith('dc_')) {
                await this.handleDiscordCallback(query);
            }

            this.bot.answerCallbackQuery(query.id);
        });
    }

    async getUser(msg) {
        const telegramId = msg.from?.id || msg.chat?.id;
        const user = await User.findByTelegramId(telegramId);
        if (!user) {
            this.bot.sendMessage(msg.chat?.id || telegramId, '❌ Користувача не знайдено. Напишіть /start');
            return null;
        }
        return user;
    }

    async showServers(chatId) {
        try {
            if (!this.discordClient || !this.discordClient.guilds) {
                this.bot.sendMessage(chatId, '❌ Discord бот не підключено');
                return;
            }

            const guilds = this.discordClient.guilds.cache;

            if (guilds.size === 0) {
                this.bot.sendMessage(chatId, '❌ Discord бот не доданий до жодного сервера');
                return;
            }

            let text = '🌐 **Discord сервери:**\n\n';

            const buttons = [];

            guilds.forEach((guild, index) => {
                text += `${index + 1}. **${guild.name}**\n`;
                text += `   ID: \`${guild.id}\`\n`;
                text += `   Учасників: ${guild.memberCount}\n\n`;

                buttons.push([{
                    text: guild.name,
                    callback_data: `dc_guild_${guild.id}`
                }]);
            });

            text += '\n💡 Натисніть на сервер щоб вибрати';

            const keyboard = { inline_keyboard: buttons };

            this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async showChannels(chatId, guildId) {
        try {
            const guild = this.discordClient.guilds.cache.get(guildId);

            if (!guild) {
                this.bot.sendMessage(chatId, '❌ Сервер не знайдено');
                return;
            }

            // Текстові канали
            const textChannels = guild.channels.cache.filter(ch => ch.type === 0);
            // Голосові канали
            const voiceChannels = guild.channels.cache.filter(ch => ch.type === 2);

            let text = `📝 **Канали сервера ${guild.name}:**\n\n`;

            text += '**📝 Текстові:**\n';
            textChannels.forEach((channel, index) => {
                text += `${index + 1}. ${channel.name} (\`${channel.id}\`)\n`;
            });

            text += '\n**🔊 Голосові:**\n';
            voiceChannels.forEach((channel, index) => {
                text += `${index + 1}. ${channel.name} (\`${channel.id}\`)\n`;
            });

            const buttons = [];

            // Кнопки для голосових каналів
            voiceChannels.forEach(channel => {
                buttons.push([{
                    text: `🔊 ${channel.name}`,
                    callback_data: `dc_voice_${channel.id}`
                }]);
            });

            const keyboard = { inline_keyboard: buttons };

            this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
        }
    }

    async handleDiscordCallback(query) {
        const msg = query.message;
        const data = query.data;
        const user = await this.getUser(msg);
        if (!user) return;

        const parts = data.split('_');
        const action = parts[1];

        try {
            if (action === 'select' && parts[2] === 'server') {
                await this.showServers(msg.chat.id);

            } else if (action === 'guild') {
                const guildId = parts[2];
                this.userGuildSelections.set(msg.chat.id, guildId);

                const guild = this.discordClient.guilds.cache.get(guildId);

                this.bot.sendMessage(msg.chat.id,
                    `✅ Обрано сервер: **${guild.name}**\n\n💡 Тепер виберіть канали: /channels`,
                    { parse_mode: 'Markdown' }
                );

            } else if (action === 'voice') {
                const channelId = parts[2];
                const guildId = this.userGuildSelections.get(msg.chat.id);

                if (!guildId) {
                    this.bot.sendMessage(msg.chat.id, '❌ Спочатку виберіть сервер');
                    return;
                }

                // Зберігаємо вибір в БД
                await this.saveGuildSettings(guildId, { voice_channel_id: channelId });

                const channel = this.discordClient.channels.cache.get(channelId);

                this.bot.sendMessage(msg.chat.id,
                    `✅ Обрано голосовий канал: **${channel.name}**\n\n💡 Підключитись: /join`,
                    { parse_mode: 'Markdown' }
                );

            } else if (action === 'join') {
                const guildId = this.userGuildSelections.get(msg.chat.id);
                if (!guildId) {
                    this.bot.sendMessage(msg.chat.id, '❌ Виберіть сервер: /servers');
                    return;
                }

                const settings = await this.getGuildSettings(guildId);
                if (!settings || !settings.default_voice_channel_id) {
                    this.bot.sendMessage(msg.chat.id, '❌ Виберіть голосовий канал: /channels');
                    return;
                }

                await this.joinVoiceChannel(guildId, settings.default_voice_channel_id);
                this.bot.sendMessage(msg.chat.id, '✅ Підключено');

            } else if (action === 'leave') {
                const guildId = this.userGuildSelections.get(msg.chat.id);
                if (guildId) {
                    await this.leaveVoiceChannel(guildId);
                }
                this.bot.sendMessage(msg.chat.id, '👋 Відключено');

            } else if (action === 'queue') {
                await this.showQueue(msg.chat.id);

            } else if (action === 'skip') {
                await this.skipTrack(msg.chat.id);

            } else if (action === 'stop') {
                await this.stopPlayback(msg.chat.id);

            } else if (action === 'pause') {
                await this.pausePlayback(msg.chat.id);
            }

        } catch (error) {
            this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
        }
    }

    async getGuildSettings(guildId) {
        const db = require('../database/config');
        const result = await db.query(
            'SELECT * FROM discord_guilds WHERE guild_id = $1',
            [guildId]
        );
        return result.rows[0];
    }

    async saveGuildSettings(guildId, settings) {
        const db = require('../database/config');
        await db.query(`
            INSERT INTO discord_guilds (guild_id, default_voice_channel_id, default_text_channel_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (guild_id) DO UPDATE
            SET default_voice_channel_id = COALESCE($2, discord_guilds.default_voice_channel_id),
                default_text_channel_id = COALESCE($3, discord_guilds.default_text_channel_id),
                updated_at = CURRENT_TIMESTAMP
        `, [guildId, settings.voice_channel_id || null, settings.text_channel_id || null]);
    }

    async joinVoiceChannel(guildId, channelId) {
        // Використовуємо глобальну функцію з Discord бота
        if (global.discordBotControl && global.discordBotControl.joinChannel) {
            return await global.discordBotControl.joinChannel(guildId, channelId);
        }
        throw new Error('Discord бот не готовий');
    }

    async leaveVoiceChannel(guildId) {
        if (global.discordBotControl && global.discordBotControl.leaveChannel) {
            return await global.discordBotControl.leaveChannel(guildId);
        }
    }

    async showQueue(chatId) {
        if (global.discordBotControl && global.discordBotControl.getQueue) {
            const queue = await global.discordBotControl.getQueue();
            // Форматуємо і відправляємо чергу
            this.bot.sendMessage(chatId, queue || '📋 Черга порожня');
        }
    }

    async skipTrack(chatId) {
        if (global.discordBotControl && global.discordBotControl.skip) {
            await global.discordBotControl.skip();
            this.bot.sendMessage(chatId, '⏭️ Пропущено');
        }
    }

    async stopPlayback(chatId) {
        if (global.discordBotControl && global.discordBotControl.stop) {
            await global.discordBotControl.stop();
            this.bot.sendMessage(chatId, '⏹️ Зупинено');
        }
    }

    async pausePlayback(chatId) {
        if (global.discordBotControl && global.discordBotControl.pause) {
            await global.discordBotControl.pause();
            this.bot.sendMessage(chatId, '⏸️ Пауза');
        }
    }
}

module.exports = DiscordControl;
