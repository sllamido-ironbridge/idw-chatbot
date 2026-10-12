export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) return res.status(200).json({ error: "MOONSHOT_API_KEY not set" });

  const resp = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "moonshot-v1-8k", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
  });
  const body = await resp.text();
  return res.status(200).json({ status: resp.status, body });
}
