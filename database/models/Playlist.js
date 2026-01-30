const db = require('../config');

class Playlist {
    // Створити новий плейлист
    static async create(playlistData) {
        const query = `
            INSERT INTO playlists (name, description, owner_id, is_public)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const values = [
            playlistData.name,
            playlistData.description || null,
            playlistData.owner_id,
            playlistData.is_public || false
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Знайти плейлист за ID
    static async findById(id) {
        const query = 'SELECT * FROM playlists WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Отримати всі плейлисти користувача
    static async getUserPlaylists(userId) {
        const query = `
            SELECT p.*, COUNT(pt.id) as track_count
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
            WHERE p.owner_id = $1
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        `;
        const result = await db.query(query, [userId]);
        return result.rows;
    }

    // Отримати публічні плейлисти
    static async getPublicPlaylists(limit = 20) {
        const query = `
            SELECT p.*, u.username as owner_name, COUNT(pt.id) as track_count
            FROM playlists p
            LEFT JOIN users u ON p.owner_id = u.id
            LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
            WHERE p.is_public = TRUE
            GROUP BY p.id, u.username
            ORDER BY p.play_count DESC, p.updated_at DESC
            LIMIT $1
        `;
        const result = await db.query(query, [limit]);
        return result.rows;
    }

    // Додати трек до плейлиста
    static async addTrack(playlistId, trackId, position = null) {
        // Якщо позиція не вказана, додаємо в кінець
        if (position === null) {
            const countQuery = 'SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = $1';
            const countResult = await db.query(countQuery, [playlistId]);
            position = parseInt(countResult.rows[0].count) + 1;
        }

        const query = `
            INSERT INTO playlist_tracks (playlist_id, track_id, position)
            VALUES ($1, $2, $3)
            ON CONFLICT (playlist_id, track_id) DO NOTHING
            RETURNING *
        `;

        const result = await db.query(query, [playlistId, trackId, position]);

        // Оновлюємо час оновлення плейлиста
        await db.query('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [playlistId]);

        return result.rows[0];
    }

    // Видалити трек з плейлиста
    static async removeTrack(playlistId, trackId) {
        const query = 'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2 RETURNING *';
        const result = await db.query(query, [playlistId, trackId]);

        // Оновлюємо позиції треків
        await db.query(
            `UPDATE playlist_tracks
             SET position = position - 1
             WHERE playlist_id = $1 AND position > (
                 SELECT position FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2
             )`,
            [playlistId, trackId]
        );

        // Оновлюємо час оновлення плейлиста
        await db.query('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [playlistId]);

        return result.rows[0];
    }

    // Отримати треки плейлиста
    static async getTracks(playlistId) {
        const query = `
            SELECT t.*, pt.position, pt.added_at
            FROM tracks t
            JOIN playlist_tracks pt ON t.id = pt.track_id
            WHERE pt.playlist_id = $1 AND t.is_deleted = FALSE
            ORDER BY pt.position ASC
        `;
        const result = await db.query(query, [playlistId]);
        return result.rows;
    }

    // Оновити плейлист
    static async update(id, updates) {
        const fields = [];
        const values = [];
        let valueIndex = 1;

        if (updates.name !== undefined) {
            fields.push(`name = $${valueIndex++}`);
            values.push(updates.name);
        }

        if (updates.description !== undefined) {
            fields.push(`description = $${valueIndex++}`);
            values.push(updates.description);
        }

        if (updates.is_public !== undefined) {
            fields.push(`is_public = $${valueIndex++}`);
            values.push(updates.is_public);
        }

        if (fields.length === 0) {
            return null;
        }

        values.push(id);
        const query = `UPDATE playlists SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${valueIndex} RETURNING *`;

        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Видалити плейлист
    static async delete(id) {
        const query = 'DELETE FROM playlists WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Перевірити чи є користувач власником плейлиста
    static async isOwner(playlistId, userId) {
        const query = 'SELECT owner_id FROM playlists WHERE id = $1';
        const result = await db.query(query, [playlistId]);
        return result.rows[0]?.owner_id === userId;
    }

    // Інкрементувати лічильник прослуховувань плейлиста
    static async incrementPlayCount(id) {
        const query = 'UPDATE playlists SET play_count = play_count + 1 WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Пошук плейлистів
    static async search(searchText, limit = 20) {
        const query = `
            SELECT p.*, u.username as owner_name, COUNT(pt.id) as track_count
            FROM playlists p
            LEFT JOIN users u ON p.owner_id = u.id
            LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
            WHERE (p.name ILIKE $1 OR p.description ILIKE $1)
            AND p.is_public = TRUE
            GROUP BY p.id, u.username
            ORDER BY p.play_count DESC
            LIMIT $2
        `;
        const result = await db.query(query, [`%${searchText}%`, limit]);
        return result.rows;
    }

    // Змінити порядок треків
    static async reorderTracks(playlistId, trackId, newPosition) {
        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // Отримуємо поточну позицію
            const currentPosQuery = 'SELECT position FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2';
            const currentPosResult = await client.query(currentPosQuery, [playlistId, trackId]);
            const currentPosition = currentPosResult.rows[0]?.position;

            if (!currentPosition) {
                throw new Error('Track not found in playlist');
            }

            if (currentPosition < newPosition) {
                // Рухаємо вниз
                await client.query(
                    `UPDATE playlist_tracks
                     SET position = position - 1
                     WHERE playlist_id = $1 AND position > $2 AND position <= $3`,
                    [playlistId, currentPosition, newPosition]
                );
            } else if (currentPosition > newPosition) {
                // Рухаємо вгору
                await client.query(
                    `UPDATE playlist_tracks
                     SET position = position + 1
                     WHERE playlist_id = $1 AND position >= $2 AND position < $3`,
                    [playlistId, newPosition, currentPosition]
                );
            }

            // Оновлюємо позицію треку
            await client.query(
                'UPDATE playlist_tracks SET position = $1 WHERE playlist_id = $2 AND track_id = $3',
                [newPosition, playlistId, trackId]
            );

            // Оновлюємо час оновлення плейлиста
            await client.query('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [playlistId]);

            await client.query('COMMIT');
            return true;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = Playlist;
