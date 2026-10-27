# Состояние доставки

27 октября 2026 года: отправлены ветки `feat/ru-online` (исходники) и `gh-pages` (готовое содержимое public/). Создан [Pull Request №1](https://github.com/TheOFF2/lampa-ru-online/pull/1). Основная ветка main не изменялась, PR не сливался.

**Начальная публикация работает:**

- Плагин: https://theoff2.github.io/lampa-ru-online/ru-online.js
- Инструкция: https://theoff2.github.io/lampa-ru-online/
- Каталог: https://theoff2.github.io/lampa-ru-online/catalog.json

Для JS, JSON, HTML и LICENSE подтверждены HTTP 200 и побайтовое совпадение с public/. JS/JSON имеют корректный Content-Type и CORS `*`. Машиночитаемое подтверждение — [deployment-checks.json](deployment-checks.json).

Код, 16 тестов, браузерный smoke в настоящей Lampa и сетевые/программные проверки открытых демомедиа готовы. CI закреплён на Ubuntu 24.04, поддерживаемой Playwright 1.56.1.

Установка ChatGPT Codex Connector восстановила отправку кода/веток и создание PR. Сам Connector не имеет права Pages: API включения возвращал 403. Публикация из ветки gh-pages уже доступна, дополнительных изменений для установки плагина не требуется.

Для автоматических обновлений из main после слияния PR выберите Settings → Pages → Source: GitHub Actions. Workflow pages.yml соберёт public/. Пока PR не слит, начальная публикация gh-pages независима от main.

Живые Rezka/Filmix остаются непроверенными: разрешённые API/аккаунты для них не предоставлены. Подробности — VERIFICATION.md.
