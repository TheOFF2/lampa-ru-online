"""Check published demo URLs, HLS variant and one media segment; never probe user accounts."""
import argparse
import datetime
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--output', help='Write a JSON evidence report')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'public/catalog.json').read_text())


def read(url, limit=65536):
    request = urllib.request.Request(url, headers={'Range': 'bytes=0-' + str(limit - 1)})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status, response.headers.get('Content-Type'), response.read(limit)


results = []
for movie in catalog['items']:
    for voice in movie['voices']:
        for stream in voice['streams']:
            for url in [stream['url']] + stream.get('backups', []):
                record = {'title': movie['title'], 'url': url, 'format': stream['format']}
                try:
                    status, content_type, body = read(url)
                    record.update(status=status, content_type=content_type)
                    if stream['format'] == 'mp4':
                        if body[4:8] != b'ftyp':
                            raise ValueError('MP4 ftyp signature missing')
                        record['verified'] = 'MP4 signature and HTTPS response (not playback)'
                    else:
                        if not body.startswith(b'#EXTM3U'):
                            raise ValueError('HLS signature missing')
                        playlist = body.decode()
                        variant = next(line for line in playlist.splitlines() if line and not line.startswith('#'))
                        variant_url = urllib.parse.urljoin(url, variant)
                        _, _, variant_body = read(variant_url)
                        if '#EXT-X-STREAM-INF' in playlist:
                            media = variant_body.decode()
                            if not media.startswith('#EXTM3U'):
                                raise ValueError('Invalid media playlist')
                            segment = next(line for line in media.splitlines() if line and not line.startswith('#'))
                            segment_url = urllib.parse.urljoin(variant_url, segment)
                            seg_status, seg_type, seg = read(segment_url, 188 * 4)
                            if seg[0] != 0x47 or seg[188] != 0x47:
                                raise ValueError('MPEG-TS sync bytes missing')
                            record.update(variant_url=variant_url, segment_status=seg_status, segment_type=seg_type)
                        record['verified'] = 'HLS master + media playlist + MPEG-TS segment (not playback)'
                    record['ok'] = True
                except (ValueError, OSError, urllib.error.URLError) as error:
                    record.update(ok=False, error=str(error))
                results.append(record)
report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': results,
          'rezka': 'not live tested: no permitted endpoint or account supplied',
          'filmix': 'not live tested: no permitted endpoint or account supplied',
          'android_tv': 'not hardware tested'}
if args.output:
    pathlib.Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(result['ok'] for result in results) else 1)
