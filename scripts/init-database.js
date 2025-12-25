require('dotenv').config();
const db = require('../database/config');

async function initDatabase() {
    console.log('🔧 Ініціалізація бази даних...\n');

    // Перевіряємо з'єднання
    const connected = await db.testConnection();

    if (!connected) {
        console.error('❌ Не вдалося підключитися до PostgreSQL');
        console.error('Переконайтеся що:');
        console.error('1. PostgreSQL запущено');
        console.error('2. База даних створена');
        console.error('3. Дані в .env файлі вірні');
        process.exit(1);
    }

    // Ініціалізуємо схему
    const initialized = await db.initializeDatabase();

    if (initialized) {
        console.log('\n✅ База даних успішно ініціалізована!');

        // Перевіряємо створення таблиць
        const result = await db.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('\n📊 Створені таблиці:');
        result.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

        console.log('\n🎉 Готово! Тепер оновіть TELEGRAM_ADMIN_ID в .env файлі');
        console.log('Щоб отримати ваш Telegram ID, напишіть боту @userinfobot');
    } else {
        console.error('\n❌ Помилка ініціалізації');
        process.exit(1);
    }

    process.exit(0);
}

initDatabase().catch(err => {
    console.error('❌ Критична помилка:', err);
    process.exit(1);
});
