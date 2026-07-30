/* ─────────────────────────────────────────────────────────────
 * page-bot — embeddable chat widget
 *
 * Drop ONE tag on any page:
 *   <script src="https://YOUR-DEPLOY.vercel.app/embed.js"
 *           data-endpoint="https://YOUR-DEPLOY.vercel.app/api/chat"
 *           data-title="Planning a wedding?"
 *           data-accent="#a86d8d"            (header start + user bubbles)
 *           data-accent2="#d3a6c0"           (header gradient end)
 *           data-send-color="#40989a"        (send button)
 *           data-avatar="https://.../maya.jpg"
 *           data-greeting="Hi! I'm Maya 👋 …"
 *           data-suggestions="What are the dates?|Where is it?|How do I book?"
 *           data-timestamps="true"
 *           defer></script>
 *
 * The widget reads THIS page's own text and answers only from it.
 * ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (window.__pageBotLoaded) return;
  window.__pageBotLoaded = true;

  // Default avatar: white figure on a transparent bg, so the brand gradient
  // (set on .pb-avatar) shows through. Overridden by data-avatar (e.g. a photo).
  var DEFAULT_AVATAR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
        "<circle cx='32' cy='24' r='11' fill='white'/>" +
        "<path d='M14 57c0-11 8-19 18-19s18 8 18 19z' fill='white'/></svg>"
    );

  var script = document.currentScript;
  var cfg = Object.assign(
    {
      endpoint: "/api/chat",
      title: "", // empty → auto-derived from the page's own <h1>/<title>
      accent: "#a86d8d", // brand: user bubble + chips (Maya's identity)
      accent2: "", // brand gradient partner (defaults to accent → solid)
      sendColor: "", // send button (defaults to accent)
      headerColor: "", // header start — set to the couple's page color to match it
      headerColor2: "", // header gradient end (defaults to headerColor → solid)
      headerFont: "", // header font — set to the couple's page font to match it
      avatar: DEFAULT_AVATAR,
      greeting: "Hi! 👋 I can answer questions about this page. What would you like to know?",
      suggestions: "",
      timestamps: true,
      contentSelector: "", // optional CSS selector to scope the source text
    },
    (window.PageBotConfig || {})
  );
  if (script) {
    var d = script.dataset;
    if (d.endpoint) cfg.endpoint = d.endpoint;
    if (d.title) cfg.title = d.title;
    if (d.accent) cfg.accent = d.accent;
    if (d.accent2) cfg.accent2 = d.accent2;
    if (d.sendColor) cfg.sendColor = d.sendColor;
    if (d.headerColor) cfg.headerColor = d.headerColor;
    if (d.headerColor2) cfg.headerColor2 = d.headerColor2;
    if (d.headerFont) cfg.headerFont = d.headerFont;
    if (d.avatar) cfg.avatar = d.avatar;
    if (d.greeting) cfg.greeting = d.greeting;
    if (d.suggestions) cfg.suggestions = d.suggestions;
    if (d.timestamps) cfg.timestamps = d.timestamps;
    if (d.contentSelector) cfg.contentSelector = d.contentSelector;
  }
  // Normalize
  cfg.accent2 = cfg.accent2 || cfg.accent;
  cfg.sendColor = cfg.sendColor || cfg.accent;
  // Header defaults to the brand gradient; override to match the couple's page.
  cfg.headerColor = cfg.headerColor || cfg.accent;
  cfg.headerColor2 = cfg.headerColor2 || cfg.headerColor;
  cfg.headerFont = cfg.headerFont || "inherit";
  cfg.timestamps = String(cfg.timestamps) !== "false";
  if (cfg.avatar === "none") cfg.avatar = "";

  var WIDGET_ID = "page-bot-root";
  var history = []; // {role, content}
  var pageText = "";
  var sending = false;

  // ── Extract the page's own text (the bot's only knowledge source) ──
  function extractPageText() {
    var el = null;
    if (cfg.contentSelector) el = document.querySelector(cfg.contentSelector);
    if (!el) el = document.querySelector("main, article, [role=main]");
    if (!el) el = document.body;

    var clone = el.cloneNode(true);
    clone
      .querySelectorAll("script, style, noscript, svg, #" + WIDGET_ID + ", nav, footer")
      .forEach(function (n) {
        n.remove();
      });
    var text = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

    var title = document.title || "";
    var meta = document.querySelector('meta[name="description"]');
    var desc = meta ? meta.getAttribute("content") || "" : "";
    var header = [title, desc].filter(Boolean).join(" — ");
    return (header ? header + "\n\n" : "") + text;
  }

  // ── Minimal, SAFE markdown → HTML (escape first, then limited formatting) ──
  function render(md) {
    var html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, t, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + "</a>";
    });
    html = html.replace(/(^|[\s(])((https?:\/\/)[^\s)]+)/g, function (_, pre, u) {
      return pre + '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>";
    });
    html = html.replace(/([\w.+-]+@[\w.-]+\.\w+)/g, '<a href="mailto:$1">$1</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/(?:^|\n)[-*] (.+)/g, function (_, item) {
      return "\n<li>" + item + "</li>";
    });
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>").replace(/<\/ul>\s*<ul>/g, "");
    html = html.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    html = html.replace(/<br>\s*(<ul>|<li>|<\/li>|<\/ul>)/g, "$1");
    return html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ── Timestamp like "Jul 17, 05:37 pm" ──
  function timeStr() {
    var mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var dt = new Date();
    var h = dt.getHours();
    var m = dt.getMinutes();
    var ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return (
      mon[dt.getMonth()] + " " + dt.getDate() + ", " +
      (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + " " + ampm
    );
  }

  // ── Auto-derive the header title from the couple's own page ──
  function deriveTitle() {
    var h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    var t = (document.title || "").split(/\s[|–—-]\s/)[0].trim();
    return t || "Ask about this page";
  }

  // ── Styles ──
  function injectStyles() {
    var css = `
#${WIDGET_ID}{position:fixed;bottom:20px;right:20px;z-index:2147483000;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
#${WIDGET_ID} *{box-sizing:border-box;}
#pb-toggle{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;
  background:linear-gradient(135deg,var(--pb-accent),var(--pb-accent2));color:#fff;
  box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;
  transition:transform .15s ease;}
#pb-toggle:hover{transform:scale(1.06);}
#pb-toggle svg{width:28px;height:28px;}
#pb-panel{position:absolute;bottom:76px;right:0;width:380px;max-width:calc(100vw - 32px);
  height:580px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;
  box-shadow:0 12px 48px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;}
#pb-panel.open{display:flex;animation:pb-in .18s ease;}
@keyframes pb-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
#pb-header{background:linear-gradient(100deg,var(--pb-header-a),var(--pb-header-b));color:#fff;
  padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;}
.pb-head-left{display:flex;align-items:center;gap:11px;min-width:0;}
.pb-head-avatar{width:42px;height:42px;border-radius:50%;flex-shrink:0;object-fit:cover;
  border:2px solid rgba(255,255,255,.65);
  background:linear-gradient(135deg,var(--pb-accent),var(--pb-accent2));}
#pb-header h3{margin:0;font-size:16px;font-weight:600;line-height:1.3;
  font-family:var(--pb-header-font);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#pb-close{background:none;border:none;color:#fff;cursor:pointer;line-height:0;opacity:.9;
  padding:4px;flex-shrink:0;}
#pb-close:hover{opacity:1;}
#pb-close svg{width:22px;height:22px;}
#pb-body{flex:1;overflow-y:auto;padding:16px;background:#fbfafb;}
.pb-msg{margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;}
.pb-msg.user{justify-content:flex-end;}
.pb-avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;
  background:linear-gradient(135deg,var(--pb-accent),var(--pb-accent2));}
.pb-bubble{max-width:80%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;
  word-wrap:break-word;}
.pb-msg.bot .pb-bubble{background:#f1f0f3;color:#2b2b2b;border-bottom-left-radius:4px;}
.pb-msg.user .pb-bubble{background:var(--pb-accent);color:#fff;border-bottom-right-radius:4px;}
.pb-bubble a{color:inherit;text-decoration:underline;}
.pb-msg.bot .pb-bubble a{color:var(--pb-accent);}
.pb-bubble ul{margin:6px 0;padding-left:18px;}
.pb-bubble li{margin:2px 0;}
.pb-time{font-size:10.5px;opacity:.6;margin-top:5px;text-align:right;}
#pb-suggest{padding:0 16px 8px;display:flex;flex-wrap:wrap;gap:6px;background:#fbfafb;}
.pb-chip{background:#fff;border:1px solid var(--pb-accent);color:var(--pb-accent);
  border-radius:16px;padding:6px 11px;font-size:12.5px;cursor:pointer;transition:.12s;}
.pb-chip:hover{background:var(--pb-accent);color:#fff;}
#pb-input-row{display:flex;padding:12px;gap:8px;border-top:1px solid #eee;background:#fff;
  align-items:flex-end;}
#pb-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:10px 14px;font-size:14px;
  outline:none;resize:none;max-height:96px;font-family:inherit;}
#pb-input:focus{border-color:var(--pb-accent);}
#pb-send{background:var(--pb-send);color:#fff;border:none;border-radius:50%;width:44px;
  height:44px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
#pb-send:disabled{opacity:.5;cursor:default;}
#pb-send svg{width:20px;height:20px;}
.pb-typing{display:flex;gap:4px;padding:4px 2px;}
.pb-typing span{width:7px;height:7px;border-radius:50%;background:#bbb;animation:pb-blink 1.2s infinite;}
.pb-typing span:nth-child(2){animation-delay:.2s;}
.pb-typing span:nth-child(3){animation-delay:.4s;}
@keyframes pb-blink{0%,60%,100%{opacity:.3;}30%{opacity:1;}}
#pb-footer{font-size:10.5px;color:#aaa;text-align:center;padding:6px;background:#fff;}
@media (max-width:480px){#pb-panel{height:calc(100vh - 100px);}}
`;
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Build DOM ──
  function build() {
    var root = document.createElement("div");
    root.id = WIDGET_ID;
    root.style.setProperty("--pb-accent", cfg.accent);
    root.style.setProperty("--pb-accent2", cfg.accent2);
    root.style.setProperty("--pb-send", cfg.sendColor);
    root.style.setProperty("--pb-header-a", cfg.headerColor);
    root.style.setProperty("--pb-header-b", cfg.headerColor2);
    root.style.setProperty("--pb-header-font", cfg.headerFont);

    var chips = cfg.suggestions
      .split("|")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);

    var headAvatar = cfg.avatar
      ? '<img class="pb-head-avatar" src="' + esc(cfg.avatar) + '" alt="">'
      : "";
    var chevron =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

    root.innerHTML =
      '<div id="pb-panel" role="dialog" aria-label="' + esc(cfg.title) + '">' +
      '<div id="pb-header">' +
      '<div class="pb-head-left">' + headAvatar + "<h3>" + esc(cfg.title) + "</h3></div>" +
      '<button id="pb-close" aria-label="Close chat">' + chevron + "</button></div>" +
      '<div id="pb-body" aria-live="polite"></div>' +
      (chips.length ? '<div id="pb-suggest"></div>' : "") +
      '<div id="pb-input-row">' +
      '<textarea id="pb-input" rows="1" placeholder="Type your message…" aria-label="Your message"></textarea>' +
      '<button id="pb-send" aria-label="Send">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>' +
      "</button></div>" +
      '<div id="pb-footer">Answers are based only on this page.</div>' +
      "</div>" +
      '<button id="pb-toggle" aria-label="Open chat">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>' +
      "</button>";

    document.body.appendChild(root);

    if (chips.length) {
      var sug = root.querySelector("#pb-suggest");
      chips.forEach(function (c) {
        var b = document.createElement("button");
        b.className = "pb-chip";
        b.textContent = c;
        b.addEventListener("click", function () {
          send(c);
        });
        sug.appendChild(b);
      });
    }

    root.querySelector("#pb-toggle").addEventListener("click", togglePanel);
    root.querySelector("#pb-close").addEventListener("click", togglePanel);
    root.querySelector("#pb-send").addEventListener("click", function () {
      send();
    });
    var input = root.querySelector("#pb-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 96) + "px";
    });
  }

  var opened = false;
  function togglePanel() {
    var panel = document.querySelector("#pb-panel");
    opened = !panel.classList.contains("open");
    panel.classList.toggle("open", opened);
    if (opened) {
      if (history.length === 0) addMsg("bot", cfg.greeting);
      document.querySelector("#pb-input").focus();
    }
  }

  function addMsg(role, text) {
    var body = document.querySelector("#pb-body");
    var wrap = document.createElement("div");
    wrap.className = "pb-msg " + (role === "user" ? "user" : "bot");

    if (role === "bot" && cfg.avatar) {
      var av = document.createElement("img");
      av.className = "pb-avatar";
      av.src = cfg.avatar;
      av.alt = "";
      wrap.appendChild(av);
    }

    var bubble = document.createElement("div");
    bubble.className = "pb-bubble";
    bubble.innerHTML = role === "bot" ? render(text) : esc(text);
    if (cfg.timestamps) {
      var t = document.createElement("div");
      t.className = "pb-time";
      t.textContent = timeStr();
      bubble.appendChild(t);
    }
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  function showTyping() {
    var body = document.querySelector("#pb-body");
    var wrap = document.createElement("div");
    wrap.className = "pb-msg bot";
    wrap.id = "pb-typing-row";
    wrap.innerHTML =
      (cfg.avatar ? '<img class="pb-avatar" src="' + esc(cfg.avatar) + '" alt="">' : "") +
      '<div class="pb-bubble"><div class="pb-typing"><span></span><span></span><span></span></div></div>';
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }
  function hideTyping() {
    var t = document.querySelector("#pb-typing-row");
    if (t) t.remove();
  }

  function send(preset) {
    if (sending) return;
    var input = document.querySelector("#pb-input");
    var q = (preset != null ? preset : input.value).trim();
    if (!q) return;
    input.value = "";
    input.style.height = "auto";

    var sug = document.querySelector("#pb-suggest");
    if (sug) sug.style.display = "none";

    addMsg("user", q);
    history.push({ role: "user", content: q });
    sending = true;
    document.querySelector("#pb-send").disabled = true;
    showTyping();

    fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        pageText: pageText,
        pageTitle: document.title,
        pageUrl: location.href,
        history: history.slice(0, -1),
        currentDate: new Date().toISOString().split("T")[0],
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (res) {
        hideTyping();
        var answer = res.ok
          ? res.d.answer
          : res.d.error || "Sorry, something went wrong. Please try again.";
        addMsg("bot", answer);
        history.push({ role: "assistant", content: answer });
      })
      .catch(function () {
        hideTyping();
        addMsg("bot", "Sorry, I couldn't reach the assistant. Please try again in a moment.");
      })
      .finally(function () {
        sending = false;
        document.querySelector("#pb-send").disabled = false;
        document.querySelector("#pb-input").focus();
      });
  }

  function init() {
    if (!cfg.title) cfg.title = deriveTitle(); // one snippet, per-couple name
    pageText = extractPageText();
    injectStyles();
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
