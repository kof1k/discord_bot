const db = require('../config');

class User {
    // Створити або оновити користувача
    static async findOrCreate(userData) {
        const { telegram_id, discord_id, username } = userData;

        const query = `
            INSERT INTO users (telegram_id, discord_id, username, last_active)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (telegram_id)
            DO UPDATE SET
                discord_id = COALESCE(EXCLUDED.discord_id, users.discord_id),
                username = EXCLUDED.username,
                last_active = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await db.query(query, [telegram_id, discord_id, username]);
        return result.rows[0];
    }

    // Знайти користувача за Telegram ID
    static async findByTelegramId(telegramId) {
        const query = 'SELECT * FROM users WHERE telegram_id = $1';
        const result = await db.query(query, [telegramId]);
        return result.rows[0];
    }

    // Знайти користувача за Discord ID
    static async findByDiscordId(discordId) {
        const query = 'SELECT * FROM users WHERE discord_id = $1';
        const result = await db.query(query, [discordId]);
        return result.rows[0];
    }

    // Знайти користувача за ID
    static async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Перевірити чи є користувач адміном
    static async isAdmin(telegramId) {
        const query = 'SELECT role FROM users WHERE telegram_id = $1';
        const result = await db.query(query, [telegramId]);
        return result.rows[0]?.role === 'admin';
    }

    // Оновити роль користувача
    static async updateRole(userId, role) {
        const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING *';
        const result = await db.query(query, [role, userId]);
        return result.rows[0];
    }

    // Отримати всіх адміністраторів
    static async getAdmins() {
        const query = 'SELECT * FROM users WHERE role = $1';
        const result = await db.query(query, ['admin']);
        return result.rows;
    }

    // Отримати налаштування користувача
    static async getSettings(userId) {
        const query = 'SELECT * FROM user_settings WHERE user_id = $1';
        const result = await db.query(query, [userId]);
        return result.rows[0];
    }

    // Оновити налаштування користувача
    static async updateSettings(userId, settings) {
        const query = `
            INSERT INTO user_settings (user_id, language, notifications_enabled, auto_download, preferred_quality, settings)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id)
            DO UPDATE SET
                language = EXCLUDED.language,
                notifications_enabled = EXCLUDED.notifications_enabled,
                auto_download = EXCLUDED.auto_download,
                preferred_quality = EXCLUDED.preferred_quality,
                settings = EXCLUDED.settings,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const values = [
            userId,
            settings.language || 'uk',
            settings.notifications_enabled !== undefined ? settings.notifications_enabled : true,
            settings.auto_download !== undefined ? settings.auto_download : false,
            settings.preferred_quality || '192',
            JSON.stringify(settings.custom || {})
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Оновити час останньої активності
    static async updateLastActive(userId) {
        const query = 'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1';
        await db.query(query, [userId]);
    }

    // Отримати статистику користувача
    static async getStatistics(userId) {
        const query = `
            SELECT
                u.id,
                u.username,
                u.created_at,
                COUNT(DISTINCT ph.id) as total_plays,
                COUNT(DISTINCT ph.track_id) as unique_tracks_played,
                COUNT(DISTINCT t.id) as tracks_added,
                COUNT(DISTINCT p.id) as playlists_created,
                COUNT(DISTINCT uf.id) as favorite_tracks
            FROM users u
            LEFT JOIN play_history ph ON u.id = ph.user_id
            LEFT JOIN tracks t ON u.id = t.added_by_user_id
            LEFT JOIN playlists p ON u.id = p.owner_id
            LEFT JOIN user_favorites uf ON u.id = uf.user_id
            WHERE u.id = $1
            GROUP BY u.id, u.username, u.created_at
        `;
        const result = await db.query(query, [userId]);
        return result.rows[0];
    }

    // Додати трек до улюблених
    static async addFavorite(userId, trackId) {
        const query = `
            INSERT INTO user_favorites (user_id, track_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, track_id) DO NOTHING
            RETURNING *
        `;
        const result = await db.query(query, [userId, trackId]);
        return result.rows[0];
    }

    // Видалити трек з улюблених
    static async removeFavorite(userId, trackId) {
        const query = 'DELETE FROM user_favorites WHERE user_id = $1 AND track_id = $2 RETURNING *';
        const result = await db.query(query, [userId, trackId]);
        return result.rows[0];
    }

    // Отримати улюблені треки
    static async getFavorites(userId, limit = 50) {
        const query = `
            SELECT t.* FROM tracks t
            JOIN user_favorites uf ON t.id = uf.track_id
            WHERE uf.user_id = $1 AND t.is_deleted = FALSE
            ORDER BY uf.added_at DESC
            LIMIT $2
        `;
        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }
}

module.exports = User;
