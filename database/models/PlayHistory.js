const db = require('../config');

class PlayHistory {
    // Додати запис про прослуховування
    static async create(playData) {
        const query = `
            INSERT INTO play_history (track_id, user_id, discord_guild_id, discord_channel_id, completed)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const values = [
            playData.track_id,
            playData.user_id || null,
            playData.discord_guild_id || null,
            playData.discord_channel_id || null,
            playData.completed || false
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Позначити прослуховування як завершене
    static async markCompleted(id) {
        const query = 'UPDATE play_history SET completed = TRUE WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Отримати історію користувача
    static async getUserHistory(userId, limit = 50) {
        const query = `
            SELECT ph.*, t.title, t.author, t.duration, t.thumbnail_url
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            WHERE ph.user_id = $1
            ORDER BY ph.played_at DESC
            LIMIT $2
        `;
        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }

    // Отримати історію за певний період
    static async getHistoryByPeriod(startDate, endDate, limit = 100) {
        const query = `
            SELECT ph.*, t.title, t.author, u.username
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            LEFT JOIN users u ON ph.user_id = u.id
            WHERE ph.played_at >= $1 AND ph.played_at <= $2
            ORDER BY ph.played_at DESC
            LIMIT $3
        `;
        const result = await db.query(query, [startDate, endDate, limit]);
        return result.rows;
    }

    // Отримати статистику за день
    static async getDailyStats(date = new Date()) {
        const query = `
            SELECT
                COUNT(*) as total_plays,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT track_id) as unique_tracks,
                COUNT(DISTINCT discord_guild_id) as unique_servers
            FROM play_history
            WHERE DATE(played_at) = DATE($1)
        `;
        const result = await db.query(query, [date]);
        return result.rows[0];
    }

    // Отримати найактивніших користувачів
    static async getTopListeners(days = 7, limit = 10) {
        const query = `
            SELECT
                u.id,
                u.username,
                u.telegram_id,
                COUNT(ph.id) as play_count,
                COUNT(DISTINCT ph.track_id) as unique_tracks
            FROM users u
            JOIN play_history ph ON u.id = ph.user_id
            WHERE ph.played_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            GROUP BY u.id, u.username, u.telegram_id
            ORDER BY play_count DESC
            LIMIT $2
        `;
        const result = await db.query(query, [days, limit]);
        return result.rows;
    }

    // Отримати статистику по серверу
    static async getGuildStats(guildId, days = 30) {
        const query = `
            SELECT
                COUNT(*) as total_plays,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT track_id) as unique_tracks,
                COUNT(DISTINCT discord_channel_id) as channels_used
            FROM play_history
            WHERE discord_guild_id = $1
            AND played_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
        `;
        const result = await db.query(query, [guildId, days]);
        return result.rows[0];
    }

    // Очистити стару історію
    static async cleanOldHistory(daysToKeep = 90) {
        const query = `
            DELETE FROM play_history
            WHERE played_at < CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            RETURNING COUNT(*) as deleted_count
        `;
        const result = await db.query(query, [daysToKeep]);
        return result.rows[0];
    }
}

module.exports = PlayHistory;
