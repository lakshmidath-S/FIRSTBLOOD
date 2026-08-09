// Provider-agnostic wrapper around whichever free-tier LLM is configured.
// Callers just call `summarize(promptText)` — swapping GEMINI <-> GROQ is a
// single env var change (LLM_PROVIDER), nothing else in the codebase changes.
//
// Both providers are called with plain `fetch` so no extra SDK dependency is
// needed; keys go in .env (see .env.example) and are never sent to the client.

async function summarizeWithGemini(promptText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function summarizeWithGroq(promptText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: promptText }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function summarize(promptText) {
  const provider = (process.env.LLM_PROVIDER || "groq").toLowerCase();
  if (provider === "gemini") return summarizeWithGemini(promptText);
  if (provider === "groq") return summarizeWithGroq(promptText);
  throw new Error(`Unknown LLM_PROVIDER "${provider}" — use "gemini" or "groq"`);
}

module.exports = { summarize };
