# idw-chatbot

A **page-grounded chat assistant** ("Maya") for Indian Destination Wedding couple pages. One `<script>` tag drops the widget onto any couple's page; it reads that page's own text and answers visitor questions using **only** that content — no outside knowledge, no invented dates/prices. Works on every couple page with zero per-page setup.

## Layout

```
idw-chatbot/
├── api/
│   ├── chat.js        ← serverless function (holds the API key, calls the model)
│   └── _rateLimit.js  ← per-IP rate limiting
├── embed.js           ← the chat widget (served at /embed.js)
├── demo.html          ← live sample page (Pepper & MJ) — served at /demo.html
├── maya.jpg           ← the assistant avatar
├── server.js          ← local dev server
└── package.json
```

Static files (`embed.js`, `demo.html`, `maya.jpg`) are served at the site root; `api/*` become serverless functions. No build step.

---

## Deploy to Vercel via GitHub (recommended)

**1. Put this folder in a GitHub repo**

```bash
cd idw-chatbot
git init && git add . && git commit -m "idw-chatbot"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/idw-chatbot.git
git branch -M main && git push -u origin main
```

**2. Import it in Vercel**
- vercel.com → **Add New… → Project → Import Git Repository**
- **Choose the Solender AI team** (top-left scope selector) so the project lives there
- Framework Preset: **Other** · Root Directory: `./` · leave build/output empty
- Click **Deploy**

**3. Add the API key**
- Project → **Settings → Environment Variables** (or **Environments → Production**)
- **Key:** `MOONSHOT_API_KEY`  **Value:** your Kimi key  **Environment:** Production
- Save

**4. Redeploy so the key takes effect**
- **Deployments → ⋯ → Redeploy** (env vars only apply to *new* deployments)

Your bot is now live at `https://<project>.vercel.app` — e.g. `https://idw-chatbot.vercel.app`.
Test it at `…/demo.html`.

> Every future change: `git push` → Vercel redeploys automatically.

---

## Add the bot to a couple's page

Paste once before `</body>` (HubSpot: *Page → Settings → Advanced → Footer HTML*):

```html
<!-- Maya — wedding page assistant -->
<script
  src="https://idw-chatbot.vercel.app/embed.js"
  data-endpoint="https://idw-chatbot.vercel.app/api/chat"
  data-avatar="https://idw-chatbot.vercel.app/maya.jpg"
  defer></script>
```

The header auto-fills each couple's name from their page `<h1>`. Optional per-couple tweaks:
`data-title="…"`, `data-header-color="#b0895f"`, `data-suggestions="Q1|Q2|Q3"`.

---

## Local development

```bash
cd idw-chatbot
MOONSHOT_API_KEY=sk-... npm run dev     # or ANTHROPIC_API_KEY=sk-ant-...
# → http://localhost:3000/demo.html
```

## Configuration (environment variables)

| Variable | Purpose | Default |
|---|---|---|
| `MOONSHOT_API_KEY` | Kimi/Moonshot key (server-side only) | — |
| `ANTHROPIC_API_KEY` | Use Claude instead of Kimi | — |
| `LLM_PROVIDER` | Force `anthropic` or `kimi` | auto (kimi if Moonshot key set) |
| `MOONSHOT_MODEL` | e.g. `kimi-k2.6`, `kimi-k3` | `kimi-k2.6` |
| `MOONSHOT_BASE_URL` | Use `https://api.moonshot.cn/v1` for China | `https://api.moonshot.ai/v1` |
| `ANTHROPIC_MODEL` | Claude model id | `claude-haiku-4-5-20251001` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC` | Per-IP rate limit | `20` / `60` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Distributed rate limiting (optional) | in-memory fallback |

**Never commit your key.** It lives only in Vercel's Environment Variables (and a local, gitignored `.env` for dev).
