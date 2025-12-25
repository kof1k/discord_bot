-- PostgreSQL Database Schema для Music Bot

-- Таблиця користувачів
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    discord_id VARCHAR(100) UNIQUE,
    username VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблиця музичних файлів
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(255),
    duration INTEGER, -- в секундах
    file_path VARCHAR(1000) UNIQUE NOT NULL,
    file_size BIGINT, -- розмір файлу в байтах
    thumbnail_url TEXT,
    youtube_url TEXT,
    youtube_id VARCHAR(100) UNIQUE,
    added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    play_count INTEGER DEFAULT 0,
    last_played TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Індекси для пошуку треків
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_author ON tracks(author);
CREATE INDEX IF NOT EXISTS idx_tracks_youtube_id ON tracks(youtube_id);
CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played);

-- Таблиця плейлистів
CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Зв'язок треків та плейлистів
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id SERIAL PRIMARY KEY,
    playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(playlist_id, track_id)
);

-- Індекси для плейлистів
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);

-- Історія прослуховувань
CREATE TABLE IF NOT EXISTS play_history (
    id SERIAL PRIMARY KEY,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    discord_guild_id VARCHAR(100),
    discord_channel_id VARCHAR(100),
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE -- чи трек був прослуханий до кінця
);

-- Індекси для історії
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_play_history_date ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_guild ON play_history(discord_guild_id);

-- Налаштування Discord серверів
CREATE TABLE IF NOT EXISTS discord_guilds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(100) UNIQUE NOT NULL,
    guild_name VARCHAR(255),
    default_text_channel_id VARCHAR(100),
    default_voice_channel_id VARCHAR(100),
    managed_by_telegram_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    settings JSONB DEFAULT '{}', -- додаткові налаштування
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Налаштування користувачів
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    language VARCHAR(10) DEFAULT 'uk',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    auto_download BOOLEAN DEFAULT FALSE,
    preferred_quality VARCHAR(20) DEFAULT '192',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Статистика використання бота
CREATE TABLE IF NOT EXISTS bot_statistics (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    total_plays INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    tracks_downloaded INTEGER DEFAULT 0,
    total_duration_seconds BIGINT DEFAULT 0,
    data JSONB DEFAULT '{}'
);

-- Улюблені треки користувачів
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_id)
);

-- Індекси для улюблених
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_track ON user_favorites(track_id);

-- Тригер для оновлення updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discord_guilds_updated_at BEFORE UPDATE ON discord_guilds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функція для отримання найпопулярніших треків
CREATE OR REPLACE FUNCTION get_popular_tracks(days INTEGER DEFAULT 7, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    track_id INTEGER,
    title VARCHAR,
    author VARCHAR,
    play_count BIGINT,
    last_played TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.title,
        t.author,
        COUNT(ph.id)::BIGINT as plays,
        MAX(ph.played_at) as last_play
    FROM tracks t
    JOIN play_history ph ON t.id = ph.track_id
    WHERE ph.played_at >= CURRENT_TIMESTAMP - (days || ' days')::INTERVAL
    GROUP BY t.id, t.title, t.author
    ORDER BY plays DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- View для статистики треків
CREATE OR REPLACE VIEW track_statistics AS
SELECT
    t.id,
    t.title,
    t.author,
    t.play_count,
    t.last_played,
    COUNT(DISTINCT ph.user_id) as unique_listeners,
    COUNT(DISTINCT ph.discord_guild_id) as servers_played,
    COUNT(pf.id) as in_favorites,
    COUNT(pt.id) as in_playlists
FROM tracks t
LEFT JOIN play_history ph ON t.id = ph.track_id
LEFT JOIN user_favorites pf ON t.id = pf.track_id
LEFT JOIN playlist_tracks pt ON t.id = pt.track_id
GROUP BY t.id, t.title, t.author, t.play_count, t.last_played;

-- Початкові дані
-- Створення головного адміністратора (потрібно буде оновити telegram_id)
INSERT INTO users (telegram_id, username, role)
VALUES (0, 'admin', 'admin')
ON CONFLICT (telegram_id) DO NOTHING;

-- Створення бази статистики
INSERT INTO bot_statistics (date)
VALUES (CURRENT_DATE)
ON CONFLICT (date) DO NOTHING;
