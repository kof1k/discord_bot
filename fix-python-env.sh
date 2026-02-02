#!/bin/bash

# Виправлення для "externally-managed-environment" помилки
echo "🔧 Виправлення Python environment..."

# Перевірка версії Ubuntu
UBUNTU_VERSION=$(lsb_release -rs)
echo "Ubuntu версія: $UBUNTU_VERSION"

# Рішення 1: Використати pipx (рекомендовано)
echo ""
echo "📦 Встановлення pipx..."
sudo apt update
sudo apt install -y pipx
pipx ensurepath

# Додати pipx до PATH
export PATH="$PATH:/root/.local/bin"
echo 'export PATH="$PATH:/root/.local/bin"' >> ~/.bashrc

# Встановити yt-dlp через pipx
echo "📥 Встановлення yt-dlp через pipx..."
pipx install yt-dlp

# Створити симлінк для глобального доступу
sudo ln -sf ~/.local/bin/yt-dlp /usr/local/bin/yt-dlp

# Перевірка
if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp встановлено: $(yt-dlp --version)"
    echo ""
    echo "🎉 Готово! Можете продовжити:"
    echo "   cd /home/discord_bot"
    echo "   npm install"
    echo "   npm run init-db"
    echo "   npm run pm2:start"
else
    echo "❌ Помилка встановлення"
    echo ""
    echo "Спробуйте альтернативний метод:"
    echo "sudo apt install -y python3-yt-dlp"
    exit 1
fi
