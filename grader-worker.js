/* ============================================================================
   English Mastered — AI level-check grader (Cloudflare Worker)
   ----------------------------------------------------------------------------
   This tiny proxy is what lets the open-ended typed questions on
   level-test.html be graded by AI on the LIVE site. It holds your Anthropic
   API key server-side (NEVER put the key in the website's HTML) and only
   answers requests coming from englishmastered.org.

   It receives:   { "question": "...", "target": "...", "answer": "..." }
   It returns:    { "result": "CORRECT" }   or   { "result": "INCORRECT" }

   It also enforces a DAILY REQUEST CAP (default 200/day) so the API bill can
   never run away, even if someone tries to abuse the endpoint. Once the cap is
   hit, the Worker stops calling the API and the website quietly falls back to
   its local check — a normal student is never blocked.

   ----------------------------------------------------------------------------
   ONE-TIME SETUP (free, ~6 minutes)
   ----------------------------------------------------------------------------
   1. Get an Anthropic API key:
        https://console.anthropic.com  →  Settings → API keys → Create key
        (Add a little credit; grading uses only a few tokens per answer.)

   2. Create a free Cloudflare account:  https://dash.cloudflare.com/sign-up

   3. In the dashboard:  Workers & Pages  →  Create  →  Create Worker.
        Give it a name like  em-grader  →  Deploy (the starter code is fine).

   4. Click  Edit code.  Delete everything, paste THIS whole file, click Deploy.

   5. Add your API key as a secret (so it stays out of the code):
        Worker → Settings → Variables and Secrets → Add
          Type:  Secret
          Name:  ANTHROPIC_API_KEY
          Value: (paste your key from step 1)
        Save / Deploy.

   6. Create the counter store for the daily cap (this is what makes the cap
      actually stick):
        a. Left sidebar:  Storage & Databases → KV → Create a namespace.
             Name it:  em_grader_counter   →  Add.
        b. Back in your Worker:  Settings → Bindings → Add → KV namespace.
             Variable name:  GRADER_KV      (must be exactly this)
             KV namespace:   em_grader_counter
           Save / Deploy.
      (If you skip this step the Worker still grades, but the daily cap is NOT
       enforced — it will log a warning. Add KV to turn the cap on.)

   7. Copy your Worker's URL — it looks like:
          https://em-grader.YOURNAME.workers.dev

   8. Open level-test.html, find this line near the top of the <script>:
          const GRADER_ENDPOINT = null;
      and change it to your URL:
          const GRADER_ENDPOINT = "https://em-grader.YOURNAME.workers.dev";
      Commit & push. Done — live AI grading is on, with the cap protecting you.

   To test the Worker quickly, run this in a terminal (replace the URL):
     curl -X POST https://em-grader.YOURNAME.workers.dev \
       -H "Content-Type: application/json" \
       -d '{"question":"Last weekend, I ...","target":"a past simple sentence","answer":"Last weekend I went to the beach."}'
   You should get:  {"result":"CORRECT"}
   ============================================================================ */

// ----- Settings you can tweak -------------------------------------------------
// Max successful AI gradings per day (UTC). Raise or lower anytime, then Deploy.
const DAILY_LIMIT = 200;

// Domains allowed to call this Worker (your live site). Add/remove as needed.
const ALLOWED_ORIGINS = [
  "https://englishmastered.org",
  "https://www.englishmastered.org",
];
// -----------------------------------------------------------------------------

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

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    try {
      const { question, target, answer } = await request.json();

      if (!answer || !target) {
        return Response.json({ result: "INCORRECT", note: "missing fields" }, { headers: cors });
      }

      // ----- Daily cap check (uses KV so the count persists across requests) ---
      // Key rolls over each UTC day. We count only successful API gradings.
      const dayKey = "count:" + new Date().toISOString().slice(0, 10); // e.g. count:2026-06-08
      let used = 0;
      const kv = env.GRADER_KV;

      if (kv) {
        used = parseInt((await kv.get(dayKey)) || "0", 10) || 0;
        if (used >= DAILY_LIMIT) {
          // Cap reached — don't call the API. Site falls back to local check.
          return Response.json({ result: "LIMIT", note: "daily cap reached" }, { headers: cors });
        }
      } else {
        // KV not bound yet — grade anyway, but warn (cap is NOT enforced).
        console.warn("GRADER_KV not bound: daily cap is NOT being enforced. See setup step 6.");
      }

      // ----- Ask the model -----------------------------------------------------
      const prompt =
        'You are a precise English examiner. Question shown to the student: "' + question + '". ' +
        "A correct answer is " + target + '. The student wrote: "' + answer + '". ' +
        "Decide whether the answer satisfies the target (ignore minor spelling and punctuation). " +
        "Reply with ONLY one word: CORRECT or INCORRECT.";

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await r.json();
      let text = "";
      if (data && Array.isArray(data.content)) {
        text = data.content.map((b) => (b && b.text ? b.text : "")).join(" ");
      }

      const result = /INCORRECT/i.test(text) ? "INCORRECT" : (/CORRECT/i.test(text) ? "CORRECT" : "INCORRECT");

      // ----- Record one successful grading against today's count ---------------
      if (kv) {
        // 2-day TTL so old day-keys clean themselves up automatically.
        await kv.put(dayKey, String(used + 1), { expirationTtl: 172800 });
      }

      return Response.json({ result }, { headers: cors });
    } catch (e) {
      // On any server error, say ERROR — the website falls back to its local
      // check automatically, so a hiccup never blocks a student.
      return Response.json({ result: "ERROR" }, { status: 200, headers: cors });
    }
  },
};
