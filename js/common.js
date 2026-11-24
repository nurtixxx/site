/**
 * common.js — общие элементы интерфейса для всех страниц.
 *
 * Что делает файл:
 *  1) Вставляет header и footer (пишутся один раз здесь);
 *  2) Подсвечивает активный пункт меню;
 *  3) Делает мобильное меню-бургер;
 *  4) Добавляет панель фоновой музыки с запоминанием настроек в localStorage;
 *  5) Прячет «битые» картинки-заглушки, оставляя аккуратный градиент.
 *
 * Внешних зависимостей нет.
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------
   * Данные навигации и подвала.
   * Поменяйте ФИО, ОП и университет в одном месте — обновится везде.
   * ------------------------------------------------------- */
  var NAV_ITEMS = [
    { href: "index.html", label: "Главная" },
    { href: "evaluate.html", label: "Оценка идеи" },
    { href: "analytics.html", label: "Аналитика" },
    { href: "mentor.html", label: "Ментор" },
    { href: "about.html", label: "О проекте" }
  ];

  var FOOTER_INFO = {
    authors: "Фамилия Имя, Фамилия Имя",
    course: "ИКТ",
    university: "Университет Нархоз",
    school: "Школа цифровых технологий",
    program: "[ОП]",
    year: "© 2026"
  };

  var STORAGE_KEYS = {
    volume: "startupEval.audio.volume",
    playing: "startupEval.audio.playing"
  };

  /* ---------------------------------------------------------
   * Безопасная работа с localStorage (в приватном режиме может падать).
   * ------------------------------------------------------- */
  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* игнорируем — настройки просто не сохранятся */
    }
  }

  /** Возвращает имя текущей страницы: "evaluate.html" или "index.html". */
  function currentPage() {
    var last = window.location.pathname.split("/").pop();
    return !last || last === "" ? "index.html" : last;
  }

  /* ---------------------------------------------------------
   * Шапка сайта
   * ------------------------------------------------------- */
  function buildHeader() {
    var header = document.createElement("header");
    header.className = "site-header";

    var inner = document.createElement("div");
    inner.className = "container header-inner";

    var logo = document.createElement("a");
    logo.className = "logo";
    logo.href = "index.html";

    var mark = document.createElement("span");
    mark.className = "logo-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "SE";

    var logoText = document.createElement("span");
    logoText.textContent = "StartupEval";

    logo.appendChild(mark);
    logo.appendChild(logoText);

    var toggle = document.createElement("button");
    toggle.className = "nav-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "site-nav");
    toggle.setAttribute("aria-label", "Открыть меню");
    toggle.innerHTML = "<span></span><span></span><span></span>";

    var nav = document.createElement("nav");
    nav.className = "nav";
    nav.id = "site-nav";
    nav.setAttribute("aria-label", "Основная навигация");

    var page = currentPage();
    NAV_ITEMS.forEach(function (item) {
      var link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.label;
      if (item.href === page) {
        link.setAttribute("aria-current", "page");
      }
      nav.appendChild(link);
    });

    toggle.addEventListener("click", function () {
      var opened = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", opened ? "true" : "false");
      toggle.setAttribute("aria-label", opened ? "Закрыть меню" : "Открыть меню");
    });

    inner.appendChild(logo);
    inner.appendChild(nav);
    inner.appendChild(toggle);
    header.appendChild(inner);
    return header;
  }

  /* ---------------------------------------------------------
   * Подвал сайта
   * ------------------------------------------------------- */
  function buildFooter() {
    var footer = document.createElement("footer");
    footer.className = "site-footer";

    var inner = document.createElement("div");
    inner.className = "container footer-inner";

    var who = document.createElement("p");
    who.textContent = FOOTER_INFO.authors;

    var meta = document.createElement("div");
    meta.className = "footer-meta";
    [FOOTER_INFO.course, FOOTER_INFO.university, FOOTER_INFO.school, FOOTER_INFO.program].forEach(
      function (text) {
        var span = document.createElement("span");
        span.textContent = text;
        meta.appendChild(span);
      }
    );

    var year = document.createElement("p");
    year.textContent = FOOTER_INFO.year;

    var left = document.createElement("div");
    left.appendChild(who);
    left.appendChild(meta);

    inner.appendChild(left);
    inner.appendChild(year);
    footer.appendChild(inner);
    return footer;
  }

  /* ---------------------------------------------------------
   * Панель фоновой музыки.
   * Автозапуск намеренно не делается: браузеры блокируют play() без
   * действия пользователя. Запоминаем только громкость и состояние.
   * ------------------------------------------------------- */
  function buildAudioPanel() {
    var audio = document.createElement("audio");
    audio.id = "bg-audio";
    audio.loop = true;
    audio.preload = "none";
    audio.src = "assets/audio/bg.mp3";
    // Аудио не должно перехватывать внимание скринридеров
    audio.setAttribute("aria-hidden", "true");

    var panel = document.createElement("div");
    panel.className = "audio-panel";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Фоновая музыка");

    var btn = document.createElement("button");
    btn.className = "audio-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Включить фоновую музыку");
    btn.innerHTML = playIcon();

    var label = document.createElement("span");
    label.className = "audio-label";
    label.textContent = "Пауза";

    var volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.setAttribute("aria-label", "Громкость музыки");

    // Восстанавливаем громкость (по умолчанию 40 %)
    var savedVolume = Number(storageGet(STORAGE_KEYS.volume));
    if (!Number.isFinite(savedVolume) || savedVolume < 0 || savedVolume > 1) {
      savedVolume = 0.4;
    }
    volume.value = String(savedVolume);
    audio.volume = savedVolume;

    volume.addEventListener("input", function () {
      var value = Number(volume.value);
      audio.volume = Number.isFinite(value) ? value : 0.4;
      storageSet(STORAGE_KEYS.volume, String(audio.volume));
    });

    function render(isPlaying) {
      btn.innerHTML = isPlaying ? pauseIcon() : playIcon();
      btn.setAttribute(
        "aria-label",
        isPlaying ? "Поставить музыку на паузу" : "Включить фоновую музыку"
      );
      label.textContent = isPlaying ? "Играет" : "Пауза";
      storageSet(STORAGE_KEYS.playing, isPlaying ? "true" : "false");
    }

    btn.addEventListener("click", function () {
      if (audio.paused) {
        // play() возвращает промис — ошибку (например, нет файла) обрабатываем мягко
        var attempt = audio.play();
        if (attempt && typeof attempt.catch === "function") {
          attempt.catch(function () {
            label.textContent = "Нет файла";
            btn.setAttribute("aria-label", "Аудиофайл не найден");
          });
        }
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () {
      render(true);
    });
    audio.addEventListener("pause", function () {
      render(false);
    });
    audio.addEventListener("error", function () {
      label.textContent = "Нет файла";
      btn.disabled = true;
      btn.setAttribute("aria-label", "Аудиофайл assets/audio/bg.mp3 не найден");
    });

    render(false);

    panel.appendChild(btn);
    panel.appendChild(label);
    panel.appendChild(volume);

    var holder = document.createElement("div");
    holder.appendChild(audio);
    holder.appendChild(panel);
    return holder;
  }

  function playIcon() {
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }

  function pauseIcon() {
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  }

  /* ---------------------------------------------------------
   * Заглушки вместо отсутствующих медиафайлов:
   * если картинка не загрузилась, скрываем её — остаётся градиент.
   * ------------------------------------------------------- */
  function setupMediaFallbacks() {
    var images = document.querySelectorAll("img[data-fallback]");
    Array.prototype.forEach.call(images, function (img) {
      function hide() {
        img.style.display = "none";
        var box = img.closest(".media-placeholder");
        if (box) {
          box.classList.add("is-missing");
        }
      }
      img.addEventListener("error", hide);
      // Событие могло произойти до навешивания обработчика
      if (img.complete && img.naturalWidth === 0) {
        hide();
      }
    });
  }

  /* ---------------------------------------------------------
   * Инициализация
   * ------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    var body = document.body;

    // Ссылка «к основному содержимому» для клавиатурной навигации
    var skip = document.createElement("a");
    skip.className = "skip-link";
    skip.href = "#main";
    skip.textContent = "Перейти к содержимому";

    body.insertBefore(skip, body.firstChild);
    body.insertBefore(buildHeader(), skip.nextSibling);
    body.appendChild(buildFooter());
    body.appendChild(buildAudioPanel());

    setupMediaFallbacks();
  });
})();
