import sys
import json
import yt_dlp
import os

def get_audio(query):
    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'default_search': 'ytsearch',
        'noprogress': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': 'downloads/%(id)s.%(ext)s',
        'logger': None,
    }

    os.makedirs('downloads', exist_ok=True)

    # Подавляем весь вывод
    class QuietLogger:
        def debug(self, msg): pass
        def warning(self, msg): pass
        def error(self, msg): pass

    ydl_opts['logger'] = QuietLogger()

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            if not query.startswith('http'):
                query = f'ytsearch:{query}'
            
            info = ydl.extract_info(query, download=True)
            
            if 'entries' in info:
                info = info['entries'][0]
            
            file_path = f"downloads/{info['id']}.mp3"
            
            result = {
                'success': True,
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'url': info.get('webpage_url', ''),
                'file': file_path,
                'author': info.get('uploader', 'Unknown')
            }
            
            print(json.dumps(result))
            
        except Exception as e:
            print(json.dumps({
                'success': False,
                'error': str(e)
            }))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        query = ' '.join(sys.argv[1:])
        get_audio(query)
    else:
        print(json.dumps({'success': False, 'error': 'No query provided'}))