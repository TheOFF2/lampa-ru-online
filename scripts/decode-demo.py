"""Optional software-decoding smoke. Requires ffmpeg/ffprobe, no Android device."""
import datetime
import json
import pathlib
import subprocess
import urllib.parse
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
cache = root / '.cache'
cache.mkdir(exist_ok=True)


def download(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(16 * 1024 * 1024 + 1)
        if len(data) > 16 * 1024 * 1024:
            raise ValueError('Sample too large')
        return data


mp4 = 'https://media.w3.org/2010/05/sintel/trailer.mp4'
hls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
master = download(hls).decode()
variant = urllib.parse.urljoin(hls, next(line for line in master.splitlines() if line and not line.startswith('#')))
playlist = download(variant).decode()
segment = urllib.parse.urljoin(variant, next(line for line in playlist.splitlines() if line and not line.startswith('#')))
results = []
for name, url in [('sintel.mp4', mp4), ('bunny-segment.ts', segment)]:
    path = cache / name
    data = download(url)
    path.write_bytes(data)
    meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height', '-of', 'json', str(path)]))
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-t', '1', '-f', 'null', '-'], check=True, timeout=30)
    results.append({'sample': name, 'url': url, 'bytes': len(data), 'streams': meta['streams'], 'decoded_seconds': 1, 'ok': True})
report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'decoder': subprocess.check_output(['ffmpeg', '-version']).decode().splitlines()[0],
          'checks': results, 'limitation': 'Software decoder only. Not physical Android TV, projector or Lampa player playback.'}
(root / 'docs/media-decode.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
