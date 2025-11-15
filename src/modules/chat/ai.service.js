"use strict";

import fetch from "node-fetch";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const SYSTEM_PROMPT = `Bạn là chatbot FastFood Assistant (FatBot), trợ lý ảo của cửa hàng đồ ăn nhanh FatFood.
Bạn giúp khách hàng đặt món ăn, xem menu, tra cứu đơn hàng, hỏi khuyến mãi, và hỗ trợ giao hàng.
Trả lời bằng tiếng Việt tự nhiên, ngắn gọn, thân thiện, có emoji nhẹ nhàng.
Nếu không chắc chắn, hãy hỏi lại để làm rõ.
Nếu người dùng yêu cầu hành động (đặt hàng, tra cứu đơn, thanh toán), chỉ gợi ý và hướng dẫn, KHÔNG bịa thông tin.
Nếu vượt quá khả năng, đề xuất chuyển nhân viên hỗ trợ.`;

const withTimeout = async (promise, ms = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await promise(controller);
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const callOpenAI = async ({ messages, model = DEFAULT_MODEL, temperature = 0.5, max_tokens = 300 }) => {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await withTimeout((controller) =>
      fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
        signal: controller.signal
      })
    , Number(process.env.OPENAI_TIMEOUT_MS || 15000));

    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (error) {
    return null;
  }
};

const generateAIReply = async ({ userId, text, history = [] }) => {
  if (!OPENAI_API_KEY) return null;
  const msgs = [
    { role: "system", content: SYSTEM_PROMPT }
  ];
  history.slice(-8).forEach((m) => {
    const role = m.sender_role === "user" ? "user" : "assistant";
    msgs.push({ role, content: String(m.body || "").slice(0, 2000) });
  });
  msgs.push({ role: "user", content: String(text || "").slice(0, 2000) });
  return callOpenAI({ messages: msgs });
};

export { generateAIReply };

