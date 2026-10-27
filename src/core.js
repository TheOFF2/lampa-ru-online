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
