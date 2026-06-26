/* ============================================================================
   English Mastered — AI level-check grader + results emailer (Cloudflare Worker)
   ----------------------------------------------------------------------------
   One Worker, two jobs, split by URL path:

     POST  /        → GRADE one open-ended answer with AI (STRICT rubric).
                      In:  { question, target, answer }
                      Out: { result, model, prompt, modelText }
                      (Returns the exact prompt Haiku received and its raw
                       reply, so the results email can show the full flow.)

     POST  /email   → SEND results via Resend: a CLEAN copy to the student and
                      a FULL-DETAIL copy to you/Jana.
%
   The API key stays server-side; only englishmastered.org may call this Worker;
   both paths share daily caps so nothing runs away.

   ----------------------------------------------------------------------------
   WHERE THIS LIVES (so you can edit it):
     Cloudflare dashboard → dash.cloudflare.com → Workers & Pages → em-grader
     → Edit code → paste this whole file → Deploy.
     Public URL: https://em-grader.c-col-peterson-me.workers.dev
     The Anthropic API key is the ANTHROPIC_API_KEY *secret* on this Worker
     (managed in Cloudflare, not in this file). KV namespace em_grader_counter
     is bound as GRADER_KV for the daily caps.

   ----------------------------------------------------------------------------
   TO TUNE GRADING STRICTNESS: edit buildGradingPrompt() below. That single
   function is the entire grading brain — change the rubric, Deploy, done.
   ----------------------------------------------------------------------------
   FILL-IN before the /email feature works (search "FILL-IN"):
     1. OWNER_EMAILS   — where the full-detail copy goes (you / Jana).
     2. FROM_ADDRESS   — must be on a domain verified in Resend.
     3. RESEND_API_KEY — added as a Worker SECRET (Settings → Variables and
        Secrets → Add → Secret), not written in this file.
   (Resend setup: resend.com → add domain englishmastered.org → add the DNS
    records it shows you at Porkbun → wait for "Verified" → create an API key.)
   ============================================================================ */

// ----- Settings you can tweak -------------------------------------------------
const DAILY_LIMIT       = 200;                 // max AI gradings per day (UTC)
const EMAIL_DAILY_LIMIT = 150;                 // max result-emails per day (UTC)
const GRADER_MODEL      = "claude-haiku-4-5";  // cheap + fast for binary grading

// FILL-IN #1 — full-detail copy goes here. Hardcoded so the website can never
// tell the Worker who to send to.
const OWNER_EMAILS = ["REPLACE-ME@englishmastered.org"];

// FILL-IN #2 — the "from" line. The DOMAIN must be verified in Resend.
const FROM_ADDRESS = "English Mastered <results@englishmastered.org>";

// Replies to the student copy go here; replies to YOUR copy go to the student.
const STUDENT_REPLY_TO = "jana@englishmastered.org";

const ALLOWED_ORIGINS = [
  "https://englishmastered.org",
  "https://www.englishmastered.org",
];
// -----------------------------------------------------------------------------

/* ===========================================================================
   THE GRADING PROMPT  —  this is where "stricter" lives.
   Haiku must reply with exactly one word: CORRECT or INCORRECT. Keep that last
   line intact (the website parses a single word). Everything above it is the
   rubric — tighten or loosen it freely.
   =========================================================================== */
function buildGradingPrompt(question, target, answer) {
  return [
    "You are a STRICT English placement examiner grading one short written answer.",
    "Be demanding: this score decides a student's study level, so do not give the",
    "benefit of the doubt.",
    "",
    'Question shown to the student:',
    '"' + question + '"',
    "",
    "To count as CORRECT, the answer must be: " + target + ".",
    "",
    'The student wrote:',
    '"' + answer + '"',
    "",
    "Grading rules — apply strictly:",
    "1. The answer MUST actually contain the specific grammatical structure named",
    "   above. If that structure is missing, incomplete, or malformed, mark",
    "   INCORRECT — even if the sentence is otherwise understandable.",
    "2. It must be a complete, grammatical sentence that genuinely answers the",
    "   question. Mark INCORRECT if it is off-topic, a sentence fragment, a",
    "   non-answer, gibberish, empty, or just echoes/repeats the prompt.",
    "3. Ignore ONLY trivial slips: capitalization, basic punctuation, and obvious",
    "   single-letter typos. Do NOT excuse real grammar errors in the target",
    "   structure itself — wrong tense, wrong verb form, missing auxiliary, or",
    "   wrong word order all make it INCORRECT.",
    "4. If you are genuinely unsure, default to INCORRECT.",
    "",
    "Reply with ONLY one word: CORRECT or INCORRECT.",
  ].join("\n");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: cors });

    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/email") return await handleEmail(request, env, cors);
      return await handleGrade(request, env, cors);
    } catch (e) {
      // ERROR → the website falls back to its local check, so a hiccup never
      // blocks a student.
      return Response.json({ result: "ERROR", error: String(e && e.message || e) }, { status: 200, headers: cors });
    }
  },
};

/* ---------------------------------------------------------------------------
   GRADE  (POST /)
--------------------------------------------------------------------------- */
async function handleGrade(request, env, cors) {
  const { question, target, answer } = await request.json();
  if (!answer || !target) {
    return Response.json({ result: "INCORRECT", note: "missing fields" }, { headers: cors });
  }

  const dayKey = "count:" + today();
  const kv = env.GRADER_KV;
  let used = 0;
  if (kv) {
    used = toInt(await kv.get(dayKey));
    if (used >= DAILY_LIMIT) {
      return Response.json({ result: "LIMIT", note: "daily cap reached" }, { headers: cors });
    }
  } else {
    console.warn("GRADER_KV not bound: daily cap is NOT being enforced.");
  }

  const prompt = buildGradingPrompt(question, target, answer);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: GRADER_MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await r.json();
  let text = "";
  if (data && Array.isArray(data.content)) {
    text = data.content.map((b) => (b && b.text ? b.text : "")).join(" ");
  }
  // Read only the FIRST word. The model is told to reply with one word, so this
  // is robust even if it ever adds stray text — and anything that isn't exactly
  // "CORRECT" resolves to INCORRECT, matching the strict-grading default.
  const firstWord = (text || "").trim().toUpperCase().match(/[A-Z]+/);
  const result = (firstWord && firstWord[0] === "CORRECT") ? "CORRECT" : "INCORRECT";

  if (kv) await kv.put(dayKey, String(used + 1), { expirationTtl: 172800 });

  return Response.json(
    { result, model: GRADER_MODEL, prompt, modelText: (text || "").trim() },
    { headers: cors }
  );
}

/* ---------------------------------------------------------------------------
   EMAIL RESULTS  (POST /email)
--------------------------------------------------------------------------- */
async function handleEmail(request, env, cors) {
  if (!env.RESEND_API_KEY) {
    return Response.json({ ok: false, error: "RESEND_API_KEY secret not set on the Worker." }, { status: 200, headers: cors });
  }

  const body = await request.json();
  const student = body.student || {};
  const studentEmail = String(student.email || "").trim();
  const studentName  = String(student.name  || "").trim();
  const result = body.result || {};
  const score  = toInt(body.score);
  const total  = toInt(body.total);
  const transcript = Array.isArray(body.transcript) ? body.transcript : [];

  const wantsStudentCopy = !!studentEmail;
  if (wantsStudentCopy && !isEmail(studentEmail)) {
    return Response.json({ ok: false, error: "That email address doesn't look valid." }, { status: 200, headers: cors });
  }

  const kv = env.GRADER_KV;
  const dayKey = "emailcount:" + today();
  if (kv) {
    const used = toInt(await kv.get(dayKey));
    if (used >= EMAIL_DAILY_LIMIT) {
      return Response.json({ ok: false, error: "Daily email limit reached. Please try again tomorrow." }, { status: 200, headers: cors });
    }
  }

  const level     = String(result.level || "").trim();
  const levelName = String(result.name  || "").trim();
  const blurb     = String(result.blurb || "").trim();

  const ownerHtml   = ownerEmailHtml({ studentName, studentEmail, level, levelName, blurb, score, total, transcript });
  const studentHtml = studentEmailHtml({ studentName, level, levelName, blurb, score, total, transcript });

  const sends = [];
  // outcomes[0] = owner (always), outcomes[1] = student (if requested)
  sends.push(sendViaResend(env, {
    from: FROM_ADDRESS,
    to: OWNER_EMAILS,
    reply_to: isEmail(studentEmail) ? studentEmail : STUDENT_REPLY_TO,
    subject: "Level check: " + (level || "?") + (studentName ? (" — " + studentName) : "") + (studentEmail ? (" (" + studentEmail + ")") : " (no email given)"),
    html: ownerHtml,
  }));
  if (wantsStudentCopy) {
    sends.push(sendViaResend(env, {
      from: FROM_ADDRESS,
      to: [studentEmail],
      reply_to: STUDENT_REPLY_TO,
      subject: "Your English level: " + (level || "your results") + " — English Mastered",
      html: studentHtml,
    }));
  }

  const outcomes = await Promise.all(sends);
  const anyOk = outcomes.some((o) => o.ok);
  if (kv && anyOk) {
    const used = toInt(await kv.get(dayKey));
    await kv.put(dayKey, String(used + 1), { expirationTtl: 172800 });
  }

  return Response.json({
    ok: anyOk,
    ownerSent:   !!outcomes[0] && outcomes[0].ok,
    studentSent: wantsStudentCopy ? (!!outcomes[1] && outcomes[1].ok) : false,
    detail: outcomes.map((o) => ({ ok: o.ok, status: o.status })),
  }, { headers: cors });
}

async function sendViaResend(env, msg) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, reply_to: msg.reply_to }),
    });
    let info = null; try { info = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, info };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}

/* ---------------------------------------------------------------------------
   Email templates
--------------------------------------------------------------------------- */
function studentEmailHtml({ studentName, level, levelName, blurb, score, total, transcript }) {
  const greet = studentName ? ("Hi " + esc(studentName) + ",") : "Hi there,";
  const rows = transcript.map((t) => {
    const mark = t.ok ? "&#10003;" : "&#10007;";
    const color = t.ok ? "#1E97A6" : "#9E472A";
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#555;white-space:nowrap;">' + esc(t.level || "") + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">' + esc(t.q || "") + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">' + esc(t.answer || "") + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:16px;text-align:center;color:' + color + ';font-weight:700;">' + mark + '</td>' +
    '</tr>';
  }).join("");

  return emailShell(
    '<h1 style="margin:0 0 4px;font-size:22px;color:#01426A;">Your English level: ' + esc(level) + '</h1>' +
    '<p style="margin:0 0 18px;color:#666;font-size:15px;">' + esc(levelName) + '</p>' +
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#222;">' + greet + '</p>' +
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#222;">' + esc(blurb) + '</p>' +
    '<p style="margin:0 0 20px;font-size:15px;color:#222;">You answered <strong>' + score + ' of ' + total + '</strong> correctly.</p>' +
    bookButton() +
    '<h3 style="margin:26px 0 8px;font-size:15px;color:#01426A;">Your answers</h3>' +
    '<table style="width:100%;border-collapse:collapse;">' +
      '<tr><th style="text-align:left;padding:6px 10px;font-size:12px;color:#999;">Level</th><th style="text-align:left;padding:6px 10px;font-size:12px;color:#999;">Question</th><th style="text-align:left;padding:6px 10px;font-size:12px;color:#999;">Your answer</th><th style="padding:6px 10px;font-size:12px;color:#999;">&nbsp;</th></tr>' +
      rows +
    '</table>' +
    '<p style="margin:20px 0 0;font-size:13px;color:#888;line-height:1.6;">This is a quick, indicative check — not an official exam. Jana confirms your real level on your free call and builds your plan around it.</p>'
  );
}

function ownerEmailHtml({ studentName, studentEmail, level, levelName, blurb, score, total, transcript }) {
  const meta =
    '<table style="width:100%;border-collapse:collapse;margin:0 0 18px;">' +
      metaRow("Student", esc(studentName) || "—") +
      metaRow("Email", esc(studentEmail) || "(not provided)") +
      metaRow("Level", esc(level) + " — " + esc(levelName)) +
      metaRow("Score", score + " / " + total) +
      metaRow("Taken", esc(new Date().toUTCString())) +
    '</table>';

  const blocks = transcript.map((t, idx) => {
    const mark = t.ok ? "&#10003; correct" : "&#10007; incorrect";
    const color = t.ok ? "#1E97A6" : "#9E472A";
    let aiBlock = "";
    if (t.aiPrompt || t.aiRaw) {
      aiBlock =
        '<div style="margin:8px 0 0;padding:10px 12px;background:#f6f4ef;border-radius:8px;">' +
          '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#999;margin:0 0 4px;">Prompt sent to ' + esc(t.aiModel || "the model") + '</div>' +
          '<pre style="margin:0 0 10px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#333;">' + esc(t.aiPrompt || "") + '</pre>' +
          '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#999;margin:0 0 4px;">Model\u2019s raw reply</div>' +
          '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#333;">' + esc(t.aiRaw || "(empty)") + '</pre>' +
        '</div>';
    }
    return '<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #eee;border-radius:10px;">' +
      '<div style="font-size:12px;color:#999;margin:0 0 4px;">Q' + (t.n || idx + 1) + ' &middot; ' + esc(t.level || "") + ' &middot; ' + esc(t.type || "") + ' &middot; graded by: ' + esc(t.via || "—") + '</div>' +
      '<div style="font-size:14px;color:#01426A;margin:0 0 6px;font-weight:600;">' + esc(t.q || "") + '</div>' +
      '<div style="font-size:13px;color:#222;margin:0 0 3px;"><strong>Student wrote:</strong> ' + esc(t.answer || "") + '</div>' +
      '<div style="font-size:13px;color:#555;margin:0 0 3px;"><strong>Counts as correct:</strong> ' + esc(t.correctAnswer || "") + '</div>' +
      '<div style="font-size:13px;color:' + color + ';font-weight:700;">' + mark + '</div>' +
      aiBlock +
    '</div>';
  }).join("");

  return emailShell(
    '<h1 style="margin:0 0 14px;font-size:20px;color:#01426A;">New level check &mdash; full detail</h1>' +
    meta +
    '<h3 style="margin:0 0 10px;font-size:14px;color:#01426A;">Per-question breakdown</h3>' +
    blocks
  );
}

function metaRow(k, v) {
  return '<tr>' +
    '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#999;width:90px;">' + esc(k) + '</td>' +
    '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#222;">' + v + '</td>' +
  '</tr>';
}

function bookButton() {
  return '<a href="https://englishmastered.org/book.html" style="display:inline-block;background:#B87333;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:9px;">Book your free call</a>';
}

function emailShell(inner) {
  return '<div style="margin:0;padding:24px;background:#F7F3EC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #E3D9CA;">' +
      '<div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#B87333;font-weight:700;margin:0 0 16px;">English Mastered</div>' +
      inner +
      '<hr style="border:0;border-top:1px solid #eee;margin:24px 0 12px;">' +
      '<div style="font-size:12px;color:#aaa;">English Mastered &middot; englishmastered.org &middot; Online English coaching with Jana Malas</div>' +
    '</div>' +
  '</div>';
}

/* ---------------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------------- */
function today() { return new Date().toISOString().slice(0, 10); }
function toInt(v) { const n = parseInt(v || "0", 10); return Number.isFinite(n) ? n : 0; }
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "")); }
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
