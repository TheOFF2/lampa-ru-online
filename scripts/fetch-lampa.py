"""Download only runtime assets into ignored .cache for the browser test. No source is shipped."""
import pathlib
import urllib.request

REVISION = '35d79e5e1f256a19862f8cb8dbb79298e5930531'
root = pathlib.Path(__file__).resolve().parents[1] / '.cache/lampa'
files = ['index.html', 'app.min.js', 'css/app.css', 'vender/jquery/jquery.js',
         'vender/navigator/navigator.js', 'vender/keypad/keypad.js', 'vender/keypad/style.css',
         'vender/scrollbar/jquery.scrollbar.js', 'vender/scrollbar/jquery.scrollbar.css',
         'vender/notify/notify.js', 'vender/hls/hls.js']
for name in files:
    path = root / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/yumata/lampa/' + REVISION + '/' + name, timeout=30).read())
print('Lampa runtime cached at ' + str(root) + ' @ ' + REVISION)
