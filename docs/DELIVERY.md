# Состояние доставки

27 октября 2026 года: после установки ChatGPT Codex Connector успешно отправлены ветки `feat/ru-online` (исходники) и `gh-pages` (готовое содержимое public/). Основная ветка main не изменялась.

Код, сборка, 16 тестов, браузерный smoke в настоящей Lampa и сетевые/программные проверки открытых демомедиа готовы. CI закреплён на Ubuntu 24.04: ubuntu-latest уже использует 26.04, которую Playwright 1.56.1 не поддерживает.

**Остаётся включить GitHub Pages.** Установленное приложение имеет права на код, PR и workflows, но `POST /repos/TheOFF2/lampa-ru-online/pages` возвращает HTTP 403 Resource not accessible by integration.

Владелец может открыть https://github.com/TheOFF2/lampa-ru-online/settings/pages и выбрать Source: Deploy from a branch, Branch: gh-pages, папку / (root), Save. Дистрибутив уже отправлен. После сборки ожидаемый адрес: https://theoff2.github.io/lampa-ru-online/ru-online.js . Наличие адреса в README не подтверждает публикацию: нужно проверить HTTP 200 JS и catalog.json.

После слияния PR для обновлений main можно выбрать Source: GitHub Actions; pages.yml собирает public/. До слияния PR публикация gh-pages независима от main.
