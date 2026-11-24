# StartupEval — интеллектуальный сайт для оценки стартап-идей

Учебный проект по дисциплине «ИКТ», Университет Нархоз, Школа цифровых технологий.
Статический сайт на HTML/CSS/vanilla JS + две serverless-функции Vercel, которые обращаются
к Google Gemini. Без фреймворков, сборщиков и базы данных.

**Страницы:** главная, оценка идеи, аналитика, ментор, о проекте.

---

## 1. Структура проекта

```
site/
├── index.html            # Главная: hero, 3 шага, видео, критерии
├── evaluate.html         # Форма оценки + результат
├── analytics.html        # Методика + таблица проверки достоверности
├── mentor.html           # Чат-бот «Ментор стартапов»
├── about.html            # О проекте, авторы, этика
├── css/style.css         # Единая тема на CSS-переменных
├── js/
│   ├── common.js         # Header, footer, меню, музыка, заглушки медиа
│   ├── evaluate.js       # Валидация формы, /api/evaluate, радар Chart.js
│   ├── analytics.js      # Таблица, фильтры, сортировка, графики
│   └── mentor.js         # Чат, история, индикатор «печатает…»
├── data/
│   ├── validation.json   # 10 кейсов для проверки методики
│   └── demo-results.json # Демо-оценки на случай недоступности API
├── assets/
│   ├── images/           # hero.jpg, pitch-poster.jpg (пока пусто)
│   ├── audio/            # bg.mp3 (пока пусто)
│   └── video/            # pitch.mp4 (пока пусто)
├── api/
│   ├── evaluate.js       # POST → Gemini → строгий JSON
│   └── chat.js           # POST → Gemini → { reply }
├── prompts/
│   ├── system-evaluate.txt
│   └── system-mentor.txt
├── vercel.json           # includeFiles для prompts + no-store для /api
├── package.json          # type: module (нужен для ESM в api/*.js)
└── README.md
```

> Проект лежит **в корне репозитория**, а не в подпапке `startup-eval/`, чтобы GitHub Pages
> сразу отдавал сайт по адресу `https://<логин>.github.io/<репозиторий>/`.

### Что нужно заменить перед защитой

| Где | Что заменить |
| --- | --- |
| `js/common.js` → `FOOTER_INFO` | Фамилия Имя, группа `[ОП]` |
| `about.html` | Авторы, группа, список литературы (TODO-блок) |
| `analytics.html` | Тексты «TODO» в методике и выводах |
| `data/validation.json` | Реальные баллы вместо условных, комментарии вместо `TODO` |
| `assets/…` | hero.jpg, bg.mp3, pitch.mp4, pitch-poster.jpg |

---

## 2. Локальный запуск

### Вариант А. Просто посмотреть вёрстку (без AI)

Любой статический сервер из корня проекта:

```bash
python3 -m http.server 8000
# открыть http://localhost:8000
```

Кнопки оценки в этом режиме покажут демо-результат и плашку «Демо-режим» — это ожидаемо,
потому что `/api/evaluate` существует только на Vercel.

### Вариант Б. С работающим AI (нужен ключ)

```bash
npm i -g vercel          # один раз
cd site
vercel dev               # http://localhost:3000
```

`vercel dev` поднимает и статику, и функции из `api/`. Ключ берётся из `.env` (файл в `.gitignore`):

```bash
# .env
GEMINI_API_KEY=ваш_ключ
GEMINI_MODEL=gemini-2.5-flash   # необязательно
```

---

## 3. Получить API-ключ Gemini

1. Откройте [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Войдите в Google-аккаунт → **Create API key**.
3. Скопируйте ключ (начинается на `AIza…`). Он показывается один раз — сохраните в менеджере паролей.
4. Не вставляйте ключ в HTML/JS и не коммитьте в git: он должен жить только в переменных окружения.

Бесплатного лимита Gemini хватает для демонстрации проекта на защите.

---

## 4. Залить на GitHub

```bash
cd site
git init                     # если репозиторий ещё не создан
git add .
git commit -m "feat: StartupEval site"
git branch -M main
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

Проверьте, что `.env` **не** попал в коммит:

```bash
git ls-files | grep -i env
# вывод должен быть пустым
```

### GitHub Pages (только статика, без AI)

`Settings → Pages → Source: Deploy from a branch → main / (root)`.
Сайт откроется на `https://USER.github.io/REPO/`.
Функции `/api/*` там не работают, поэтому страница оценки будет показывать демо-пример.
Для полноценной работы нужен Vercel.

---

## 5. Деплой на Vercel

1. Зарегистрируйтесь на [vercel.com](https://vercel.com) через GitHub.
2. **Add New → Project → Import Git Repository** → выберите репозиторий.
3. Framework Preset: **Other**. Build Command и Output Directory оставьте пустыми,
   Root Directory — корень репозитория (если проект в подпапке, укажите её).
4. **Environment Variables** → добавьте:
   - `GEMINI_API_KEY` — ваш ключ;
   - `GEMINI_MODEL` — `gemini-2.5-flash` (необязательно).
5. **Deploy**. Через минуту сайт будет на `https://<project>.vercel.app`.
6. Любой `git push` в `main` автоматически запускает новый деплой.

### Проверить, что API работает

```bash
curl -s -X POST https://<project>.vercel.app/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"description":"B2B-сервис для кофеен Казахстана: прогноз закупок по погоде и чекам, подписка 25000 тенге за точку, MVP за 2 месяца."}' \
  | head -c 600
```

Ожидаемо: JSON с `"valid": true` и шестью критериями. Если пришло
`{"valid":false,"error":"AI-сервис временно недоступен…"}` — смотрите логи:
**Vercel → Project → Logs** (или `vercel logs`). Частые причины: ключ не добавлен,
ключ добавлен в Preview, а не в Production, исчерпана квота, неверное имя модели.

Чат проверяется так:

```bash
curl -s -X POST https://<project>.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Как проверить спрос до MVP?"}]}'
```

---

## 6. Если ключ утёк

1. **Сразу отзовите ключ** в [Google AI Studio](https://aistudio.google.com/app/apikey) → Delete.
2. Создайте новый и обновите `GEMINI_API_KEY` в Vercel (**Settings → Environment Variables**)
   и локально в `.env`.
3. Сделайте **Redeploy** (переменные применяются только к новым деплоям).
4. Если ключ попал в git-историю — удалите его из истории (`git filter-repo`) или
   пересоздайте репозиторий: старые коммиты остаются доступными.
5. Проверьте биллинг Google Cloud: на бесплатном ключе ущерб обычно нулевой, но лимит мог
   быть израсходован.

Профилактика: ключ только в переменных окружения, `.env` в `.gitignore`,
`git grep -i "AIza"` перед пушем.

---

## 7. Как устроена оценка

1. `evaluate.js` проверяет описание (20–2000 символов) и отправляет POST на `/api/evaluate`.
2. `api/evaluate.js` обрезает поля до 300 символов, читает `prompts/system-evaluate.txt`
   и вызывает `callModel(system, messages)`.
3. Gemini возвращает JSON (`responseMimeType: application/json`, `temperature: 0.3`).
   Функция убирает возможные ```` ```json ```` обёртки, парсит и валидирует структуру:
   шесть критериев, балл 1–10, массивы строк.
4. Браузер считает итог сам, по фиксированным весам:
   `0.25·рынок + 0.20·уникальность + 0.15·реализуемость + 0.20·монетизация + 0.10·масштабируемость + 0.10·риски`,
   округляя до одного знака.
5. Если API недоступен (нет функции, 5xx, сеть) — подгружается случайный пример из
   `data/demo-results.json` и показывается плашка «Демо-режим».

### Сменить провайдера модели

В `api/evaluate.js` и `api/chat.js` есть одна функция `callModel(system, messages)`.
Замените в ней URL, заголовки и тело запроса — остальной код не изменится.

---

## 8. Защита от злоупотреблений

- Только `POST`; на остальные методы — `405`.
- Описание: 20–2000 символов; остальные поля обрезаются до 300.
- Чат: максимум 10 сообщений, каждое до 1000 символов, роли ограничены `user`/`assistant`.
- Ключ не покидает сервер, ошибки модели логируются без ключа.
- Весь текст из ответов вставляется через `textContent` — XSS через ответ модели невозможен.

Для публичного проекта имеет смысл дополнительно включить квоты в Google Cloud
и/или rate limit на Vercel (например, Vercel KV или middleware).

---

## 9. Ограничения и этика

ИИ может ошибаться и не проверяет факты. Оценка — инструмент первичного скрининга,
она не заменяет экспертов и Due Diligence. Данные пользователя не сохраняются в базу:
описание уходит в API модели только для формирования ответа.

---

## 10. Частые проблемы

| Симптом | Причина и решение |
| --- | --- |
| «Демо-режим» на Vercel | Не задан `GEMINI_API_KEY` или не сделан Redeploy после добавления переменной |
| `405 Method Not Allowed` | Запрос не POST (например, открыли `/api/evaluate` в браузере) |
| Пустая таблица аналитики | Открыли `index.html` через `file://` — нужен локальный сервер |
| Музыка пишет «Нет файла» | Не добавлен `assets/audio/bg.mp3` |
| Chart.js не рисуется | CDN заблокирован; сайт продолжает работать без графиков |
| `Permission denied (publickey)` при push | Remote на HTTPS или ключ не добавлен в GitHub: `git remote set-url origin git@github.com:USER/REPO.git` |
