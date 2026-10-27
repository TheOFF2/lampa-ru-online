'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../src/core');
function app(values = {}) {
    const state = { values, requests: [], events: {}, played: [], registrations: 0 };
    const empty = { length: 0, first() { return this; } };
    const L = {
        Storage: { get: (key, fallback) => key in values ? values[key] : fallback, set: (key, value) => { values[key] = value; } },
        Controller: { enabled: () => ({ name: 'content' }), toggle: name => { state.controller = name; } },
        Select: { show: options => { state.select = options; }, closeAll: () => { state.select = null; } },
        Input: { edit: (options, done) => { state.input = { options, done }; } },
        Listener: { follow: (name, fn) => { state.events[name] = fn; } },
        Noty: { show: value => { state.notice = value; } },
        Player: { play: data => state.played.push(data), callback: fn => { state.playerBack = fn; }, playlist: list => { state.playlist = list; } },
        SettingsApi: { addComponent: () => state.registrations++, addParam: param => { state.settingParam = param; } }
    };
    function XHR() { state.requests.push(this); }
    Object.assign(XHR.prototype, { open(method, url) { this.url = url; }, setRequestHeader() {}, send() {}, abort() { this.aborted = true; },
        respond(data, status = 200) { this.status = status; this.responseText = typeof data === 'string' ? data : JSON.stringify(data); this.onload(); } });
    const window = { RUOnlineCore: C, Lampa: L, jQuery: () => empty, appready: true };
    const context = vm.createContext({ window, XMLHttpRequest: XHR, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {} });
    const code = fs.readFileSync('src/plugin.js', 'utf8');
    vm.runInContext(code, context);
    state.reload = () => vm.runInContext(code, context);
    state.open = window.RUOnline.open;
    state.choose = title => {
        const item = state.select.items.find(row => row.title.includes(title)); assert.ok(item, 'Missing option: ' + title);
        state.select.onSelect(item);
    };
    return state;
}
test('startup is idempotent and keyboard cancel retains the menu', () => {
    const a = app(); a.reload(); assert.equal(a.registrations, 1);
    a.open(); const old = a.select; a.choose('Найти фильм');
    assert.equal(a.select, old); assert.equal(a.select.nohide, true);
    a.input.done('Тест & сериал'); assert.ok(a.select.title.includes('Тест & сериал'));
});
test('invalid endpoint never replaces settings or makes a request', () => {
    const a = app(); a.open(); a.choose('Настройки источников'); a.choose('Rezka — API сервер');
    a.input.done('http://bad.example');
    assert.equal(a.values.ru_online_rezka, undefined); assert.equal(a.requests.length, 0);
    assert.match(a.select.title, /HTTPS/);
});
test('API availability failure uses backup; 403 never does', () => {
    const values = { ru_online_rezka: 'https://primary.example', ru_online_rezka_backup: 'https://backup.example' };
    const a = app(values); a.open({ title: 'Тест' }); a.choose('Rezka');
    a.requests[0].respond({}, 503); assert.equal(a.requests.length, 2);
    assert.ok(a.requests[1].url.startsWith('https://backup.example/'));
    a.requests[1].respond([], 200); assert.match(a.select.title, /Нет доступных результатов/);
    const b = app(values); b.open({ title: 'Тест' }); b.choose('Rezka'); b.requests[0].respond({}, 403);
    assert.equal(b.requests.length, 1); assert.match(b.select.title, /Доступ не разрешён/);
});
test('Back aborts in-flight requests; late callbacks cannot reopen abandoned screens', () => {
    const a = app({ ru_online_rezka: 'https://api.example' });
    a.open({ title: 'Тест' }); a.choose('Rezka'); const xhr = a.requests[0];
    a.select.onBack(); const screen = a.select;
    assert.equal(xhr.aborted, true); xhr.respond({ type: 'season', data: [] });
    assert.equal(a.select, screen);
});
test('deferred Lampac call opens player and sets return callback and isolated playlist', () => {
    const a = app({ ru_online_rezka: 'https://api.example' });
    a.open({ title: 'Тест', media_type: 'tv' }); a.choose('Rezka');
    a.requests[0].respond({ type: 'episode', data: [{ name: '1 серия', method: 'call', url: '/lite/rezka/movie' }] });
    a.choose('1 серия'); a.requests[1].respond({ method: 'play', title: 'Тест', url: 'https://cdn.example/movie.mp4', quality: { '720p': 'https://cdn.example/movie.mp4' } });
    a.choose('720p · MP4'); assert.equal(a.played.length, 1); assert.equal(a.playlist.length, 1);
    a.playerBack(); assert.match(a.select.title, /качество/);
});
test('catalog responses containing active markup stay escaped in the menu', () => {
    const a = app(); a.open(); a.choose('Открытый тестовый каталог');
    a.requests[0].respond({ version: 1, items: [{ id: 'x', title: '<script>alert(1)</script>', voices: [] }] });
    assert.equal(a.select.items[0].title, '&lt;script&gt;alert(1)&lt;/script&gt;');
});
