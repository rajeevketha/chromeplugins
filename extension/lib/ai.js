/** Optional OpenAI-compatible chat completion. Never send session IDs or cookies. */

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function getAiSettings() {
  const data = await chrome.storage.local.get({
    aiEnabled: false,
    aiApiKey: "",
    aiBaseUrl: DEFAULT_BASE,
    aiModel: DEFAULT_MODEL
  });
  return data;
}

export async function isAiReady() {
  const s = await getAiSettings();
  return Boolean(s.aiEnabled && s.aiApiKey?.trim());
}

/**
 * @param {string} system
 * @param {string} user
 * @returns {Promise<string>}
 */
export async function aiComplete(system, user) {
  const s = await getAiSettings();
  if (!s.aiEnabled || !s.aiApiKey?.trim()) {
    throw new Error("AI is not configured. Add an API key in Settings, or use the offline engine.");
  }

  // Security: never include sid / cookies / auth headers in prompts.
  const scrubbed = String(user).replace(/\bsid=[^;\s]+/gi, "sid=REDACTED");

  const base = (s.aiBaseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.aiApiKey.trim()}`
    },
    body: JSON.stringify({
      model: s.aiModel || DEFAULT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: scrubbed }
      ]
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `AI HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty AI response");
  return text.trim();
}

export function stripCodeFence(text) {
  return String(text)
    .replace(/^```(?:soql|sql|apex|text|formula)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}
