# Состояние доставки

27 октября 2026 года: код, сборка, 16 тестов, браузерный smoke в настоящей Lampa и сетевые/программные проверки открытых демомедиа подготовлены локально.

**Публикация не выполнена.** Хотя metadata репозитория сообщает admin/push, фактическое подключение возвращает:

- `git push origin gh-pages`: HTTP 403, permission denied.
- GitHub `POST /repos/TheOFF2/lampa-ru-online/git/refs` (создание feat/ru-online): HTTP 403, Resource not accessible by integration.
- GitHub `POST /repos/TheOFF2/lampa-ru-online/pages`: HTTP 403, Resource not accessible by integration.

HTTPS-ссылка из README является целевым адресом, а не подтверждённой действующей публикацией. Удалённые ветки не созданы; PR не создан, поскольку сервер не принял ветку с изменениями. Main не изменён. Локальная ветка: feat/ru-online; дистрибутив: public/.

Для завершения нужно подключение с правами Contents (write), Pull requests (write), Workflows (для workflow-файлов) и Pages (write), либо действие владельца с соответствующими правами. Скопируйте подготовленный коммит/patch, отправьте ветку и создайте PR по описанию PULL_REQUEST.md. После слияния выберите Settings → Pages → Source: GitHub Actions; workflow pages.yml опубликует public/.

Первичную публикацию без слияния PR можно выполнить отдельно из содержимого public/ в gh-pages, включить Pages для этой ветки и затем переключить Source на Actions для последующих обновлений main. Никогда не считайте наличие URL в README доказательством успешной публикации: проверьте HTTP 200 для ru-online.js и catalog.json.
