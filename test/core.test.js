'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core');
const base = 'https://api.example/';
const mp4 = 'https://cdn.example/movie.mp4';
const hls = 'https://cdn.example/movie.m3u8';
test('HTTPS validation rejects active content, credentials, mixed content and malformed URLs', () => {
    for (const url of ['javascript:alert(1)', 'http://localhost/file', 'https://u:p@example.com', 'https://example.com/#token', 'https://example.com/a b', 'https://example.com/\\evil', '']) {
        assert.throws(() => C.https(url));
    }
    assert.equal(C.https('/movie', base), 'https://api.example/movie');
    assert.throws(() => C.endpoint('https://example.com?token=secret'));
});
test('card queries preserve Unicode and IDs without query injection', () => {
    const url = new URL(C.lampacURL(base, 'rezka', { title: 'Тест & фильм', original_title: 'A+B', year: 2025, kinopoisk_id: 42, imdb_id: 'tt123', media_type: 'tv' }));
    assert.equal(url.pathname, '/lite/rezka');
    assert.equal(url.searchParams.get('title'), 'Тест & фильм');
    assert.equal(url.searchParams.get('serial'), '1');
    assert.equal(url.searchParams.get('kinopoisk_id'), '42');
    assert.equal(url.searchParams.get('rjson'), 'true');
    assert.throws(() => C.lampacURL(base, 'other', {}));
});
test('Lampac films, series, voices and search candidates follow their documented rjson shapes', () => {
    const movie = C.lampacPage({ type: 'movie', data: [{ method: 'play', translate: 'Дубляж', url: mp4, quality: { '720p': mp4, '1080p': hls } }] }, base);
    assert.equal(movie.items[0].title, 'Дубляж');
    assert.equal(movie.items[0].streams[0].quality, '1080p');
    const season = C.lampacPage({ type: 'season', voice: [{ name: 'Русский', active: true, url: '/lite/rezka?t=2' }], data: [{ name: 'Сезон 1', method: 'link', url: '/lite/rezka?s=1' }] }, base);
    assert.equal(season.voices[0].active, true);
    assert.equal(season.items[0].method, 'link');
    const ep = C.lampacPage({ type: 'episode', data: [{ method: 'call', url: '/lite/rezka/movie', s: 2, e: 3, name: '3 серия' }] }, base);
    assert.equal(ep.items[0].season, 2); assert.equal(ep.items[0].episode, 3);
    const similar = C.lampacPage({ type: 'similar', data: [{ title: 'Фильм', url: '/lite/filmix?postid=123', year: 2020 }] }, base);
    assert.equal(similar.items[0].method, 'link');
    assert.equal(C.lampacPage([], base).type, 'empty');
});
test('untrusted API cannot send credentialed requests to an unrelated origin', () => {
    for (const url of ['https://evil.example/leak', '//evil.example/leak', 'http://api.example/leak']) {
        assert.throws(() => C.lampacPage({ type: 'season', data: [{ method: 'link', url }] }, base));
    }
    assert.equal(C.apiLink('/lite/filmix?t=1', base), 'https://api.example/lite/filmix?t=1');
});
test('access errors, incompatible shapes, DRM, headers and unsafe streams are refused', () => {
    for (const json of [{ error: 'login' }, { auth: true }, '<html>Login</html>', { type: 'movie', data: null }]) assert.throws(() => C.lampacPage(json, base));
    for (const item of [{ url: mp4, drm: true }, { url: mp4, headers: { Cookie: 'secret' } }, { url: 'javascript:foo' }, { streams: [{ url: mp4, drm: true }] }, { streams: [{ url: mp4, format: 'dash' }] }]) assert.throws(() => C.streams(item, base));
});
test('catalog search handles Cyrillic, ё/е and all words; episodes are sorted numerically', () => {
    const items = C.catalog({ version: 1, items: [{ id: '1', title: 'Ёлки', original_title: 'Yolki', year: 2020, voices: [{ name: 'Русский', language: 'ru', seasons: [{ number: 2, episodes: [{ number: 10, streams: [{ url: mp4 }] }, { number: 2, streams: [{ url: mp4 }] }] }] }] }] }, base);
    assert.equal(C.search(items, 'елки 2020').length, 1);
    assert.equal(C.search(items, 'елки 2024').length, 0);
    assert.equal(items[0].voices[0].seasons[0].episodes[0].number, 2);
    assert.throws(() => C.catalog({ version: 2, items: [] }, base));
});
test('fallback retries availability errors and stops on authorization or malformed data', async () => {
    for (const status of [401, 403, 429, 404]) {
        const tried = [];
        await new Promise(resolve => C.fallback(['a', 'b'], (host, cb) => { tried.push(host); cb({ status }); }, error => { assert.equal(error.status, status); resolve(); }));
        assert.deepEqual(tried, ['a']);
    }
    const tried = [];
    await new Promise(resolve => C.fallback(['a', 'b'], (host, cb) => { tried.push(host); cb(host === 'a' ? { status: 503 } : null, 'ok'); }, (err, data, host) => {
        assert.equal(err, null); assert.equal(data, 'ok'); assert.equal(host, 'b'); resolve();
    }));
    assert.deepEqual(tried, ['a', 'b']);
});
test('cancelling a request chain suppresses late results and backup requests', () => {
    let cb, cancelled = false, completed = false;
    const stop = C.fallback(['a', 'b'], (_, callback) => { cb = callback; return () => { cancelled = true; }; }, () => { completed = true; });
    stop(); cb({ code: 'timeout' }); assert.equal(cancelled, true); assert.equal(completed, false);
});
test('quality preference and finite same-quality stream fallback', () => {
    const list = C.streams({ streams: [{ quality: '1080p', url: mp4, backups: ['https://reserve.example/movie.mp4'] }, { quality: '720p', url: hls }] }, base);
    assert.equal(C.selectStream(list, '720p').url, hls);
    const data = C.playerData('Фильм', list, list[0], () => {});
    const resumed = [];
    data.error(data, u => resumed.push(u)); data.error(data, u => resumed.push(u));
    assert.deepEqual(resumed, ['https://reserve.example/movie.mp4']);
    assert.equal(data.quality['1080p'], mp4);
});
test('UI escaping never renders provider HTML', () => {
    assert.equal(C.escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
