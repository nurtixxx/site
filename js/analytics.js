/**
 * analytics.js — динамическая таблица проверки достоверности и графики.
 *
 * Возможности:
 *  - поиск по названию идеи;
 *  - фильтры по реальному исходу и сектору;
 *  - сортировка по клику на заголовок колонки (по возрастанию/убыванию);
 *  - вычисляемая колонка «разброс» = max(run1..run3) − min(run1..run3);
 *  - строка средних значений;
 *  - подсветка строк, где оценка ИИ противоречит реальному исходу;
 *  - два столбчатых графика Chart.js, перестраиваются под текущий фильтр.
 *
 * Все данные вставляются через textContent.
 */
(function () {
  "use strict";

  var OUTCOME_CLASS = {
    "успех": "badge-success",
    "провал": "badge-danger",
    "неоднозначно": "badge-warn"
  };

  var state = {
    rows: [],
    query: "",
    outcome: "ALL",
    sector: "ALL",
    sortKey: "ai_score",
    sortDir: "desc",
    charts: { score: null, spread: null }
  };

  function $(id) {
    return document.getElementById(id);
  }

  /** Число с одним знаком после запятой (для баллов). */
  function fmt(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "—";
  }

  /** Разброс между тремя запусками. */
  function spreadOf(row) {
    var runs = [row.run1, row.run2, row.run3].filter(function (value) {
      return Number.isFinite(value);
    });
    if (runs.length === 0) {
      return null;
    }
    return Math.max.apply(null, runs) - Math.min.apply(null, runs);
  }

  /**
   * Противоречие «оценка ИИ vs реальный исход»:
   *  - провал, но балл высокий (≥ 7);
   *  - успех, но балл низкий (< 5).
   */
  function isContradiction(row) {
    if (row.real_outcome === "провал" && row.ai_score >= 7) {
      return true;
    }
    if (row.real_outcome === "успех" && row.ai_score < 5) {
      return true;
    }
    return false;
  }

  /** Читаем CSS-переменные, чтобы графики совпадали с темой. */
  function themeColors() {
    var styles = window.getComputedStyle(document.documentElement);
    function read(name, fallback) {
      var value = styles.getPropertyValue(name).trim();
      return value || fallback;
    }
    return {
      text: read("--muted", "#5a6478"),
      grid: read("--border", "#e1e5f0"),
      primary: read("--primary", "#4f46e5"),
      success: read("--success", "#166534"),
      warn: read("--warn", "#a35a06"),
      danger: read("--danger", "#b91c1c")
    };
  }

  function scoreColor(score, colors) {
    if (score < 4) {
      return colors.danger;
    }
    if (score < 7) {
      return colors.warn;
    }
    return colors.success;
  }

  /* ---------------------------------------------------------
   * Загрузка данных
   * ------------------------------------------------------- */
  async function loadRows() {
    var response = await fetch("data/validation.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить data/validation.json");
    }
    var raw = await response.json();
    if (!Array.isArray(raw)) {
      throw new Error("Некорректный формат data/validation.json");
    }

    return raw.map(function (item) {
      var row = {
        idea: String(item.idea || "Без названия"),
        sector: String(item.sector || "—"),
        real_outcome: String(item.real_outcome || "неоднозначно"),
        ai_score: Number(item.ai_score),
        run1: Number(item.run1),
        run2: Number(item.run2),
        run3: Number(item.run3),
        comment: String(item.comment || "")
      };
      row.spread = spreadOf(row);
      return row;
    });
  }

  /* ---------------------------------------------------------
   * Фильтрация и сортировка
   * ------------------------------------------------------- */
  function visibleRows() {
    var query = state.query.toLowerCase();

    var filtered = state.rows.filter(function (row) {
      var matchesQuery = query === "" || row.idea.toLowerCase().indexOf(query) !== -1;
      var matchesOutcome = state.outcome === "ALL" || row.real_outcome === state.outcome;
      var matchesSector = state.sector === "ALL" || row.sector === state.sector;
      return matchesQuery && matchesOutcome && matchesSector;
    });

    var key = state.sortKey;
    var dir = state.sortDir === "asc" ? 1 : -1;

    filtered.sort(function (a, b) {
      var left = a[key];
      var right = b[key];

      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right), "ru") * dir;
      }

      if (left === null && right === null) {
        return 0;
      }
      if (left === null) {
        return 1;
      }
      if (right === null) {
        return -1;
      }
      return (left - right) * dir;
    });

    return filtered;
  }

  /* ---------------------------------------------------------
   * Отрисовка таблицы
   * ------------------------------------------------------- */
  function renderTable() {
    var body = $("validation-body");
    var foot = $("validation-foot");
    var rows = visibleRows();

    body.textContent = "";
    foot.textContent = "";

    if (rows.length === 0) {
      var empty = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 9;
      cell.className = "muted";
      cell.textContent = "Ничего не найдено. Измените поиск или фильтры.";
      empty.appendChild(cell);
      body.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      if (isContradiction(row)) {
        tr.className = "row-contradiction";
        tr.title = "Оценка ИИ противоречит реальному исходу";
      }

      // Идея
      var tdIdea = document.createElement("td");
      var strong = document.createElement("strong");
      strong.textContent = row.idea;
      tdIdea.appendChild(strong);

      // Сектор
      var tdSector = document.createElement("td");
      var sectorBadge = document.createElement("span");
      sectorBadge.className = "badge";
      sectorBadge.textContent = row.sector;
      tdSector.appendChild(sectorBadge);

      // Реальный исход
      var tdOutcome = document.createElement("td");
      var outcomeBadge = document.createElement("span");
      outcomeBadge.className = "badge " + (OUTCOME_CLASS[row.real_outcome] || "");
      outcomeBadge.textContent = row.real_outcome;
      tdOutcome.appendChild(outcomeBadge);

      // Числовые колонки
      function numericCell(value, extraClass) {
        var td = document.createElement("td");
        td.className = "num" + (extraClass ? " " + extraClass : "");
        td.textContent = fmt(value);
        return td;
      }

      var tdScore = numericCell(row.ai_score);
      var tdRun1 = numericCell(row.run1);
      var tdRun2 = numericCell(row.run2);
      var tdRun3 = numericCell(row.run3);

      var tdSpread = document.createElement("td");
      tdSpread.className = "num";
      if (row.spread !== null) {
        var spreadBadge = document.createElement("span");
        spreadBadge.className = "badge" + (row.spread > 1 ? " badge-warn" : "");
        spreadBadge.textContent = fmt(row.spread);
        tdSpread.appendChild(spreadBadge);
      } else {
        tdSpread.textContent = "—";
      }

      // Комментарий
      var tdComment = document.createElement("td");
      tdComment.className = "muted small";
      tdComment.style.minWidth = "220px";
      tdComment.textContent = row.comment;

      tr.appendChild(tdIdea);
      tr.appendChild(tdSector);
      tr.appendChild(tdOutcome);
      tr.appendChild(tdScore);
      tr.appendChild(tdRun1);
      tr.appendChild(tdRun2);
      tr.appendChild(tdRun3);
      tr.appendChild(tdSpread);
      tr.appendChild(tdComment);
      body.appendChild(tr);
    });

    // Строка средних значений
    function average(key) {
      var values = rows
        .map(function (row) {
          return row[key];
        })
        .filter(function (value) {
          return Number.isFinite(value);
        });
      if (values.length === 0) {
        return null;
      }
      var sum = values.reduce(function (acc, value) {
        return acc + value;
      }, 0);
      return sum / values.length;
    }

    var footRow = document.createElement("tr");

    var label = document.createElement("td");
    label.colSpan = 3;
    label.textContent = "Среднее по выборке (" + rows.length + ")";
    footRow.appendChild(label);

    ["ai_score", "run1", "run2", "run3", "spread"].forEach(function (key) {
      var td = document.createElement("td");
      td.className = "num";
      td.textContent = fmt(average(key));
      footRow.appendChild(td);
    });

    var emptyCell = document.createElement("td");
    footRow.appendChild(emptyCell);

    foot.appendChild(footRow);
  }

  /* ---------------------------------------------------------
   * Графики
   * ------------------------------------------------------- */
  function renderCharts() {
    if (typeof window.Chart === "undefined") {
      return;
    }

    var rows = visibleRows();
    var colors = themeColors();
    var labels = rows.map(function (row) {
      return row.idea;
    });

    if (state.charts.score) {
      state.charts.score.destroy();
      state.charts.score = null;
    }
    if (state.charts.spread) {
      state.charts.spread.destroy();
      state.charts.spread = null;
    }

    var scoreCanvas = $("ai-score-chart");
    if (scoreCanvas) {
      state.charts.score = new window.Chart(scoreCanvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Оценка ИИ",
              data: rows.map(function (row) {
                return row.ai_score;
              }),
              backgroundColor: rows.map(function (row) {
                return scoreColor(row.ai_score, colors);
              }),
              borderRadius: 6,
              maxBarThickness: 26
            }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return "Балл: " + fmt(context.parsed.x) + " / 10";
                }
              }
            }
          },
          scales: {
            x: {
              min: 0,
              max: 10,
              ticks: { color: colors.text },
              grid: { color: colors.grid }
            },
            y: {
              ticks: { color: colors.text },
              grid: { display: false }
            }
          }
        }
      });
    }

    var spreadCanvas = $("spread-chart");
    if (spreadCanvas) {
      var spreads = rows.map(function (row) {
        return row.spread === null ? 0 : row.spread;
      });
      var maxSpread = Math.max.apply(null, spreads.concat([1]));

      state.charts.spread = new window.Chart(spreadCanvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Разброс",
              data: spreads,
              backgroundColor: colors.primary,
              borderRadius: 6,
              maxBarThickness: 26
            }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return "Разброс: " + fmt(context.parsed.x);
                }
              }
            }
          },
          scales: {
            x: {
              min: 0,
              suggestedMax: Math.ceil(maxSpread * 10) / 10,
              ticks: { color: colors.text },
              grid: { color: colors.grid }
            },
            y: {
              ticks: { color: colors.text },
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  /* ---------------------------------------------------------
   * Сортировка по клику на заголовок
   * ------------------------------------------------------- */
  function updateSortIndicators() {
    var headers = document.querySelectorAll("th.sortable");
    Array.prototype.forEach.call(headers, function (th) {
      if (th.getAttribute("data-sort") === state.sortKey) {
        th.setAttribute("aria-sort", state.sortDir === "asc" ? "ascending" : "descending");
        var ind = th.querySelector(".sort-ind");
        if (ind) {
          ind.textContent = state.sortDir === "asc" ? "↑" : "↓";
        }
      } else {
        th.setAttribute("aria-sort", "none");
        var other = th.querySelector(".sort-ind");
        if (other) {
          other.textContent = "↕";
        }
      }
    });
  }

  function setupSorting() {
    var headers = document.querySelectorAll("th.sortable");
    Array.prototype.forEach.call(headers, function (th) {
      function toggleSort() {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "idea" || key === "sector" || key === "real_outcome" ? "asc" : "desc";
        }
        updateSortIndicators();
        renderTable();
        renderCharts();
      }

      th.addEventListener("click", toggleSort);
      th.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSort();
        }
      });
      // Делаем заголовок доступным с клавиатуры, сохраняя семантику columnheader
      th.setAttribute("tabindex", "0");
    });
  }

  /* ---------------------------------------------------------
   * Инициализация
   * ------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async function () {
    var searchInput = $("search-input");
    var outcomeFilter = $("outcome-filter");
    var sectorFilter = $("sector-filter");
    var resetBtn = $("reset-filters");

    try {
      state.rows = await loadRows();
    } catch (error) {
      var body = $("validation-body");
      body.textContent = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 9;
      td.className = "muted";
      td.textContent =
        "Не удалось загрузить data/validation.json. Откройте сайт через локальный сервер " +
        "или проверьте, что файл существует.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    // Заполняем список секторов из данных
    var sectors = state.rows
      .map(function (row) {
        return row.sector;
      })
      .filter(function (sector, index, list) {
        return list.indexOf(sector) === index;
      })
      .sort(function (a, b) {
        return a.localeCompare(b, "ru");
      });

    sectors.forEach(function (sector) {
      var option = document.createElement("option");
      option.value = sector;
      option.textContent = sector;
      sectorFilter.appendChild(option);
    });

    searchInput.addEventListener("input", function () {
      state.query = searchInput.value.trim();
      renderTable();
      renderCharts();
    });

    outcomeFilter.addEventListener("change", function () {
      state.outcome = outcomeFilter.value;
      renderTable();
      renderCharts();
    });

    sectorFilter.addEventListener("change", function () {
      state.sector = sectorFilter.value;
      renderTable();
      renderCharts();
    });

    resetBtn.addEventListener("click", function () {
      state.query = "";
      state.outcome = "ALL";
      state.sector = "ALL";
      searchInput.value = "";
      outcomeFilter.value = "ALL";
      sectorFilter.value = "ALL";
      renderTable();
      renderCharts();
    });

    setupSorting();
    updateSortIndicators();
    renderTable();
    renderCharts();
  });
})();
