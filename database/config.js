require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'music_bot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20, // максимальна кількість з'єднань
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Обробка помилок пулу
pool.on('error', (err) => {
    console.error('Неочікувана помилка PostgreSQL:', err);
});

// Функція для перевірки з'єднання
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ PostgreSQL підключено:', result.rows[0].now);
        client.release();
        return true;
    } catch (err) {
        console.error('❌ Помилка підключення до PostgreSQL:', err.message);
        return false;
    }
}

// Функція для ініціалізації БД зі схеми
async function initializeDatabase() {
    const fs = require('fs');
    const path = require('path');

    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        await pool.query(schema);
        console.log('✅ Схема бази даних ініціалізована');
        return true;
    } catch (err) {
        console.error('❌ Помилка ініціалізації схеми:', err.message);
        return false;
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    testConnection,
    initializeDatabase
};
