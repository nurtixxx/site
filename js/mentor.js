/**
 * mentor.js — чат с AI-ментором.
 *
 *  - история хранится только в памяти страницы (последние 10 сообщений);
 *  - Enter отправляет, Shift+Enter делает перенос строки;
 *  - во время запроса показывается индикатор «печатает…»;
 *  - ошибки сети не «ломают» интерфейс, а превращаются в вежливое сообщение.
 *
 * Текст сообщений выводится через textContent — innerHTML не используется.
 */
(function () {
  "use strict";

  var MAX_HISTORY = 10;
  var GREETING =
    "Привет! Я ментор по стартапам. Помогу разобраться с валидацией идеи, MVP, " +
    "монетизацией и первыми клиентами. С чего начнём?";

  var state = {
    history: [],
    pending: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var log = $("chat-log");
    var form = $("chat-form");
    var input = $("chat-input");
    var sendBtn = $("send-btn");
    var clearBtn = $("clear-chat");
    var quickButtons = document.querySelectorAll(".quick-btn");

    /* ---------- Вспомогательные функции ---------- */
    function scrollToBottom() {
      log.scrollTop = log.scrollHeight;
    }

    /** Добавляет сообщение в ленту. kind: "bot" | "user" | "error". */
    function appendMessage(text, kind) {
      var bubble = document.createElement("div");
      bubble.className = "msg " + (kind === "user" ? "msg-user" : kind === "error" ? "msg-error" : "msg-bot");
      bubble.textContent = text;
      log.appendChild(bubble);
      scrollToBottom();
      return bubble;
    }

    function showTyping() {
      var typing = document.createElement("div");
      typing.className = "typing";
      typing.setAttribute("aria-label", "Ментор печатает");
      typing.innerHTML = "<span></span><span></span><span></span>";
      log.appendChild(typing);
      scrollToBottom();
      return typing;
    }

    function setPending(isPending) {
      state.pending = isPending;
      sendBtn.disabled = isPending;
      sendBtn.textContent = isPending ? "Ждём…" : "Отправить";
    }

    function resetChat() {
      log.textContent = "";
      state.history = [];
      appendMessage(GREETING, "bot");
      input.value = "";
      autoResize();
      input.focus();
    }

    function autoResize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
    }

    /* ---------- Отправка сообщения ---------- */
    async function sendMessage(rawText) {
      var text = String(rawText || "").trim();
      if (!text || state.pending) {
        return;
      }

      appendMessage(text, "user");
      input.value = "";
      autoResize();

      // В историю попадает только текст сообщения, без системных пометок
      state.history.push({ role: "user", content: text });
      if (state.history.length > MAX_HISTORY) {
        state.history = state.history.slice(-MAX_HISTORY);
      }

      setPending(true);
      var typing = showTyping();

      try {
        var response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: state.history.slice(-MAX_HISTORY) })
        });

        if (!response.ok) {
          throw new Error("server");
        }

        var data = await response.json();
        var reply = data && typeof data.reply === "string" ? data.reply.trim() : "";

        typing.remove();

        if (!reply) {
          appendMessage(
            "Ментор не смог сформулировать ответ. Попробуйте переформулировать вопрос.",
            "error"
          );
          return;
        }

        appendMessage(reply, "bot");
        state.history.push({ role: "assistant", content: reply });
        if (state.history.length > MAX_HISTORY) {
          state.history = state.history.slice(-MAX_HISTORY);
        }
      } catch (error) {
        typing.remove();
        appendMessage(
          "Извините, не получилось связаться с ментором. Проверьте соединение и попробуйте ещё раз.",
          "error"
        );
      } finally {
        setPending(false);
        input.focus();
      }
    }

    /* ---------- Обработчики ---------- */
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMessage(input.value);
    });

    input.addEventListener("keydown", function (event) {
      // Enter без Shift — отправка; Shift+Enter — обычный перенос строки
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage(input.value);
      }
    });

    input.addEventListener("input", autoResize);

    clearBtn.addEventListener("click", function () {
      resetChat();
    });

    Array.prototype.forEach.call(quickButtons, function (button) {
      button.addEventListener("click", function () {
        sendMessage(button.getAttribute("data-question") || button.textContent);
      });
    });

    // Стартовое состояние
    resetChat();
  });
})();
