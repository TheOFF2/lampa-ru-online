/*! Lampa RU Online v1.0.0 | MIT | https://github.com/TheOFF2/lampa-ru-online */
/* SPDX-License-Identifier: MIT */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RUOnlineCore = factory();
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var VERSION = '1.0.0';
    var PROVIDERS = { rezka: 'Rezka', filmix: 'Filmix' };
    function fail(message, code) {
        var e = new Error(message); e.code = code || 'data'; return e;
    }
    function text(value) { return String(value === undefined || value === null ? '' : value); }
    function escape(value) {
        return text(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function https(value, base) {
        if (typeof value !== 'string' || !value || /[\s\\\u0000-\u001f]/.test(value)) throw fail('Нужен корректный HTTPS-адрес', 'url');
        var url;
        try { url = base ? new URL(value, base) : new URL(value); } catch (e) { throw fail('Некорректный адрес', 'url'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw fail('Разрешён HTTPS без пароля в адресе и без #', 'url');
        return url.href;
    }
    function origin(value) { return new URL(https(value)).origin; }
    function endpoint(value) {
        var url = new URL(https(value));
        if (url.search) throw fail('Адрес сервера должен быть без параметров. Вход выполните у его владельца.', 'url');
        return url.href.replace(/\/+$/, '');
    }
    function query(url, params) {
        var u = new URL(https(url));
        Object.keys(params).forEach(function (key) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') u.searchParams.set(key, text(params[key]));
        });
        return u.href;
    }
    function lampacURL(base, provider, card) {
        if (!PROVIDERS[provider]) throw fail('Неизвестный источник');
        return query(endpoint(base) + '/lite/' + provider, {
            title: card.title || card.name,
            original_title: card.original_title || card.original_name,
            year: card.year || text(card.release_date || card.first_air_date).slice(0, 4),
            kinopoisk_id: card.kinopoisk_id,
            imdb_id: card.imdb_id,
            serial: card.media_type === 'tv' || card.first_air_date ? 1 : (card.media_type === 'movie' || card.release_date ? 0 : -1),
            clarification: 1, rjson: true
        });
    }
    function apiLink(value, base) {
        var url = https(value, base);
        if (origin(url) !== origin(base)) throw fail('API-ссылка ведёт на другой сервер. Запрос остановлен.', 'origin');
        return url;
    }
    function number(value) { var n = parseInt(text(value), 10); return isFinite(n) && n >= 0 ? n : 0; }
    function rank(value) {
        var label = text(value), match = label.match(/\b(\d{3,4})\s*p?\b/i);
        return /\b4k\b/i.test(label) ? 2160 : (match ? number(match[1]) : 0);
    }
    function streams(item, base) {
        if (item.drm || item.license || item.license_url) throw fail('DRM-потоки не поддерживаются', 'drm');
        if (item.headers && Object.keys(item.headers).length) throw fail('Поток требует HTTP-заголовков. Нужна совместимая ссылка от владельца API.', 'headers');
        var list = [], seen = {};
        function add(url, label, format) {
            url = https(url, base);
            if (!seen[url]) { seen[url] = true; list.push({ url: url, quality: text(label || 'Авто'), format: format || (/\.m3u8(?:\?|$)/i.test(url) ? 'hls' : 'mp4') }); }
        }
        if (Array.isArray(item.streams)) {
            item.streams.forEach(function (s) {
                if (!s || s.drm || s.license || s.license_url) throw fail('DRM-потоки не поддерживаются', 'drm');
                if (s.format && s.format !== 'mp4' && s.format !== 'hls') throw fail('Поддерживаются MP4 и HLS');
                add(s.url, s.quality, s.format);
                (s.backups || []).forEach(function (u) { add(u, s.quality, s.format); });
            });
        } else {
            if (item.quality && typeof item.quality === 'object') Object.keys(item.quality).forEach(function (k) { add(item.quality[k], k); });
            if (item.url) add(item.url, item.maxquality || (list.length ? 'Авто' : 'Исходное'));
            if (item.url_reserve) add(item.url_reserve, item.maxquality || 'Резерв');
        }
        if (!list.length) throw fail('Источник не вернул MP4/HLS');
        return list.sort(function (a, b) { return rank(b.quality) - rank(a.quality); });
    }
    function lampacPage(json, base) {
        if (!json || typeof json !== 'object') throw fail('API вернул не JSON');
        if (json.error || json.accsdb || json.auth || json.login) throw fail('Источник требует входа или не разрешил доступ', 'access');
        if (Array.isArray(json) && !json.length) return { type: 'empty', items: [], voices: [] };
        if (['movie', 'episode', 'season', 'similar'].indexOf(json.type) === -1 || !Array.isArray(json.data)) throw fail('Несовместимый JSON API. Нужен Lampac rjson.', 'schema');
        function entry(item, voice) {
            if (!item || typeof item !== 'object') throw fail('Некорректный элемент API');
            var method = item.method || (json.type === 'similar' || voice ? 'link' : 'play');
            if (['link', 'play', 'call'].indexOf(method) === -1) throw fail('Неподдерживаемый метод API');
            var out = { title: text(item.name || item.translate || item.title || 'Открыть'), method: method,
                season: number(item.s), episode: number(item.e), active: !!item.active,
                subtitle: text(item.year || item.details || ''), raw: item };
            if (method === 'link' || method === 'call') out.url = apiLink(item.url, base);
            else out.streams = streams(item, base);
            return out;
        }
        return { type: json.type, items: json.data.map(function (x) { return entry(x, false); }),
            voices: (Array.isArray(json.voice) ? json.voice : []).map(function (x) { return entry(x, true); }) };
    }
    function catalog(json, base) {
        if (!json || json.version !== 1 || !Array.isArray(json.items) || json.items.length > 5000) throw fail('Нужен каталог version: 1 с массивом items (до 5000)', 'schema');
        return json.items.map(function (item) {
            if (!item || !item.id || !item.title || !Array.isArray(item.voices)) throw fail('У фильма нужны id, title и voices', 'schema');
            return { id: text(item.id), title: text(item.title), original_title: text(item.original_title), year: number(item.year),
                attribution: text(item.attribution), voices: item.voices.map(function (voice) {
                    if (!voice || !voice.name) throw fail('У озвучки нужно name');
                    var out = { name: text(voice.name), language: text(voice.language || 'und'), seasons: [] };
                    if (Array.isArray(voice.seasons)) out.seasons = voice.seasons.map(function (season) {
                        if (!Array.isArray(season.episodes)) throw fail('У сезона нужен episodes');
                        return { number: number(season.number), episodes: season.episodes.map(function (episode) {
                            return { number: number(episode.number), title: text(episode.title || (episode.number + ' серия')), streams: streams(episode, base) };
                        }).sort(function (a, b) { return a.number - b.number; }) };
                    }).sort(function (a, b) { return a.number - b.number; });
                    else out.streams = streams(voice, base);
                    return out;
                }) };
        });
    }
    function search(items, term) {
        var words = text(term).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
        return items.filter(function (item) {
            var haystack = (item.title + ' ' + item.original_title + ' ' + item.year).toLowerCase().replace(/ё/g, 'е');
            return words.every(function (w) { return haystack.indexOf(w) !== -1; });
        });
    }
    function retryable(error) { return error && (error.code === 'network' || error.code === 'timeout' || error.status >= 500); }
    /* Only an unavailable server can trigger a backup. Access denials never do. */
    function fallback(bases, run, done) {
        var index = 0, stopped = false, cancel, last;
        function next() {
            if (stopped) return;
            if (index >= bases.length) return done(last || fail('Сервер не настроен', 'config'));
            var base = bases[index++];
            cancel = run(base, function (error, result) {
                if (stopped) return;
                if (!error) { stopped = true; return done(null, result, base); }
                last = error;
                if (retryable(error)) next();
                else { stopped = true; done(error); }
            });
        }
        next();
        return function () { stopped = true; if (cancel) cancel(); };
    }
    function selectStream(list, preference) {
        var limit = rank(preference);
        if (!limit) return list[0];
        return list.filter(function (s) { return rank(s.quality) && rank(s.quality) <= limit; })[0] || list[list.length - 1];
    }
    function playerData(title, list, selected, onBack) {
        var used = {}, quality = {};
        used[selected.url] = true;
        list.forEach(function (s) { if (!Object.prototype.hasOwnProperty.call(quality, s.quality)) Object.defineProperty(quality, s.quality, { value: s.url, enumerable: true }); });
        return { title: title, url: selected.url, quality: quality, onBack: onBack,
            error: function (work, resume) {
                /* Stay in the chosen rendition; offer other qualities manually. */
                var next = list.filter(function (s) { return s.quality === selected.quality && !used[s.url]; })[0];
                if (next) { used[next.url] = true; resume(next.url); }
            } };
    }
    return { VERSION: VERSION, PROVIDERS: PROVIDERS, fail: fail, text: text, escape: escape, https: https, endpoint: endpoint,
        query: query, lampacURL: lampacURL, apiLink: apiLink, streams: streams, lampacPage: lampacPage,
        catalog: catalog, search: search, fallback: fallback, retryable: retryable, selectStream: selectStream, playerData: playerData };
}));

/* SPDX-License-Identifier: MIT */
(function (window) {
    'use strict';
    if (window.RUOnline) return;
    var C = window.RUOnlineCore, L, $, started = false, closing = false, generation = 0, cancelPending;
    var originalController = 'content', memory = {}, lastQuery = '';
    var HOME = 'https://theoff2.github.io/lampa-ru-online/';
    var defaults = { rezka: '', rezka_backup: '', filmix: '', filmix_backup: '', catalog: '', quality: 'auto', voice: '', cookies: false };
    function get(key) { return L.Storage.get('ru_online_' + key, defaults[key]); }
    function set(key, value) { L.Storage.set('ru_online_' + key, value); memory = {}; }
    function notify(message) { L.Noty.show(C.escape(message)); }
    function stop() { generation++; if (cancelPending) cancelPending(); cancelPending = null; }
    function close() {
        closing = true;
        try { if (L.Select.closeAll) L.Select.closeAll(); else L.Select.close(); } finally { closing = false; }
    }
    function restore() { stop(); close(); L.Controller.toggle(originalController); }
    function row(title, action, subtitle) { return { title: C.escape(title), subtitle: C.escape(subtitle || ''), action: action }; }
    function show(title, items, back) {
        stop(); close();
        L.Select.show({ title: title, nohide: true, items: items.length ? items : [row('Ничего не найдено', back)],
            onSelect: function (item) { if (item.action) item.action(); },
            onBack: function () { if (!closing) { stop(); (back || restore)(); } } });
    }
    function errorView(error, back) {
        var messages = { access: 'Доступ не разрешён. Выполните вход или уточните права у владельца источника.',
            network: 'Сервер недоступен или не разрешает CORS для Lampa.', timeout: 'Сервер не ответил за 15 секунд.' };
        show('RU Online — ' + (messages[error.code] || error.message), [row('Назад', back), row('Настройки источников', function () { settings(back); })], back);
    }
    function request(url, callback) {
        var xhr = new XMLHttpRequest(), done = false;
        function finish(error, data) { if (!done) { done = true; callback(error, data); } }
        try {
            url = C.https(url);
            xhr.open('GET', url, true); xhr.timeout = 15000;
            /* Opt-in cookies are restricted to user-configured API servers. */
            var allowed = ['rezka', 'rezka_backup', 'filmix', 'filmix_backup'].some(function (key) {
                try { return get(key) && new URL(C.endpoint(get(key))).origin === new URL(url).origin; } catch (e) { return false; }
            });
            xhr.withCredentials = !!get('cookies') && allowed;
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.onload = function () {
                if (xhr.status < 200 || xhr.status >= 300) {
                    var e = C.fail('HTTP ' + xhr.status, [401, 403, 429].indexOf(xhr.status) !== -1 ? 'access' : 'http'); e.status = xhr.status; return finish(e);
                }
                if (xhr.responseText.length > 4 * 1024 * 1024) return finish(C.fail('Ответ API больше 4 МБ'));
                try { finish(null, JSON.parse(xhr.responseText)); } catch (e) { finish(C.fail('Источник вернул HTML или некорректный JSON. Проверьте вход и поддержку rjson.', 'schema')); }
            };
            xhr.onerror = function () { finish(C.fail('Ошибка сети', 'network')); };
            xhr.ontimeout = function () { finish(C.fail('Истекло время ожидания', 'timeout')); };
            xhr.onprogress = function (event) { if (event.loaded > 4 * 1024 * 1024) { finish(C.fail('Ответ API больше 4 МБ')); xhr.abort(); } };
            xhr.send();
        } catch (e) { setTimeout(function () { finish(e); }, 0); }
        return function () { done = true; xhr.abort(); };
    }
    function load(title, task, next, back) {
        show(title + ' — загрузка…', [row('Отмена', back)], back);
        var ticket = generation;
        cancelPending = task(function (error, data, base) {
            if (ticket !== generation) return;
            cancelPending = null;
            if (error) return errorView(error, back);
            try { next(data, base); } catch (e) { errorView(e, back); }
        });
    }
    function cachedCatalog(url, done) {
        var saved = memory[url];
        if (saved && Date.now() - saved.time < 300000) {
            var timer = setTimeout(function () { done(null, saved.items); }, 0);
            return function () { clearTimeout(timer); };
        }
        return request(url, function (error, json) {
            if (error) return done(error);
            try { var items = C.catalog(json, url); memory[url] = { time: Date.now(), items: items }; done(null, items); }
            catch (e) { done(e); }
        });
    }
    function browseCatalog(url, term, back) {
        load('Поиск в каталоге', function (done) { return cachedCatalog(url, done); }, function (items) {
            var found = C.search(items, term);
            function results() {
                show('RU Online — найдено: ' + found.length, found.slice(0, 200).map(function (item) {
                    return row(item.title + (item.year ? ' (' + item.year + ')' : ''), function () { voices(item, results); }, item.attribution);
                }), back);
            }
            results();
        }, back);
    }
    function orderedVoices(list, nameKey) {
        var preferred = C.text(get('voice')).toLowerCase();
        if (!preferred) return list;
        return list.slice().sort(function (a, b) {
            return (C.text(b[nameKey]).toLowerCase().indexOf(preferred) !== -1 ? 1 : 0) - (C.text(a[nameKey]).toLowerCase().indexOf(preferred) !== -1 ? 1 : 0);
        });
    }
    function voices(item, back) {
        function current() { voices(item, back); }
        show(item.title + ' — озвучка', orderedVoices(item.voices, 'name').map(function (v) {
            return row(v.name, function () {
                if (!v.seasons.length) return qualities(item.title + ' · ' + v.name, v.streams, current);
                function seasons() {
                    show(item.title + ' — сезоны', v.seasons.map(function (s) {
                        return row('Сезон ' + s.number, function () {
                            function episodes() {
                                show('Сезон ' + s.number + ' · ' + v.name, s.episodes.map(function (e) {
                                    return row(e.number + '. ' + e.title, function () { qualities(item.title + ' · S' + s.number + 'E' + e.number + ' · ' + v.name, e.streams, episodes); });
                                }), seasons);
                            }
                            episodes();
                        });
                    }), current);
                }
                seasons();
            }, v.language === 'ru' ? 'Русский' : (v.language === 'und' ? 'Язык не указан' : v.language));
        }), back);
    }
    function qualities(title, list, back) {
        var preferred = C.selectStream(list, get('quality'));
        var items = [row('Смотреть · ' + preferred.quality, function () { play(title, list, preferred, current); })];
        var seen = {};
        function current() { qualities(title, list, back); }
        list.forEach(function (s) {
            var key = s.quality + ' ' + s.format;
            if (seen[key]) return;
            seen[key] = true;
            items.push(row(s.quality + ' · ' + s.format.toUpperCase(), function () { play(title, list, s, current); }));
        });
        if (list.length > 1) items.push(row('Резервные ссылки', function () {
            show('Выберите ссылку', list.map(function (s, index) {
                return row((index + 1) + '. ' + s.quality + ' · ' + s.format.toUpperCase(), function () { play(title, list, s, current); });
            }), current);
        }));
        show(title + ' — качество', items, back);
    }
    function play(title, list, selected, back) {
        stop(); close();
        var data = C.playerData(title, list, selected, back);
        L.Player.play(data);
        if (L.Player.callback) L.Player.callback(back);
        /* Do not let an unrelated plugin's previous playlist continue. */
        if (L.Player.playlist) L.Player.playlist([data]);
    }
    function apiPage(json, base, back, depth) {
        if (depth > 20) throw C.fail('Слишком много переходов API');
        var page = C.lampacPage(json, base);
        function current() { apiPage(json, base, back, depth); }
        function open(item) {
            if (item.method === 'play') return qualities(item.title, item.streams, current);
            load('Источник', function (done) {
                return request(C.query(item.url, { rjson: true }), done);
            }, function (data) {
                if (item.method === 'call') {
                    if (!data || data.method !== 'play') throw C.fail('API не разрешил воспроизведение', 'access');
                    return qualities(data.title || item.title, C.streams(data, base), current);
                }
                apiPage(data, base, current, depth + 1);
            }, current);
        }
        var items = orderedVoices(page.voices, 'title').map(function (v) {
            return row('Озвучка: ' + v.title + (v.active ? ' ✓' : ''), function () { open(v); });
        });
        (page.type === 'movie' ? orderedVoices(page.items, 'title') : page.items).forEach(function (item) { items.push(row(item.title, function () { open(item); }, item.subtitle)); });
        show('RU Online — ' + ({ season: 'Сезоны', episode: 'Серии', movie: 'Озвучки', similar: 'Выберите фильм', empty: 'Нет доступных результатов' }[page.type]), items, back);
    }
    function provider(providerId, card, back) {
        var bases;
        try { bases = [get(providerId), get(providerId + '_backup')].filter(Boolean).map(C.endpoint); }
        catch (e) { return errorView(e, back); }
        load(C.PROVIDERS[providerId], function (done) {
            return C.fallback(bases, function (base, cb) { return request(C.lampacURL(base, providerId, card), cb); }, done);
        }, function (json, base) { apiPage(json, base, back, 0); }, back);
    }
    function sources(card, back) {
        function current() { sources(card, back); }
        var items = [];
        Object.keys(C.PROVIDERS).forEach(function (id) {
            items.push(row(C.PROVIDERS[id], function () {
                if (!get(id)) return settings(current);
                provider(id, card, current);
            }, get(id) ? 'Настроенный вами API · доступ определяет источник' : 'Нужен разрешённый API — настроить'));
        });
        if (get('catalog')) items.push(row('Мой каталог', function () { browseCatalog(get('catalog'), card.title || card.name || '', current); }));
        items.push(row('Открытый тестовый каталог', function () { browseCatalog(HOME + 'catalog.json', card.title || card.name || '', current); }, 'Без сервера · Blender Open Movies · оригинальные дорожки'));
        items.push(row('Настройки', function () { settings(current); }));
        show('RU Online — ' + (card.title || card.name || 'Источники'), items, back);
    }
    function search() {
        L.Input.edit({ title: 'Название фильма или сериала', value: lastQuery, free: true, nosave: true }, function (value) {
            lastQuery = C.text(value).trim();
            if (lastQuery) sources({ title: lastQuery }, home);
            else home();
        });
    }
    function settings(back) {
        function current() { settings(back); }
        function edit(key, label, validator) {
            L.Input.edit({ title: label, value: C.text(get(key)), free: true, nosave: true }, function (value) {
                value = C.text(value).trim();
                try { if (value && validator) value = validator(value); set(key, value); current(); }
                catch (e) { errorView(e, current); }
            });
        }
        var rows = [row('Используйте только разрешённые интеграции', function () { notify('Пароли Rezka/Filmix плагин не запрашивает. Вход и права — на стороне владельца API.'); }, 'Не добавляйте пароли в URL. Общие публичные прокси не предустановлены.')];
        Object.keys(C.PROVIDERS).forEach(function (id) {
            rows.push(row(C.PROVIDERS[id] + ' — API сервер', function () { edit(id, 'HTTPS-адрес разрешённого Lampac API', C.endpoint); }, get(id) ? 'Настроен · OK для изменения' : 'Не настроен'));
            rows.push(row(C.PROVIDERS[id] + ' — резервный сервер', function () { edit(id + '_backup', 'Резервный HTTPS API', C.endpoint); }, get(id + '_backup') ? 'Настроен' : 'Не настроен'));
        });
        rows.push(row('Мой JSON-каталог', function () { edit('catalog', 'HTTPS-ссылка на каталог version: 1', C.https); }, get('catalog') ? 'Настроен' : 'Не настроен'));
        rows.push(row('Предпочитаемая озвучка', function () { edit('voice', 'Часть названия озвучки, например Дубляж'); }, get('voice') || 'Все озвучки'));
        rows.push(row('Предпочитаемое качество: ' + get('quality'), function () {
            show('Качество по умолчанию', ['auto', '2160p', '1080p', '720p', '480p', '360p'].map(function (q) {
                return row(q === 'auto' ? 'Авто — лучшее из ответа API' : q, function () { set('quality', q); current(); });
            }), current);
        }));
        rows.push(row('Cookies API: ' + (get('cookies') ? 'включены' : 'выключены'), function () {
            set('cookies', !get('cookies')); current();
        }, 'Только ваши API-серверы. Нужен CORS с credentials; ограничения WebView сохраняются.'));
        rows.push(row('Сбросить настройки', function () {
            show('Сбросить настройки RU Online?', [row('Отмена', current), row('Сбросить', function () {
                Object.keys(defaults).forEach(function (k) { set(k, defaults[k]); }); current();
            })], current);
        }));
        show('RU Online ' + C.VERSION + ' — настройки', rows, back);
    }
    function home() {
        show('Lampa RU Online', [row('Найти фильм или сериал', search),
            row('Открытый тестовый каталог', function () { browseCatalog(HOME + 'catalog.json', '', home); }, 'Проверка установки и плеера без аккаунта'),
            row('Мой каталог', function () { if (get('catalog')) browseCatalog(get('catalog'), '', home); else settings(home); }),
            row('Настройки источников', function () { settings(home); }),
            row('О плагине и проверках', function () {
                show('RU Online ' + C.VERSION, [row('Клиент Rezka / Filmix через Lampac JSON API', home, 'Работа конкретных источников требует разрешённого API и отдельно проверяется.'),
                    row('MP4 / HLS · пульт · резервные ссылки', home, 'DRM и обход ограничений не реализованы. Подробнее — README репозитория.')], home);
            })], restore);
    }
    function open(card) {
        try { originalController = L.Controller.enabled().name || 'content'; } catch (e) { originalController = 'content'; }
        if (card) sources(card, restore); else home();
    }
    function menu() {
        var list = $('.menu .menu__list').first();
        if (!list.length) list = $('.menu__list').first();
        if (!list.length || $('.ru-online-menu').length) return;
        var item = $('<li class="menu__item selector ru-online-menu"><div class="menu__ico">▶</div><div class="menu__text">RU Online</div></li>');
        item.on('hover:enter', function () { open(); }); list.append(item);
    }
    function start() {
        if (started || !window.Lampa || !window.jQuery) return;
        L = window.Lampa; $ = window.jQuery;
        if (!L.Select || !L.Input || !L.Player || !L.Storage || !L.Listener) return;
        started = true; menu();
        L.Listener.follow('full', function (event) {
            if (event.type !== 'complite' || !event.object || !event.object.activity || !event.data) return;
            var root = event.object.activity.render();
            if (root.find('.view--ru-online').length) return;
            var container = root.find('.full-start-new__buttons, .full-start__buttons').first();
            if (!container.length) return;
            var button = $('<div class="full-start__button selector view--ru-online"><span>RU Online</span></div>');
            button.on('hover:enter', function () { open(event.data.movie); }); container.append(button);
        });
        if (L.SettingsApi) {
            L.SettingsApi.addComponent({ component: 'ru_online', name: 'RU Online', icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' });
            L.SettingsApi.addParam({ component: 'ru_online', param: { name: 'ru_online_open', type: 'button' }, field: { name: 'Открыть RU Online', description: 'Поиск, источники и настройки' },
                onChange: function () { open(); } });
        }
    }
    window.RUOnline = { version: C.VERSION, open: open, start: start };
    if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') { start(); menu(); } });
    }
    if (window.appready) start();
    var tries = 0, timer = setInterval(function () {
        tries++; if (window.appready) start(); if (started || tries > 120) clearInterval(timer);
    }, 500);
}(window));
