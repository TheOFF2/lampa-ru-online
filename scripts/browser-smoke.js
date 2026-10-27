/* Tests the real, unmodified Lampa browser runtime with fixture provider responses. */
'use strict';
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const runtime = process.env.LAMPA_RUNTIME_DIR || path.resolve('.cache/lampa');
const output = path.resolve('test-results');
const root = path.resolve('public');
fs.mkdirSync(output, { recursive: true });
if (!fs.existsSync(path.join(runtime, 'app.min.js'))) throw Error('Run python3 scripts/fetch-lampa.py first');
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/plugin/') ? root : runtime;
    const file = path.resolve(base, '.' + (pathname.startsWith('/plugin/') ? pathname.slice(7) : pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('missing'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const fixtureCatalog = { version: 1, items: [{ id: 'series', title: 'Тестовый сериал', year: 2026, voices: [
    { name: 'Дубляж', language: 'ru', seasons: [{ number: 1, episodes: [{ number: 1, title: 'Начало', streams: [
        { quality: '1080p', url: 'https://media.example/episode.mp4', backups: ['https://media.example/reserve.mp4'] },
        { quality: '720p', url: 'https://media.example/episode.m3u8', format: 'hls' }
    ] }] }] }
] }] };
async function main() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (process.env.DEBUG_BROWSER) console.log(m.text()); });
        await page.addInitScript(() => {
            localStorage.setItem('language', 'ru'); localStorage.setItem('plugins', '[]');
            localStorage.setItem('source', 'tmdb'); localStorage.setItem('ru_online_rezka', 'https://api.example');
        });
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname === '127.0.0.1') return route.continue();
            if (url.hostname === 'theoff2.github.io') return route.fulfill({ json: JSON.parse(fs.readFileSync('public/catalog.json', 'utf8')), headers: { 'Access-Control-Allow-Origin': '*' } });
            if (url.hostname === 'catalog.example') return route.fulfill({ json: fixtureCatalog, headers: { 'Access-Control-Allow-Origin': '*' } });
            if (url.hostname === 'api.example') {
                requests.push(url.href);
                if (url.pathname === '/lite/filmix') return route.fulfill({ json: { type: 'movie', data: [
                    { translate: 'Дубляж', method: 'play', url: 'https://media.example/filmix.mp4', quality: { '1080p': 'https://media.example/filmix.mp4' } }
                ] }, headers: { 'Access-Control-Allow-Origin': '*' } });
                const data = url.pathname.endsWith('/movie') ? { method: 'play', url: 'https://media.example/rezka.mp4', quality: { '720p': 'https://media.example/rezka.mp4' }, title: 'Тест' } :
                    url.searchParams.get('s') ? { type: 'episode', data: [{ method: 'call', name: '1 серия', s: 1, e: 1, url: '/lite/rezka/movie' }] } :
                    { type: 'season', voice: [{ name: 'Русский дубляж', active: true, url: '/lite/rezka?s=1&t=1' }], data: [{ name: '1 сезон', method: 'link', url: '/lite/rezka?s=1' }] };
                return route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } });
            }
            /* Catalog/metadata services are deliberately offline in this reproducible UI test. */
            return route.abort('failed');
        });
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => window.appready && window.Lampa, null, { timeout: 45000 });
        await page.waitForTimeout(1500); // Let Lampa's own welcome animation finish.
        await page.addScriptTag({ url: `http://127.0.0.1:${port}/plugin/ru-online.js` });
        await page.waitForSelector('.ru-online-menu', { state: 'attached' });
        await page.evaluate(() => {
            window.__played = [];
            Lampa.Player.play = data => { window.__played.push({ url: data.url, quality: data.quality, title: data.title }); window.__playData = data; };
            Lampa.Player.playlist = data => { window.__playlist = data; };
            Lampa.Player.callback = callback => { window.__playerBack = callback; };
            RUOnline.open();
        });
        const title = () => page.locator('.selectbox__title').innerText();
        async function select(text) {
            console.log('Select:', text);
            try { await page.waitForFunction(value => Array.from(document.querySelectorAll('.selectbox-item')).some(node => node.textContent.includes(value)), text, { timeout: 5000 }); } catch (error) {
                console.error('Current select:', await page.locator('.selectbox').innerText());
                await page.screenshot({ path: path.join(output, 'failure.png') }); throw error;
            }
            await page.evaluate(value => {
                const node = Array.from(document.querySelectorAll('.selectbox-item')).find(item => item.textContent.includes(value));
                window.jQuery(node).trigger('hover:enter');
            }, text);
        }
        assert.match(await title(), /Lampa RU Online/);
        // Exercise actual D-pad Down and Back through Lampa's controller.
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('найдено: 2'));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent === 'Lampa RU Online');
        await select('Найти фильм');
        await page.keyboard.press('Escape');
        assert.match(await title(), /Lampa RU Online/);
        await select('Открытый тестовый каталог');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('найдено: 2'));
        await select('Синтел'); await select('Оригинал');
        await select('480p · MP4');
        assert.equal(await page.evaluate(() => __played.at(-1).url), 'https://media.w3.org/2010/05/sintel/trailer.mp4');
        await page.evaluate(() => __playerBack());
        assert.match(await title(), /качество/);
        // A serial catalog checks the complete translation → season → episode → rendition flow.
        await page.evaluate(() => { Lampa.Storage.set('ru_online_catalog', 'https://catalog.example/catalog.json'); RUOnline.open(); });
        await select('Мой каталог');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('найдено: 1'));
        await select('Тестовый сериал'); await select('Дубляж'); await select('Сезон 1'); await select('Начало'); await select('720p · HLS');
        assert.equal(await page.evaluate(() => __played.at(-1).url), 'https://media.example/episode.m3u8');
        await page.evaluate(() => __playerBack());
        // Fixture Lampac rjson traversal exercises link, voice and deferred call responses.
        await page.evaluate(() => RUOnline.open({ title: 'Тест', media_type: 'tv' }));
        await select('Rezka');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('Сезоны'));
        await select('1 сезон');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('Серии'));
        await select('1 серия');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('качество'));
        await select('720p · MP4');
        assert.equal(await page.evaluate(() => __played.at(-1).url), 'https://media.example/rezka.mp4');
        assert.equal(requests.length, 3);
        await page.evaluate(() => __playerBack());
        await page.evaluate(() => { Lampa.Storage.set('ru_online_filmix', 'https://api.example'); RUOnline.open({ title: 'Фильм', media_type: 'movie' }); });
        await select('Filmix');
        await page.waitForFunction(() => document.querySelector('.selectbox__title').textContent.includes('Озвучки'));
        await select('Дубляж'); await select('1080p · MP4');
        assert.equal(await page.evaluate(() => __played.at(-1).url), 'https://media.example/filmix.mp4');
        await page.evaluate(() => __playerBack());
        await page.screenshot({ path: path.join(output, 'lampa-quality-1080p.png') });
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.screenshot({ path: path.join(output, 'lampa-quality-720p.png') });
        await page.evaluate(() => { RUOnline.open(); RUOnline.open(); });
        assert.equal(await page.locator('.ru-online-menu').count(), 1);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ ok: true, checked_at: new Date().toISOString(), runtime: 'yumata/lampa@35d79e5e1f256a19862f8cb8dbb79298e5930531',
            tested: ['real Lampa Select/controller', 'public catalog fixtures', 'season and episode selection', 'Russian voice fixture', 'MP4/HLS player contract', 'Lampac link/call rjson fixtures', 'player return', '1280x720 and 1920x1080 layouts'],
            limitations: ['Player launches intercepted; no video decoding in this UI suite', 'No live Rezka/Filmix account or API', 'No physical Android TV or projector'], errors }, null, 2));
        console.log('Real Lampa browser smoke passed; screenshots and report in test-results/');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
