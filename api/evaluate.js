/**
 * /api/evaluate — серверная функция Vercel (Node.js).
 *
 * Что делает:
 *  1) принимает POST с JSON {title, description, audience, monetization, region};
 *  2) проверяет длину описания (20–2000 символов), остальные поля обрезает до 300;
 *  3) вызывает модель через callModel(system, messages);
 *  4) чистит возможные ```json-обёртки, парсит JSON и валидирует структуру;
 *  5) всегда отвечает JSON: либо результатом оценки, либо {valid:false,error}.
 *
 * Ключ API читается только из process.env и никогда не попадает в клиент.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/* ---------------------------------------------------------
 * Конфигурация модели.
 * Чтобы сменить провайдера, достаточно переписать callModel().
 * ------------------------------------------------------- */
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const CRITERIA = [
  "problem_market",
  "uniqueness",
  "feasibility",
  "monetization",
  "scalability",
  "risks"
];

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const SHORT_FIELD_MAX = 300;

/**
 * Резервная копия системного промпта.
 * Основной текст лежит в prompts/system-evaluate.txt (его можно править без деплоя кода).
 */
const SYSTEM_PROMPT_FALLBACK = `Ты — старший венчурный аналитик. Оцени стартап-идею по шести критериям:
problem_market, uniqueness, feasibility, monetization, scalability, risks (для risks 10 = минимальный риск).
Верни ТОЛЬКО валидный JSON без markdown:
{"valid":true,"idea_title":"...","scores":{"problem_market":{"score":1,"comment":"..."},"uniqueness":{"score":1,"comment":"..."},"feasibility":{"score":1,"comment":"..."},"monetization":{"score":1,"comment":"..."},"scalability":{"score":1,"comment":"..."},"risks":{"score":1,"comment":"..."}},"strengths":["..."],"weaknesses":["..."],"recommendations":["..."],"similar_existing":["..."],"verdict":"..."}
Баллы — целые числа от 1 до 10. Пиши по-русски, кратко и критично.
Если входные данные не являются описанием стартап-идеи, верни {"valid":false,"error":"..."}.`;

/* ---------------------------------------------------------
 * Чтение промпта с диска (с запасным вариантом).
 * ------------------------------------------------------- */
async function readPrompt(fileName) {
  try {
    return await readFile(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch (error) {
    return null;
  }
}

/* ---------------------------------------------------------
 * Единая точка обращения к модели.
 * messages: [{ role: "user" | "assistant", content: string }]
 * Возвращает строку ответа модели.
 * ------------------------------------------------------- */
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
      temperature: 0.3,
      responseMimeType: "application/json",
      maxOutputTokens: 2048
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

/* ---------------------------------------------------------
 * Утилиты: обрезка строк и извлечение JSON.
 * ------------------------------------------------------- */
function shortString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, SHORT_FIELD_MAX);
}

/** Убирает ```json … ``` и вырезает первый JSON-объект из ответа. */
function extractJson(raw) {
  let text = String(raw || "").trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return text;
}

function stringList(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => typeof item === "string" && item.trim() !== "")
    .slice(0, limit)
    .map((item) => item.trim().slice(0, 400));
}

/**
 * Проверяет структуру ответа модели.
 * Возвращает нормализованный объект или null, если структура неверная.
 */
function validateModelResult(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  // Модель может сама сообщить, что входные данные не похожи на идею
  if (data.valid === false) {
    return {
      valid: false,
      error:
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim().slice(0, 400)
          : "Модель не смогла оценить идею. Уточните описание."
    };
  }

  if (!data.scores || typeof data.scores !== "object") {
    return null;
  }

  const scores = {};
  for (const key of CRITERIA) {
    const item = data.scores[key];
    if (!item || typeof item !== "object") {
      return null;
    }

    const rawScore = Number(item.score);
    if (!Number.isFinite(rawScore) || rawScore < 1 || rawScore > 10) {
      return null;
    }

    scores[key] = {
      // Приводим к целому: модель иногда присылает 7.0 или 7.5
      score: Math.min(10, Math.max(1, Math.round(rawScore))),
      comment: typeof item.comment === "string" ? item.comment.trim().slice(0, 600) : ""
    };
  }

  return {
    valid: true,
    idea_title:
      typeof data.idea_title === "string" && data.idea_title.trim()
        ? data.idea_title.trim().slice(0, 120)
        : "Без названия",
    scores,
    strengths: stringList(data.strengths, 6),
    weaknesses: stringList(data.weaknesses, 6),
    recommendations: stringList(data.recommendations, 6),
    similar_existing: stringList(data.similar_existing, 8),
    verdict: typeof data.verdict === "string" ? data.verdict.trim().slice(0, 800) : ""
  };
}

/* ---------------------------------------------------------
 * Обработчик запроса
 * ------------------------------------------------------- */
export default async function handler(req, res) {
  // Только POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ valid: false, error: "Метод не поддерживается. Используйте POST." });
  }

  try {
    // Vercel обычно уже распарсил JSON, но поддержим и строку
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ valid: false, error: "Некорректный JSON в запросе." });
      }
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({ valid: false, error: "Пустой запрос." });
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (description.length < DESCRIPTION_MIN) {
      return res.status(400).json({
        valid: false,
        error: `Описание слишком короткое: минимум ${DESCRIPTION_MIN} символов.`
      });
    }
    if (description.length > DESCRIPTION_MAX) {
      return res.status(400).json({
        valid: false,
        error: `Описание слишком длинное: максимум ${DESCRIPTION_MAX} символов.`
      });
    }

    const payload = {
      title: shortString(body.title),
      audience: shortString(body.audience),
      monetization: shortString(body.monetization),
      region: shortString(body.region)
    };

    // Собираем сообщение для модели: пустые поля не отправляем
    const userMessage = [
      payload.title ? `Название: ${payload.title}` : null,
      `Описание идеи: ${description}`,
      payload.audience ? `Целевая аудитория: ${payload.audience}` : null,
      payload.monetization ? `Монетизация: ${payload.monetization}` : null,
      payload.region ? `Страна/регион: ${payload.region}` : null
    ]
      .filter(Boolean)
      .join("\n");

    const system = (await readPrompt("system-evaluate.txt")) || SYSTEM_PROMPT_FALLBACK;

    let raw;
    try {
      raw = await callModel(system, [{ role: "user", content: userMessage }]);
    } catch (modelError) {
      console.error("evaluate: model call failed", modelError.message);
      return res.status(502).json({
        valid: false,
        error: "AI-сервис временно недоступен. Попробуйте ещё раз через минуту."
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (parseError) {
      console.error("evaluate: invalid JSON from model");
      return res.status(502).json({
        valid: false,
        error: "Модель вернула ответ в неверном формате. Попробуйте переформулировать идею."
      });
    }

    const result = validateModelResult(parsed);
    if (!result) {
      return res.status(502).json({
        valid: false,
        error: "Модель вернула неполную оценку. Попробуйте ещё раз."
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("evaluate: unexpected error", error);
    return res.status(500).json({
      valid: false,
      error: "Внутренняя ошибка сервера. Попробуйте позже."
    });
  }
}
