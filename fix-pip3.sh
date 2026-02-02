#!/bin/bash

# Швидке виправлення для pip3
echo "🔧 Виправлення pip3..."

# Встановлення pip3
sudo apt update
sudo apt install -y python3-pip python3-venv

# Якщо не спрацювало, альтернативний метод
if ! command -v pip3 &> /dev/null; then
    echo "📥 Використовую альтернативний метод..."
    curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
    sudo python3 get-pip.py
    rm get-pip.py
fi

# Перевірка
if command -v pip3 &> /dev/null; then
    echo "✅ pip3 встановлено: $(pip3 --version)"

    # Встановлення yt-dlp
    echo "📥 Встановлення yt-dlp..."
    pip3 install --upgrade yt-dlp

    echo "✅ yt-dlp встановлено: $(yt-dlp --version)"
    echo ""
    echo "🎉 Готово! Тепер можете продовжити:"
    echo "   cd /home/discord_bot"
    echo "   sudo ./setup-vps.sh"
else
    echo "❌ Помилка встановлення pip3"
    exit 1
fi
