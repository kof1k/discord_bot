const Playlist = require('../database/models/Playlist');
const Track = require('../database/models/Track');
const User = require('../database/models/User');

class PlaylistManager {
    constructor(bot) {
        this.bot = bot;
        this.userStates = new Map();
        this.setupCommands();
    }

    setupCommands() {
        // /playlists - мої плейлисти
        this.bot.onText(/\/playlists/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            try {
                const playlists = await Playlist.getUserPlaylists(user.id);

                if (playlists.length === 0) {
                    this.bot.sendMessage(msg.chat.id,
                        '📋 У вас ще немає плейлистів\n\n💡 Створіть перший: /create_playlist'
                    );
                    return;
                }

                let text = '📋 **Ваші плейлисти:**\n\n';

                playlists.forEach((playlist, index) => {
                    const visibility = playlist.is_public ? '🌐' : '🔒';
                    text += `${index + 1}. ${visibility} **${playlist.name}**\n`;
                    text += `   🎵 Треків: ${playlist.track_count}\n`;
                    text += `   ID: \`${playlist.id}\`\n\n`;
                });

                text += '\n💡 /playlist <ID> - переглянути плейлист';
                text += '\n💡 /create_playlist - створити новий';

                this.bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
            }
        });

        // /create_playlist - створити плейлист
        this.bot.onText(/\/create_playlist/, async (msg) => {
            const user = await this.getUser(msg);
            if (!user) return;

            this.userStates.set(msg.from.id, { action: 'create_playlist', userId: user.id });

            this.bot.sendMessage(msg.chat.id,
                '📝 Введіть назву плейлиста:\n\n💡 Або /cancel щоб скасувати'
            );
        });

        // /playlist <ID> - переглянути плейлист
        this.bot.onText(/\/playlist (\d+)/, async (msg, match) => {
            const user = await this.getUser(msg);
            if (!user) return;

            const playlistId = parseInt(match[1]);

            try {
                const playlist = await Playlist.findById(playlistId);

                if (!playlist) {
                    this.bot.sendMessage(msg.chat.id, '❌ Плейлист не знайдено');
                    return;
                }

                // Перевіряємо доступ
                if (!playlist.is_public && playlist.owner_id !== user.id) {
                    this.bot.sendMessage(msg.chat.id, '❌ Немає доступу до цього плейлиста');
                    return;
                }

                const tracks = await Playlist.getTracks(playlistId);

                let text = `📋 **${playlist.name}**\n`;
                if (playlist.description) {
                    text += `${playlist.description}\n`;
                }
                text += `\n🎵 Треків: ${tracks.length}\n`;
                text += `📊 Прослухань: ${playlist.play_count}\n\n`;

                if (tracks.length > 0) {
                    text += '**Треки:**\n';
                    tracks.forEach((track, index) => {
                        text += `${index + 1}. ${track.title} - ${track.author}\n`;
                    });
                }

                const keyboard = {
                    inline_keyboard: []
                };

                if (playlist.owner_id === user.id) {
                    keyboard.inline_keyboard.push([
                        { text: '➕ Додати трек', callback_data: `pl_add_${playlistId}` },
                        { text: '✏️ Редагувати', callback_data: `pl_edit_${playlistId}` }
                    ]);
                    keyboard.inline_keyboard.push([
                        { text: '🗑️ Видалити', callback_data: `pl_delete_${playlistId}` }
                    ]);
                }

                keyboard.inline_keyboard.push([
                    { text: '▶️ Відтворити', callback_data: `pl_play_${playlistId}` }
                ]);

                this.bot.sendMessage(msg.chat.id, text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
            }
        });

        // /popular_playlists - популярні плейлисти
        this.bot.onText(/\/popular_playlists/, async (msg) => {
            await this.getUser(msg);

            try {
                const playlists = await Playlist.getPublicPlaylists(10);

                if (playlists.length === 0) {
                    this.bot.sendMessage(msg.chat.id, '📋 Поки немає публічних плейлистів');
                    return;
                }

                let text = '🌐 **Популярні плейлисти:**\n\n';

                playlists.forEach((playlist, index) => {
                    text += `${index + 1}. **${playlist.name}**\n`;
                    text += `   👤 ${playlist.owner_name}\n`;
                    text += `   🎵 Треків: ${playlist.track_count}\n`;
                    text += `   📊 Прослухань: ${playlist.play_count}\n`;
                    text += `   ID: \`${playlist.id}\`\n\n`;
                });

                text += '\n💡 /playlist <ID> - переглянути';

                this.bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
            }
        });

        // Обробка callback запитів
        this.bot.on('callback_query', async (query) => {
            const data = query.data;

            if (data.startsWith('pl_')) {
                await this.handlePlaylistCallback(query);
            }

            this.bot.answerCallbackQuery(query.id);
        });

        // Обробка текстових повідомлень для діалогів
        this.bot.on('message', async (msg) => {
            if (!msg.text || msg.text.startsWith('/')) return;

            const state = this.userStates.get(msg.from.id);
            if (!state) return;

            if (state.action === 'create_playlist') {
                await this.handleCreatePlaylistName(msg, state);
            } else if (state.action === 'add_track_to_playlist') {
                await this.handleAddTrack(msg, state);
            } else if (state.action === 'edit_playlist_name') {
                await this.handleEditPlaylistName(msg, state);
            }
        });

        // /cancel - скасувати діалог
        this.bot.onText(/\/cancel/, (msg) => {
            if (this.userStates.has(msg.from.id)) {
                this.userStates.delete(msg.from.id);
                this.bot.sendMessage(msg.chat.id, '❌ Скасовано');
            }
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

    async handleCreatePlaylistName(msg, state) {
        const name = msg.text;

        if (name.length > 100) {
            this.bot.sendMessage(msg.chat.id, '❌ Назва занадто довга (макс 100 символів)');
            return;
        }

        try {
            const playlist = await Playlist.create({
                name: name,
                owner_id: state.userId,
                is_public: false
            });

            this.userStates.delete(msg.from.id);

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Додати треки', callback_data: `pl_add_${playlist.id}` }
                    ],
                    [
                        { text: '🌐 Зробити публічним', callback_data: `pl_public_${playlist.id}` }
                    ]
                ]
            };

            this.bot.sendMessage(msg.chat.id,
                `✅ Плейлист **${name}** створено!\n\nID: \`${playlist.id}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );

        } catch (error) {
            this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
        }
    }

    async handlePlaylistCallback(query) {
        const msg = query.message;
        const data = query.data;
        const user = await this.getUser(msg);
        if (!user) return;

        const parts = data.split('_');
        const action = parts[1];
        const playlistId = parseInt(parts[2]);

        try {
            const playlist = await Playlist.findById(playlistId);

            if (!playlist) {
                this.bot.sendMessage(msg.chat.id, '❌ Плейлист не знайдено');
                return;
            }

            if (action === 'add') {
                this.userStates.set(msg.chat.id, {
                    action: 'add_track_to_playlist',
                    playlistId: playlistId,
                    userId: user.id
                });

                this.bot.sendMessage(msg.chat.id,
                    '🔍 Введіть ID треку або назву для пошуку:\n\n💡 /cancel щоб скасувати'
                );

            } else if (action === 'delete') {
                if (playlist.owner_id !== user.id) {
                    this.bot.sendMessage(msg.chat.id, '❌ Ви не можете видалити цей плейлист');
                    return;
                }

                await Playlist.delete(playlistId);
                this.bot.sendMessage(msg.chat.id, '✅ Плейлист видалено');

            } else if (action === 'public') {
                if (playlist.owner_id !== user.id) {
                    this.bot.sendMessage(msg.chat.id, '❌ Немає доступу');
                    return;
                }

                await Playlist.update(playlistId, { is_public: !playlist.is_public });
                const status = !playlist.is_public ? 'публічним' : 'приватним';
                this.bot.sendMessage(msg.chat.id, `✅ Плейлист тепер ${status}`);

            } else if (action === 'play') {
                // Тут буде інтеграція з Discord ботом
                this.bot.sendMessage(msg.chat.id,
                    '🎵 Відтворення плейлиста буде додано в наступній версії'
                );
            }

        } catch (error) {
            this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
        }
    }

    async handleAddTrack(msg, state) {
        const input = msg.text;

        try {
            let track = null;

            // Перевіряємо чи це ID
            if (/^\d+$/.test(input)) {
                track = await Track.findById(parseInt(input));
            } else {
                // Шукаємо за назвою
                const tracks = await Track.search(input, 1);
                if (tracks.length > 0) {
                    track = tracks[0];
                }
            }

            if (!track) {
                this.bot.sendMessage(msg.chat.id,
                    '❌ Трек не знайдено\n\n💡 Спробуйте ще раз або /cancel'
                );
                return;
            }

            await Playlist.addTrack(state.playlistId, track.id);

            this.userStates.delete(msg.from.id);

            this.bot.sendMessage(msg.chat.id,
                `✅ Трек **${track.title}** додано до плейлиста`,
                { parse_mode: 'Markdown' }
            );

        } catch (error) {
            this.bot.sendMessage(msg.chat.id, `❌ Помилка: ${error.message}`);
        }
    }
}

module.exports = PlaylistManager;
