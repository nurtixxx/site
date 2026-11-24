/**
 * /api/chat — серверная функция Vercel (Node.js) для чат-бота «Ментор стартапов».
 *
 * Принимает POST { messages: [{ role, content }] }:
 *  - не больше 10 сообщений;
 *  - каждое сообщение — строка до 1000 символов;
 *  - допустимые роли: user и assistant (всё остальное отбрасывается).
 *
 * Возвращает { reply: "..." } либо { error: "..." }.
 * Ключ модели хранится только в переменных окружения.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Резервная копия системного промпта.
 * Основной текст — prompts/system-mentor.txt.
 */
const SYSTEM_PROMPT_FALLBACK = `Ты — дружелюбный ментор стартапов для студентов. Отвечай кратко, на русском,
по делу: валидация идеи, MVP, монетизация, первые клиенты, юнит-экономика.
Не обещай успех, не выставляй оценки в баллах, задавай уточняющий вопрос, если данных мало.
Вежливо отказывайся от вопросов не по теме (код за пользователя, другие предметы, юристы, медицина, политика, 18+).`;

async function readPrompt(fileName) {
  try {
    return await readFile(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch (error) {
    return null;
  }
}

/**
 * Единая точка обращения к модели.
 * Чтобы сменить провайдера, перепишите только эту функцию.
 */
async function callModel(system, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    })),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 900
    }
  };

  const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Model API error ${response.status}: ${details.slice(0, 300)}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Model returned an empty response");
  }
  return text;
}

/** Приводит историю к безопасному виду. */
function sanitizeMessages(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const cleaned = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    const content = typeof item.content === "string" ? item.content.trim() : "";

    if (!role || !content) {
      continue;
    }
    cleaned.push({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) });
  }

  // Оставляем только последние MAX_MESSAGES сообщений
  return cleaned.slice(-MAX_MESSAGES);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Метод не поддерживается. Используйте POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ error: "Некорректный JSON в запросе." });
      }
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Пустой запрос." });
    }

    const messages = sanitizeMessages(body.messages);
    const hasUserMessage = messages.some((message) => message.role === "user");

    if (!hasUserMessage) {
      return res.status(400).json({ error: "Добавьте хотя бы один вопрос ментору." });
    }

    const system = (await readPrompt("system-mentor.txt")) || SYSTEM_PROMPT_FALLBACK;

    let reply;
    try {
      reply = await callModel(system, messages);
    } catch (modelError) {
      console.error("chat: model call failed", modelError.message);
      return res.status(502).json({ error: "AI-сервис временно недоступен. Попробуйте позже." });
    }

    return res.status(200).json({ reply: reply.slice(0, 4000) });
  } catch (error) {
    console.error("chat: unexpected error", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуйте позже." });
  }
}
