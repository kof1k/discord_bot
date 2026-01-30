const db = require('../config');

class Track {
    // Додати новий трек
    static async create(trackData) {
        const query = `
            INSERT INTO tracks (title, author, duration, file_path, file_size, thumbnail_url, youtube_url, youtube_id, added_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;

        const values = [
            trackData.title,
            trackData.author,
            trackData.duration,
            trackData.file_path,
            trackData.file_size,
            trackData.thumbnail_url,
            trackData.youtube_url,
            trackData.youtube_id,
            trackData.added_by_user_id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Знайти трек за YouTube ID
    static async findByYoutubeId(youtubeId) {
        const query = 'SELECT * FROM tracks WHERE youtube_id = $1 AND is_deleted = FALSE';
        const result = await db.query(query, [youtubeId]);
        return result.rows[0];
    }

    // Знайти трек за ID
    static async findById(id) {
        const query = 'SELECT * FROM tracks WHERE id = $1 AND is_deleted = FALSE';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Пошук треків за назвою або автором
    static async search(searchText, limit = 20) {
        const query = `
            SELECT * FROM tracks
            WHERE (title ILIKE $1 OR author ILIKE $1)
            AND is_deleted = FALSE
            ORDER BY play_count DESC, created_at DESC
            LIMIT $2
        `;
        const result = await db.query(query, [`%${searchText}%`, limit]);
        return result.rows;
    }

    // Оновити кількість прослуховувань
    static async incrementPlayCount(id) {
        const query = `
            UPDATE tracks
            SET play_count = play_count + 1, last_played = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Отримати популярні треки
    static async getPopular(days = 7, limit = 10) {
        const query = 'SELECT * FROM get_popular_tracks($1, $2)';
        const result = await db.query(query, [days, limit]);
        return result.rows;
    }

    // Отримати треки для видалення (не слухались > 7 днів і не в плейлистах)
    static async getTracksToDelete(daysInactive = 7) {
        const query = `
            SELECT t.* FROM tracks t
            WHERE t.is_deleted = FALSE
            AND (
                t.last_played IS NULL OR
                t.last_played < CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            )
            AND t.created_at < CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND NOT EXISTS (
                SELECT 1 FROM playlist_tracks pt WHERE pt.track_id = t.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM user_favorites uf WHERE uf.track_id = t.id
            )
        `;
        const result = await db.query(query, [daysInactive]);
        return result.rows;
    }

    // Позначити трек як видалений
    static async markAsDeleted(id) {
        const query = `
            UPDATE tracks
            SET is_deleted = TRUE
            WHERE id = $1
            RETURNING *
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Отримати статистику треку
    static async getStatistics(id) {
        const query = 'SELECT * FROM track_statistics WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Отримати всі треки користувача
    static async getUserTracks(userId, limit = 50) {
        const query = `
            SELECT * FROM tracks
            WHERE added_by_user_id = $1 AND is_deleted = FALSE
            ORDER BY created_at DESC
            LIMIT $2
        `;
        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }

    // Отримати недавно додані треки
    static async getRecent(limit = 20) {
        const query = `
            SELECT * FROM tracks
            WHERE is_deleted = FALSE
            ORDER BY created_at DESC
            LIMIT $1
        `;
        const result = await db.query(query, [limit]);
        return result.rows;
    }
}

module.exports = Track;
