# Контракты интеграций

## Lampac JSON

`GET {base}/lite/rezka` и `GET {base}/lite/filmix`: `title`, `original_title`, `year`, `kinopoisk_id`, `imdb_id`, `serial`, `clarification=1`, `rjson=true`. Неизвестный тип поиска: `serial=-1`, фильм: `0`, сериал: `1`.

Контракт изучен по `MovieTpl`, `SeasonTpl`, `EpisodeTpl`, `SimilarTpl`, `VoiceTpl` Lampac. Клиент реализован независимо, серверный код не включён.

| type | data | voice |
|---|---|---|
| `similar` | `{title,year,url}` | — |
| `season` | `{name,method:"link",url,id}` | `{name,method:"link",url,active}` |
| `episode` | `{name,title,s,e,method,url,quality}` | те же озвучки |
| `movie` | `{translate,title,method,url,quality}` | те же озвучки |

`link` загружает следующий экран; `play` содержит видео; `call` загружает JSON `{method:"play",url,title,quality}`. `quality` — словарь `{"1080p":"https://cdn.example/1080.mp4"}`. `[]` означает пустую выдачу.

API-переходы остаются на **том же origin**, что настроенный сервер. Видео-CDN может иметь другой origin. При переходах добавляется `rjson=true`. Таймаут: 15 секунд, JSON: до 4 МБ. Произвольные заголовки, пароли, поддельные Cookie/Referer/User-Agent не отправляются. Cookies выключены по умолчанию, включаются только для настроенных API-origin. Параметры ссылок, полученных от API того же origin, сохраняются; токены в базовом адресе не принимаются. Не публикуйте персональные URL API в отчётах.

Нет HTML-скрейпинга и исполнения скриптов ответа. Метаданные DRM и дополнительные обязательные заголовки потока отклоняются. Иные контракты/HTML API не поддерживаются. Обычный поиск проверяет доступность; отдельного endpoint диагностики нет.

## Статический каталог v1

```json
{
  "version": 1,
  "items": [{
    "id": "my-series",
    "title": "Мой сериал",
    "original_title": "My series",
    "year": 2026,
    "attribution": "Правообладатель / лицензия",
    "voices": [{
      "name": "Русский дубляж",
      "language": "ru",
      "seasons": [{
        "number": 1,
        "episodes": [{
          "number": 1,
          "title": "Первая серия",
          "streams": [{
            "url": "https://media.example.org/s01e01.m3u8",
            "quality": "1080p",
            "format": "hls",
            "backups": ["https://backup.example.org/s01e01.m3u8"]
          }]
        }]
      }]
    }]
  }]
}
```

Это пример схемы: `example.org` — не действующий источник. Для фильма замените `seasons` на `streams` непосредственно в озвучке. `format`: `mp4`/`hls`. Одна озвучка — один перевод; дорожки внутри HLS переключает штатный плеер. Сезоны/серии сортируются по номеру. Максимум 5000 записей, выдача — первые 200; уточняйте запрос. Поиск по словам в названии, оригинальном названии и году, с нормализацией `ё/е`.

Для публичного каталога нужны `Content-Type: application/json` и CORS `Access-Control-Allow-Origin: *`, без credentials. Заголовки видео, CORS плейлистов/сегментов, сроки ссылок и кодеки обеспечивает владелец. GitHub Pages подходит для каталога/JS, не для хранения больших фильмов и проксирования.
