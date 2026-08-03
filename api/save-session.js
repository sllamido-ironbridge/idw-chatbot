// ─────────────────────────────────────────────────────────────
// save-session — email transcript to coordinator via Resend
// POST { history, pageTitle, pageUrl, currentDate }
// ─────────────────────────────────────────────────────────────

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const TRANSCRIPT_TO   = process.env.TRANSCRIPT_EMAIL || "shan.llamido@solender.ai";
const TRANSCRIPT_FROM = process.env.TRANSCRIPT_FROM  || "Maya at IDW <onboarding@resend.dev>";

// ── helpers ──────────────────────────────────────────────────

function extractGuestName(history) {
  for (const m of history) {
    if (m.role !== "user") continue;
    const match = m.content.match(/(?:my name is|i[''`]?m|i am|call me)\s+([A-Z][a-z]+)/i);
    if (match) return match[1];
  }
  return null;
}

function extractTopics(history) {
  const text = history.map((m) => m.content).join(" ").toLowerCase();
  const topics = [];
  if (/\b(room|rate|price|cost|per night|stay|suite|occupan|double|triple|quad)\b/.test(text)) topics.push("Room pricing & accommodations");
  if (/\b(transfer|airport|flight|arriv|departure|cun)\b/.test(text)) topics.push("Airport transfers");
  if (/\b(insurance|coverage|cancel|protect)\b/.test(text)) topics.push("Travel insurance");
  if (/\b(book|reserv|form|block|submit)\b/.test(text)) topics.push("Booking process");
  if (/\b(schedul|event|cerem|dinner|reception|baraat|mehndi|sangeet)\b/.test(text)) topics.push("Event schedule");
  if (/\b(child|daughter|son|kid|infant|age)\b/.test(text)) topics.push("Child rates");
  if (/\b(resort credit|spa|excursion|tour)\b/.test(text)) topics.push("Resort credits & activities");
  return topics.length ? topics : ["General wedding information"];
}

function buildEmailHtml({ history, pageTitle, pageUrl, currentDate, guestName, topics }) {
  const coupleLabel = pageTitle || "Couple Page";
  const dateLabel   = currentDate || new Date().toISOString().split("T")[0];
  const exchanges   = history.filter((m) => m.role === "user").length;

  const topicRows = topics
    .map((t) => `<tr><td style="padding:4px 0 4px 0;font-family:Arial,sans-serif;font-size:14px;color:#3A2E28;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B89A5C;margin-right:10px;vertical-align:middle;"></span>${t}</td></tr>`)
    .join("");

  const transcriptRows = history
    .map((m) => {
      const isGuest = m.role === "user";
      const label   = isGuest ? (guestName || "Guest") : "Maya";
      const bgColor = isGuest ? "#EDE4E8" : "#F7F4EF";
      const nameColor = isGuest ? "#9B7B8A" : "#B89A5C";
      // convert **bold** and newlines for email
      const content = (m.content || "")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      return `
        <tr>
          <td style="padding:10px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 5px 0;font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                  letter-spacing:.1em;text-transform:uppercase;color:${nameColor};">${label}</td>
              </tr>
              <tr>
                <td style="background:${bgColor};border-radius:8px;padding:12px 16px;
                  font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A2E28;">
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0EBE4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0EBE4;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="background:linear-gradient(135deg,#B89A5C 0%,#8A6E3E 100%);
          border-radius:10px 10px 0 0;padding:36px 40px;text-align:center;">
          <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;
            letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.65);">
            Indian Destination Wedding
          </p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;
            font-weight:normal;color:#FFFFFF;line-height:1.25;">${coupleLabel}</h1>
          <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:13px;
            color:rgba(255,255,255,.75);">Chat Transcript · ${dateLabel}</p>
        </td>
      </tr>

      <!-- SUMMARY CARD -->
      <tr>
        <td style="background:#FFFFFF;padding:28px 40px;border-bottom:1px solid #EDE9E4;">
          <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;
            letter-spacing:.15em;text-transform:uppercase;color:#9B7B8A;">
            Session Summary
          </p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:#7A6A62;padding-right:24px;">
                Guest${guestName ? ` &mdash; <strong style="color:#3A2E28;">${guestName}</strong>` : ""}
              </td>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:#7A6A62;padding-right:24px;">
                ${exchanges} ${exchanges === 1 ? "question" : "questions"}
              </td>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:#7A6A62;">
                <a href="${pageUrl || "#"}" style="color:#B89A5C;text-decoration:none;">View page</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:.1em;color:#7A6A62;">Topics discussed</p>
          <table cellpadding="0" cellspacing="0" border="0">${topicRows}</table>
        </td>
      </tr>

      <!-- TRANSCRIPT -->
      <tr>
        <td style="background:#FDFCFA;padding:28px 40px;border-bottom:1px solid #EDE9E4;">
          <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;
            letter-spacing:.15em;text-transform:uppercase;color:#9B7B8A;">
            Full Transcript
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${transcriptRows}
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:#1E1A18;border-radius:0 0 10px 10px;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#6B6360;">
            Sent by <strong style="color:#B89A5C;">Maya</strong> &middot; Solender AI &middot; ${dateLabel}
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "Transcript email is not configured yet." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { history = [], pageTitle, pageUrl, currentDate } = body;

    if (!history.length) return res.status(400).json({ error: "No conversation to send." });

    const guestName = extractGuestName(history);
    const topics    = extractTopics(history);
    const html      = buildEmailHtml({ history, pageTitle, pageUrl, currentDate, guestName, topics });

    const subject = `Chat Transcript — ${pageTitle || "IDW Guest"} · ${currentDate || new Date().toISOString().split("T")[0]}`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: TRANSCRIPT_FROM, to: [TRANSCRIPT_TO], subject, html }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      return res.status(502).json({ error: "Could not send email. Please try again." });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error." });
  }
}
