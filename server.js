// ─────────────────────────────────────────────────────────────
// idw-chatbot — local dev server
// Serves the static files at the repo root and exposes POST /api/chat,
// reusing the exact same generateAnswer() the Vercel function uses.
//
//   MOONSHOT_API_KEY=sk-... npm run dev     (Kimi)
//   ANTHROPIC_API_KEY=sk-ant-... npm run dev (Claude)
//   → open http://localhost:3000/demo.html
// ─────────────────────────────────────────────────────────────
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAnswer, PROVIDER, PROVIDERS } from "./api/chat.js";
import { checkRateLimit, getClientIp } from "./api/_rateLimit.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png" };

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", ...cors() });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/chat") {
    if (req.method === "OPTIONS") return res.writeHead(204, cors()).end();
    if (req.method !== "POST") return res.writeHead(405).end();
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      try {
        const rl = await checkRateLimit(getClientIp(req));
        if (!rl.allowed) {
          res.setHeader("Retry-After", String(rl.retryAfter));
          return json(res, 429, { error: "You're sending messages a bit too fast. Please wait a moment and try again." });
        }
        const body = JSON.parse(raw || "{}");
        if (!body.question || !String(body.question).trim()) return json(res, 400, { error: "Missing 'question'." });
        json(res, 200, { answer: await generateAnswer(body) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.userMessage || "Server error." });
      }
    });
    return;
  }

  // static from repo root (block /api and dotfiles)
  let file = url.pathname === "/" ? "/demo.html" : url.pathname;
  const full = path.join(ROOT, path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
  if (!full.startsWith(ROOT) || full.includes(`${path.sep}api${path.sep}`)) return res.writeHead(404).end("Not found");
  fs.readFile(full, (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const active = PROVIDERS[PROVIDER] || PROVIDERS.anthropic;
  console.log(`idw-chatbot dev server → http://localhost:${PORT}/demo.html`);
  console.log(`   provider: ${PROVIDER} (model: ${active.model})`);
  if (active.keyEnv && !process.env[active.keyEnv])
    console.warn(`⚠  ${active.keyEnv} not set — the bot will return a config error.`);
});
