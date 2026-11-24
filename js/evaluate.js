/**
 * evaluate.js — форма оценки идеи, вызов /api/evaluate и вывод результата.
 *
 * Ключевые принципы:
 *  - итоговый балл считается на клиенте по фиксированным весам, модели не доверяем;
 *  - любой текст из ответа вставляется только через textContent (защита от XSS);
 *  - если API недоступен, показываем сохранённый пример из data/demo-results.json
 *    и честно сообщаем об этом плашкой «Демо-режим».
 */
(function () {
  "use strict";

  /* Веса критериев: сумма = 1.00 */
  var WEIGHTS = {
    problem_market: 0.25,
    uniqueness: 0.2,
    feasibility: 0.15,
    monetization: 0.2,
    scalability: 0.1,
    risks: 0.1
  };

  var CRITERIA = [
    { key: "problem_market", label: "Проблема и рынок" },
    { key: "uniqueness", label: "Уникальность" },
    { key: "feasibility", label: "Реализуемость" },
    { key: "monetization", label: "Монетизация" },
    { key: "scalability", label: "Масштабируемость" },
    { key: "risks", label: "Риски" }
  ];

  var MIN_DESCRIPTION = 20;
  var MAX_DESCRIPTION = 2000;

  /* ---------------------------------------------------------
   * Короткие помощники
   * ------------------------------------------------------- */
  function $(id) {
    return document.getElementById(id);
  }

  function clampScore(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Math.min(10, Math.max(1, num));
  }

  /** Цветовой класс по итоговому баллу: красный < 4, жёлтый 4–6.9, зелёный ≥ 7. */
  function scoreClass(total) {
    if (total < 4) {
      return "is-low";
    }
    if (total < 7) {
      return "is-mid";
    }
    return "is-high";
  }

  /** Взвешенный итог по шкале 10, один знак после запятой. */
  function computeTotal(scores) {
    var sum = 0;
    CRITERIA.forEach(function (item) {
      sum += scores[item.key].score * WEIGHTS[item.key];
    });
    return Math.round(sum * 10) / 10;
  }

  /** Проверяет структуру ответа API. Возвращает нормализованный объект или null. */
  function normalizeResult(data) {
    if (!data || data.valid !== true || typeof data.scores !== "object" || data.scores === null) {
      return null;
    }

    var scores = {};
    for (var i = 0; i < CRITERIA.length; i += 1) {
      var key = CRITERIA[i].key;
      var raw = data.scores[key];
      if (!raw || typeof raw !== "object") {
        return null;
      }
      var score = clampScore(raw.score);
      if (score === null) {
        return null;
      }
      scores[key] = {
        score: Math.round(score),
        comment: typeof raw.comment === "string" ? raw.comment : ""
      };
    }

    function asStringList(value) {
      if (!Array.isArray(value)) {
        return [];
      }
      return value.filter(function (item) {
        return typeof item === "string" && item.trim() !== "";
      });
    }

    return {
      idea_title: typeof data.idea_title === "string" ? data.idea_title : "",
      scores: scores,
      strengths: asStringList(data.strengths),
      weaknesses: asStringList(data.weaknesses),
      recommendations: asStringList(data.recommendations),
      similar_existing: asStringList(data.similar_existing),
      verdict: typeof data.verdict === "string" ? data.verdict : "",
      total: computeTotal(scores)
    };
  }

  /* ---------------------------------------------------------
   * Состояние страницы
   * ------------------------------------------------------- */
  var state = {
    busy: false,
    radar: null,
    lastResult: null
  };

  document.addEventListener("DOMContentLoaded", function () {
    var form = $("evaluate-form");
    var titleInput = $("idea-title");
    var descriptionInput = $("idea-description");
    var audienceInput = $("idea-audience");
    var monetizationInput = $("idea-monetization");
    var regionInput = $("idea-region");

    var submitBtn = $("submit-btn");
    var demoBtn = $("demo-btn");
    var copyBtn = $("copy-btn");
    var againBtn = $("again-btn");

    var counter = $("description-counter");
    var descriptionError = $("description-error");
    var formError = $("form-error");
    var demoBanner = $("demo-banner");
    var resultSection = $("result");
    var copyStatus = $("copy-status");

    /* ---------- Счётчик символов ---------- */
    function updateCounter() {
      var length = descriptionInput.value.length;
      counter.textContent = length + " / " + MAX_DESCRIPTION;
      var row = counter.parentElement;
      var tooShort = length > 0 && length < MIN_DESCRIPTION;
      var tooLong = length > MAX_DESCRIPTION;
      row.classList.toggle("is-invalid", tooShort || tooLong);
    }

    descriptionInput.addEventListener("input", function () {
      updateCounter();
      if (descriptionInput.getAttribute("aria-invalid") === "true" && isDescriptionValid()) {
        clearDescriptionError();
      }
    });
    updateCounter();

    /* ---------- Валидация описания ---------- */
    function isDescriptionValid() {
      var length = descriptionInput.value.trim().length;
      return length >= MIN_DESCRIPTION && length <= MAX_DESCRIPTION;
    }

    function showDescriptionError(message) {
      descriptionInput.setAttribute("aria-invalid", "true");
      descriptionError.textContent = message;
      descriptionError.hidden = false;
    }

    function clearDescriptionError() {
      descriptionInput.removeAttribute("aria-invalid");
      descriptionError.textContent = "";
      descriptionError.hidden = true;
    }

    function showFormError(message) {
      formError.textContent = message;
      formError.hidden = false;
    }

    function clearFormError() {
      formError.textContent = "";
      formError.hidden = true;
    }

    /* ---------- Индикация загрузки ---------- */
    function setBusy(isBusy) {
      state.busy = isBusy;
      submitBtn.disabled = isBusy;
      demoBtn.disabled = isBusy;
      submitBtn.textContent = isBusy ? "Анализируем идею…" : "Оценить";
    }

    /* ---------- Запрос к серверу ---------- */
    async function requestEvaluation(payload) {
      var response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("server");
      }

      var data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("server");
      }

      // Сервер прислал понятную ошибку валидации — показываем её как есть
      if (data && data.valid === false) {
        return { kind: "invalid", error: data.error || "Не удалось обработать запрос." };
      }

      var normalized = normalizeResult(data);
      if (!normalized) {
        throw new Error("server");
      }
      return { kind: "ok", result: normalized };
    }

    /* ---------- Демо-режим ---------- */
    async function loadDemoResult() {
      var response = await fetch("data/demo-results.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("demo");
      }
      var list = await response.json();
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error("demo");
      }
      var index = Math.floor(Math.random() * list.length);
      var normalized = normalizeResult(list[index]);
      if (!normalized) {
        throw new Error("demo");
      }
      return normalized;
    }

    /* ---------- Отрисовка списка ---------- */
    function fillList(listEl, items) {
      listEl.textContent = "";
      items.forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        listEl.appendChild(li);
      });
    }

    function renderBlock(blockEl, listEl, items) {
      var hasItems = items.length > 0;
      blockEl.hidden = !hasItems;
      if (hasItems) {
        fillList(listEl, items);
      }
    }

    /* ---------- Радарная диаграмма ---------- */
    function renderRadar(result) {
      var canvas = $("radar-chart");
      if (!canvas || typeof window.Chart === "undefined") {
        return;
      }

      if (state.radar) {
        state.radar.destroy();
        state.radar = null;
      }

      var styles = window.getComputedStyle(document.documentElement);
      var gridColor = styles.getPropertyValue("--border-strong").trim() || "#c9d0e2";
      var textColor = styles.getPropertyValue("--muted").trim() || "#5a6478";
      var accent = styles.getPropertyValue("--primary").trim() || "#4f46e5";

      state.radar = new window.Chart(canvas, {
        type: "radar",
        data: {
          labels: CRITERIA.map(function (item) {
            return item.label;
          }),
          datasets: [
            {
              label: "Оценка",
              data: CRITERIA.map(function (item) {
                return result.scores[item.key].score;
              }),
              backgroundColor: "rgba(79, 70, 229, 0.18)",
              borderColor: accent,
              pointBackgroundColor: accent,
              pointBorderColor: accent,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            r: {
              min: 0,
              max: 10,
              ticks: {
                stepSize: 2,
                color: textColor,
                backdropColor: "transparent"
              },
              grid: { color: gridColor },
              angleLines: { color: gridColor },
              pointLabels: { color: textColor, font: { size: 11 } }
            }
          }
        }
      });
    }

    /* ---------- Отрисовка результата ---------- */
    function renderResult(result) {
      state.lastResult = result;

      // Заголовок и итоговый балл
      $("result-title").textContent = result.idea_title || "Ваша идея";
      $("result-subtitle").textContent =
        "Итог — взвешенная сумма шести критериев (рынок 25 %, уникальность 20 %, " +
        "реализуемость 15 %, монетизация 20 %, масштабируемость 10 %, риски 10 %).";

      var badge = $("score-badge");
      badge.classList.remove("is-low", "is-mid", "is-high");
      badge.classList.add(scoreClass(result.total));
      $("score-value").textContent = result.total.toFixed(1);

      // Карточки критериев
      var cards = $("criteria-cards");
      cards.textContent = "";
      CRITERIA.forEach(function (item) {
        var data = result.scores[item.key];

        var card = document.createElement("div");
        card.className = "crit-card";

        var head = document.createElement("div");
        head.className = "crit-card-head";

        var name = document.createElement("h4");
        name.textContent = item.label;

        var score = document.createElement("span");
        score.className = "crit-score";
        score.textContent = data.score + "/10";

        head.appendChild(name);
        head.appendChild(score);

        var track = document.createElement("div");
        track.className = "progress";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-valuemin", "1");
        track.setAttribute("aria-valuemax", "10");
        track.setAttribute("aria-valuenow", String(data.score));
        track.setAttribute("aria-label", item.label);

        var bar = document.createElement("span");
        bar.style.width = data.score * 10 + "%";
        track.appendChild(bar);

        var comment = document.createElement("p");
        comment.textContent = data.comment;

        card.appendChild(head);
        card.appendChild(track);
        card.appendChild(comment);
        cards.appendChild(card);
      });

      // Вердикт и списки
      var verdictBlock = $("verdict-block");
      verdictBlock.hidden = !result.verdict;
      $("verdict-text").textContent = result.verdict;

      renderBlock($("strengths-block"), $("strengths-list"), result.strengths);
      renderBlock($("weaknesses-block"), $("weaknesses-list"), result.weaknesses);
      renderBlock($("recommendations-block"), $("recommendations-list"), result.recommendations);
      renderBlock($("similar-block"), $("similar-list"), result.similar_existing);

      renderRadar(result);

      resultSection.hidden = false;
      copyStatus.textContent = "";
      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---------- Обработчик отправки формы ---------- */
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (state.busy) {
        return;
      }

      clearFormError();
      demoBanner.hidden = true;
      $("result").hidden = true;

      var description = descriptionInput.value.trim();
      if (!description) {
        showDescriptionError("Опишите идею: хотя бы 20 символов.");
        descriptionInput.focus();
        return;
      }
      if (description.length < MIN_DESCRIPTION) {
        showDescriptionError("Слишком коротко: минимум " + MIN_DESCRIPTION + " символов.");
        descriptionInput.focus();
        return;
      }
      if (description.length > MAX_DESCRIPTION) {
        showDescriptionError("Слишком длинно: максимум " + MAX_DESCRIPTION + " символов.");
        descriptionInput.focus();
        return;
      }
      clearDescriptionError();

      var payload = {
        title: titleInput.value.trim(),
        description: description,
        audience: audienceInput.value.trim(),
        monetization: monetizationInput.value.trim(),
        region: regionInput.value.trim()
      };

      setBusy(true);

      try {
        var outcome = await requestEvaluation(payload);
        if (outcome.kind === "invalid") {
          showFormError(outcome.error);
          return;
        }
        renderResult(outcome.result);
      } catch (error) {
        // Сервер недоступен или ответил ошибкой — показываем сохранённый пример
        try {
          var demo = await loadDemoResult();
          demoBanner.hidden = false;
          renderResult(demo);
        } catch (demoError) {
          showFormError(
            "Не удалось получить оценку и не удалось загрузить демо-пример. " +
              "Проверьте интернет-соединение и повторите попытку."
          );
        }
      } finally {
        setBusy(false);
      }
    });

    /* ---------- Кнопка «Попробовать пример» ---------- */
    demoBtn.addEventListener("click", async function () {
      if (state.busy) {
        return;
      }
      clearFormError();
      setBusy(true);
      try {
        var demo = await loadDemoResult();
        demoBanner.hidden = false;
        renderResult(demo);
      } catch (error) {
        showFormError("Не удалось загрузить демо-пример (data/demo-results.json).");
      } finally {
        setBusy(false);
      }
    });

    /* ---------- Копирование результата ---------- */
    function buildResultText(result) {
      var lines = [];
      lines.push("StartupEval — оценка идеи");
      lines.push("Идея: " + (result.idea_title || "без названия"));
      lines.push("Итоговый балл: " + result.total.toFixed(1) + " / 10");
      lines.push("");
      CRITERIA.forEach(function (item) {
        var data = result.scores[item.key];
        lines.push(item.label + ": " + data.score + "/10 — " + data.comment);
      });

      function pushList(title, items) {
        if (!items.length) {
          return;
        }
        lines.push("");
        lines.push(title + ":");
        items.forEach(function (text) {
          lines.push("• " + text);
        });
      }

      pushList("Сильные стороны", result.strengths);
      pushList("Слабые стороны", result.weaknesses);
      pushList("Рекомендации", result.recommendations);
      pushList("Похожие продукты", result.similar_existing);

      if (result.verdict) {
        lines.push("");
        lines.push("Вердикт: " + result.verdict);
      }
      lines.push("");
      lines.push("© 2026 StartupEval — учебный проект, оценка ИИ не заменяет экспертов.");
      return lines.join("\n");
    }

    copyBtn.addEventListener("click", async function () {
      if (!state.lastResult) {
        return;
      }
      var text = buildResultText(state.lastResult);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          var area = document.createElement("textarea");
          area.value = text;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          document.execCommand("copy");
          document.body.removeChild(area);
        }
        copyStatus.textContent = "Скопировано в буфер обмена.";
      } catch (error) {
        copyStatus.textContent = "Браузер не разрешил копирование. Выделите текст вручную.";
      }
    });

    /* ---------- «Оценить другую идею» ---------- */
    againBtn.addEventListener("click", function () {
      resultSection.hidden = true;
      demoBanner.hidden = true;
      clearFormError();
      clearDescriptionError();
      state.lastResult = null;
      form.reset();
      updateCounter();
      titleInput.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
})();
