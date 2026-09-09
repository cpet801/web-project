> **This file is tracked in git.** Commit changes so future sessions see them
> and any drift shows up in `git log`. Private context that must not be
> committed lives in `CLAUDE.local.md` (gitignored, read alongside this file).

# English Mastered (englishmastered.org)

Marketing and booking site for Jana Malas, a Lebanese English coach who
teaches online, mostly to Arabic speakers. Single maintainer; the site
owner does not write or review code.

Business context that shapes technical decisions:
- Audience is largely Arabic-speaking, often on mobile, often on slow
  connections. Page weight and mobile layout matter more than usual.
- One-person maintenance, no team, no build pipeline. Simplicity beats
  cleverness every time.

See `CLAUDE.local.md` (gitignored) for private notes on payment
infrastructure and other context that stays off the public repo.

---

## Stack

Static HTML, CSS and vanilla JS on GitHub Pages. **No build step, no framework,
no bundler, no npm, no CMS.** Each page carries its own `<style>` block inline.
Shared assets live in `assets/`.

Repo: `cpet801/web-project` (public). Deploy is `git push` to `main`.
Custom domain via `CNAME`, DNS at Porkbun, HTTPS enforced through GitHub Pages.

## Repo map

```
index.html          Home
start.html          How It Works
services.html       Packages and pricing (~60KB)
about.html          About Jana
book.html           Cal.com booking page (~1.3MB, see gotchas)
level-test.html     AI-graded CEFR placement test
payments.html       Checkout links (deliberately NOT in sitemap, no canonical)
samples.html        Downloadable teaching samples
samples/            The sample PDFs
assets/             fonts.css, self-hosted woff2, em-mosaic.js,
                    em-facets-tonal.css, photos, logo marks, mosaic SVGs
img/                OG images (one per page) and favicons
grader-worker.js    Source of the Cloudflare Worker (deployed separately)
llms.txt            AI crawler summary
robots.txt          Explicitly allows GPTBot, ClaudeBot, PerplexityBot, etc.
sitemap.xml         7 URLs, payments.html intentionally excluded
fontcheck.html      Dev-only font diagnostic page, not linked from anywhere
.fix-backup/        Stale July snapshot, gitignored, ignore it
apply-fixes.py      One-off script, gitignored, ignore it
```

## Design tokens

Defined in the `:root` block at the top of each page's inline `<style>`:

```css
--navy:#01426A;  --navy-deep:#013049;  --teal:#1E97A6;  --teal-bright:#2BB7C4;
--caramel:#B87333; --paper:#F7F3EC; --pearl:#FCFBF5; --gold:#E4A72C;
--text:#2A2520; --muted:#6E6358; --border:#E3D9CA;
--on-deep:#F2EBDD; --on-deep-mute:#9DA7B1;
/* subject legend colors */
--gen:#0C5C63; --exam:#E31837; --biz:#6E2742; --conv:#7D8252; --grp:#9E472A;
```

Type: **Fraunces** (variable serif, opsz 9 to 144, SOFT pinned 10, WONK 1) for
display; **Public Sans** (variable) for body and UI. Both self-hosted as woff2
via `assets/fonts.css` with metric-matched local fallbacks.

Recurring visual motifs: tracked-uppercase "kicker" labels above headings, the
`brushwing` SVG underline swash, canvas-rendered mosaic backgrounds from
`em-mosaic.js`, `.wonk` class on hero headings.

Nav is the same block on every page. It is a checkbox-hack mobile menu
(`#navtoggle`), with the current page marked `class="active"` and given an inline
brushwing SVG. The last item is always the gold `nav-cta` Cal.com button.

## External services

| Service | Detail |
|---|---|
| Cal.com | Username `englishmastered`, event `free-discovery-call`, embed namespace `free-discovery-call` |
| Cloudflare Worker | `em-grader` at `https://em-grader.c-col-peterson-me.workers.dev`, grades the level test with claude-haiku-4-5, emails results via Resend, CORS locked to englishmastered.org |
| Stripe / PayPal | 6 live payment links hardcoded in `payments.html` |
| WhatsApp | +961 71 500 874 (float button on every page) |
| Email | jana@englishmastered.org (Zoho, free tier) |
| Registrar / DNS | Porkbun |

## Hard rules

1. **Never reintroduce `fonts.googleapis.com` or `fonts.gstatic.com` links.**
   The site deliberately moved off the Google Fonts CDN because privacy
   browsers block those hosts, which silently kills the brand typography.
   Every production page is currently at zero Google Fonts CDN references.
   The one known outstanding violation is `fontcheck.html`, the dev-only
   diagnostic page — it still carries a live `<link>` and two preconnects,
   queued for its own cleanup pass. Arabic accent text on `index.html` is
   Markazi Text, self-hosted at `assets/fonts/MarkaziText-Arabic-var.woff2`
   (commit `2b78f6e`); there is no Amiri anywhere in the repo.
   `assets/fonts.css` explains the reasoning.
2. **Do not read `book.html` in full.** It is 1.3MB because Cal.com embed assets
   are inlined. Grep for what you need and edit surgically. Never reformat or
   rewrite it wholesale.
3. **Do not add `payments.html` to `sitemap.xml`** and do not give it a canonical
   tag. It is intentionally unindexed.
4. **Never invent or alter payment links.** The Stripe and PayPal URLs in
   `payments.html` are live and real. Leave them byte-identical unless
   explicitly told otherwise.
5. **Pricing is a dual-price model.** Card and PayPal pay the standard price;
   fee-free direct methods (Western Union/OMT, Whish, USDT) get a lower price.
   Always frame this as a **cash discount**, never as a card surcharge. Card
   network rules make the wording matter.
   Current: Single $15 flat. 5-lesson $70 card / $65 direct. 10-lesson $125 card
   / $115 direct.
6. **Nav and footer changes are site-wide.** Any nav item, footer link or
   contact detail must be updated in every HTML file. Grep to confirm the count
   before and after.
7. **Every page needs its own OG image**, `img/og-<page>.png`, wired into both
   `og:image` and `twitter:image`. Do not fall back to `og-home.png`.
8. **Mobile first, real devices.** Layout regressions have repeatedly shown up
   only on phones. `html` and `body` both carry `overflow-x: clip` (not
   `hidden`, which breaks the sticky nav).

## Working agreements

- Show a diff or the exact strings being swapped before touching multiple files.
- Prefer `str_replace` on specific strings over rewriting a file.
- After a multi-file change, grep to verify replacement counts.
- Commit messages are short and descriptive, lowercase, no scope prefixes.
- Chris deploys manually with `git add . && git commit && git push`. Say so at
  the end of a change, and call out any brand-new files that need staging.
- Prose style: avoid overusing "I've" / "I have" constructions and em dashes in
  any copy written for the site.

## Arabic site (`/ar/`) — work in progress, NOT live

Substantial work exists. **None of it is published and none of it is committed
to git.** It lives in `_local/`, which is gitignored, so it is invisible on the
public repo and never served by GitHub Pages. It is reference material for
Claude Code, nothing more.

Do not `git add` anything under `_local/`, and do not move a file out of
`_local/` into the repo proper without being asked. There is no `.nojekyll`
file, so anything committed to `main` under `ar/` would be live at
`englishmastered.org/ar/` immediately, linked or not.

### Where the files are

```
_local/
  ar/     index-v1.html, index-v2.html, sandbox-snapshot.html, sitemap-with-ar.xml
  docs/   arabic-build-blueprint.md, ar-design-notes.md, ar-msa-copy-deck.md,
          em-testimonials-bank.md, arabic-display-fonts-research.md,
          CONTINUATION.md, DEPLOY-INSTRUCTIONS.md
  brand/  arabic-wordmark-playbook.md, arabic-brand-refinement.md,
          arabic-wordmark-v2-prompt.md, asset-cutter-prompt.md,
          english-lockup-sandbox-prompt.md
  prompts/ design-mockup-prompt.md, design-mockup-addendum-prompt.md,
          ar-design-export-prompt.md
```

`_local/ar/sitemap-with-ar.xml` is a **loaded gun**: it is the root sitemap plus
the `/ar/` entry and hreflang annotations. It replaces `sitemap.xml` only on the
day `/ar/` ships.

Still outside the repo: the wordmark spec (`Arabic Wordmark Spec Sheet.dc.html`,
the frozen V2 source of truth), its bundled export, `english-wordmark-cropped.png`
and `em-mark-cropped.png` in one Claude Design project; `Arabic Type Lab.dc.html`
(the live sandbox) and `EM-mosaic-replication-brief.md` in another.

### Three versions exist and none is a superset

| | v1 | **v2** | **sandbox snapshot** |
|---|---|---|---|
| Copy register | Levantine | MSA | MSA |
| Numerals | Eastern ١٢٣٤ | Western | Western |
| Arabic face | Amiri | Markazi | Markazi |
| `<bdi>` isolation | no | yes (19) | yes |
| SEO meta / OG | yes | yes (11 OG tags) | **none** |
| JSON-LD schema | yes | yes | **none** |
| Cal.com embed | yes | yes | **none** |
| Hero photo + chips | no | **no** | yes |
| Stats band + count-up | no | **no** | yes |
| Testimonial rotator | no | **no** | yes (42 refs) |
| Internal links | real | real | all `href="#"` |

**v2 is the copy and SEO source of truth. The sandbox is the layout and
typography source of truth.** Merging them is a real task, not a copy-paste:
take v2's `<head>`, schema, Cal.com wiring and links, and bring across the
sandbox's hero, stats band and testimonial sections. v1 is a structural
reference only.

The sandbox is explicitly a design mockup, not a production page. It carries
five inline `<!-- WIP: -->` markers and a header comment recording its own state.

### RTL implementation (verified across v1, v2 and the sandbox)

- `<html lang="ar" dir="rtl">`.
- The English brand wordmark stays LTR inside the RTL page via
  `direction: ltr`. It is not translated.
- Spectrum rule gradient flips to an RTL origin.
- WhatsApp float moves to bottom-**left** (RTL convention).
- Step connector lines reverse direction.
- `←` replaces `→` on every CTA arrow.
- Assets are referenced up one level: `../assets/em-mosaic.js`,
  `../assets/em-mark-gold.png`, `../assets/em-mark-white.png`.
- Nav links point "up" to the English pages (`../services.html`) and the
  language switcher goes to `../index.html`. Intentional for Phase 1.
- GitHub Pages serves `ar/index.html` at `englishmastered.org/ar/` as the
  directory index, no config needed.
- All RTL styles are self-contained in the page's inline `<style>`, matching the
  site's no-shared-CSS pattern.

From the sandbox, for the sections v2 doesn't have yet:

- Hero sweep flips with `scale(-1,1)` so the wipe draws right to left. Floating
  chips swap sides (chip-1 left, chip-2 right).
- Hero photo reused unchanged (`object-position: center 28%`, same panel shape
  and ring shadow), alt text localized. Broken-image fallback swaps to a
  placeholder div with «جنى» centered in the display face.
- Testimonial rotator JS is reused **verbatim** from the English site. Dot nav,
  18s auto-advance, 500ms fade, click-to-jump, autoplay off under
  `prefers-reduced-motion`. It is all class toggling, so no RTL logic is needed.
- Quote marks become Arabic «», and quotes render **upright** at weight 600.
  The English site uses italic Fraunces; Arabic has no italics. Level pills
  (C1/B2/B1) stay Latin and LTR inside `<bdi>`, unmirrored.
- Stats count-up JS reused verbatim (900ms ease-out cubic, fires once on
  intersection, skipped under reduced motion). The hairline gradient direction
  and the watermark logo position are both mirrored: gold starts right, mark
  moves left.
- Section order matches the English homepage exactly, with pricing inserted
  where English has none.
- Palette is untouched. No new colors were introduced for Arabic.
- Nav is 15px/600 rather than the English 14px/600, because Arabic needs one to
  two extra pixels at the same optical size. This one is a reasoned decision,
  not a lab default.
- Kicker treatment: **weight 700 plus teal, zero letter-spacing** is the pick.
  The English site's tracked-uppercase kicker is **rejected outright** for
  Arabic, because letter-spacing breaks Arabic letter joins.

### To ship `/ar/` (do none of this yet)

1. Add three reciprocal hreflang links to the English `index.html`, immediately
   after `<link rel="canonical">` and before `<link rel="icon">`:
   `hreflang="en"` → `/`, `hreflang="ar"` → `/ar/`, `hreflang="x-default"` → `/`.
   The Arabic page already carries all three pointing back.
2. Replace root `sitemap.xml` with `ar/_notes/sitemap-with-ar.xml`.
3. Request indexing in Google Search Console for both `/ar/` and `/` (so the new
   hreflang gets picked up), then resubmit the sitemap.

Full detail in `ar/_notes/DEPLOY-INSTRUCTIONS.md`.

### Frozen decisions

**Architecture.** Subdirectory `/ar/` with English filenames mirrored
(`/ar/services.html`). Reciprocal hreflang in both `<head>` and sitemap.
Self-referential canonicals. `og:locale=ar_AR`. A visible العربية/English
switcher. **Never IP-auto-redirect.**

**Rollout order**, by conversion value, not all eight at once:
landing → services → book → about → level-test → payments → start/samples.
While an Arabic inner page doesn't exist, Arabic pages link "up" to the English
version (`../book.html`); flip each link as its `/ar/` counterpart ships.

**Fonts.** Markazi Text (wght 600) for Arabic display, IBM Plex Sans Arabic
(700) for Arabic body and UI. Both OFL, both to be self-hosted as WOFF2 subset
to Arabic-only with pyftsubset, in a `fonts-ar.css`. Runners-up were El Messiri
and Readex Pro. The pairing logic: Fraunces is a warm high-contrast serif, so it
wants a **modulated Naskh** partner. Geometric Kufi faces (Tajawal, Cairo,
Almarai) are popular and wrong here. Markazi replaces Amiri as the Arabic face
across the whole brand.

`ar-index-v2.html` currently ships `--ar-display` / `--ar-body` CSS variables
with a **temporary Google Fonts link**, clearly marked, pending the font
bake-off. That link must die before anything goes live. (The stray Amiri
CDN load that used to sit on the English `index.html` was self-hosted as
Markazi Text in commit `2b78f6e` — done.)

**Copy register.** Warm simplified MSA (العربية البيضاء), never Levantine.
Removed dialect markers: شو، بعطي، عشان، اللي، مش، وين، بتبني، بيعطيك، عندك،
بفهم، مريت، حكي، لحد، بِراسك، بنحكي، تحكي، بتناسبك، يتقنوا. Warmth comes from
first person and short declaratives, not vocabulary.

**Punctuation.** و carries the connective load that English dumps on commas.
Phase 1 went from 41 Arabic commas down to 7. Comma-separated lists get rewritten
with و/أو. Same em-dash reduction discipline as the English copy.

**Numerals: Western digits (0123456789), never Eastern (١٢٣٤).** Western is the
modern Gulf/Levant commercial norm; Eastern digits now read as
editorial/government/traditional. Verified against noon.com Arabic and Al Jazeera.

**Bidi.** Latin runs and numbers go in `<bdi lang="en">`, never `<span dir="ltr">`.
The v1 phone number was typed in reverse character order to fake correct display;
v2 fixes it properly. `$15`, `$65–70` and `+961 71 500 874` must never reorder.

**Keyword spellings are deliberate, not typos.** انجليزي and اونلاين are the
search forms and stay as-is in title, meta and headings. Primary targets:
معلمة انجليزي اونلاين and دروس انجليزي خصوصية اونلاين. Secondary: تحضير ايلتس.
إيميلات stays in the Business English card (رسائل إلكترونية reads stiff).

**Letter-spacing is zero on all Arabic text.** Arabic script does not tolerate
tracking. Arabic body is 18px/1.85.

### Special cases

- **Level test**: keep the test items in English, it measures English. Translate
  instructions, UI and results only. The `em-grader` Worker needs a `lang=ar`
  flag to return MSA feedback; CORS stays locked. CEFR labels stay Latin (A1–C2).
  The Resend email template needs RTL checking.
- **Cal.com has no real RTL support** (issue #21889, open since Jun 2025). Do not
  promise an Arabic booking flow. Wrap the embed in Arabic copy setting the
  expectation and push WhatsApp as the visible fallback. Recheck status at build.
- **WhatsApp**: prefill Arabic via the `wa.me` text param, phone in Western
  digits, LTR-isolated.
- **Payments**: lead with locally familiar rails (Whish, OMT) for Lebanon trust,
  then PayPal/card/USDT for Gulf and diaspora. State USD explicitly.
- **EN/AR parity**: keep a checklist of each English page and its Arabic status
  with last-sync date, plus `<!-- SYNC: hero v3 2026-07 -->` comment markers in
  both files for diffing.

### Open questions

- **Display face: settled on Markazi Text.** Weight is not. The written record
  says 600; the sandbox ships 700 and the design notes flag the mismatch without
  explaining it. Chris has confirmed the *face* is semi-final and 700 is the
  working value. Confirm the weight before it ships; don't assume either number
  is the correction.
- **Body face: still open.** IBM Plex Sans Arabic is the current default at
  weight 400 (the record said 700, also unexplained). Readex Pro and Noto Naskh
  Arabic were never actually compared, no verdict recorded for either.
- Amiri and El Messiri are no longer live candidates. Both were display-face
  runners-up under Markazi; with the display face settled on Markazi (and now
  self-hosted for the English `.gc-ar` labels too), neither is under
  consideration. Recorded here so a future session doesn't rehabilitate them.
- **Aref Ruqaa is rejected** for body, FAQ and cards. Hero-only ornamental
  opt-in at most.
- Latin-inside-Arabic-headings ("the font's own Latin" vs "Fraunces first") is
  defaulted to *own* but never marked final.
- The Arabic Type Lab sandbox is the tool for closing all of this. It's live in
  the snapshot: the ع/A button, bottom right.
- H1 is pinned at 60px / line-height 1.15 / zero letter-spacing, against the
  English 70px / .98 / −.5px. That is a current slider default, not a pick.
- The Arabic page has a **prices section the English homepage doesn't have**.
  Either add it to English or drop it from Arabic. Unresolved.
- **The Arabic wordmark was blocked on an English lockup problem — now
  unblocked.** The English monogram-plus-wordmark lockup was consolidated to
  a single v6.2 version and cascaded across all 8 HTML pages in commit
  `f784fd6`. Spec of record: `_local/brand-v6/EM-wordmark-spec-v62.md`.
  Three follow-ups Chris queued as separate sessions after that cascade:
  `book.html` still has no `nav.scrolled`; `fontcheck.html` still carries
  its Google Fonts link (see hard rule 1); and `index.html`'s hero sweep
  draws then jumps slightly.
- Lockup variant codes: **6B** monogram + Arabic + small Latin line (primary),
  **5B** monogram + Arabic, **2B** side-by-side bilingual, **3B** Arabic over
  Latin stack (struck).
- No wordmark, lockup or asset-cutter work exists in the design sandbox project.
  The marks in use there are the existing `em-mark-gold.png` and
  `em-mark-white.png`, reused unchanged. Nothing new has been cut for Arabic.
- Wordmark has **two labeled decisions left open** before freeze: kashida ×1 per
  join (letters at 94.7% of Latin cap, Arabic font-size = 1.30 × Latin image
  height) versus ×2 (90%, 1.23 ×). Three or more is disallowed. In final vector
  art the kashida is one continuous drawn stroke at the exact budget, not
  repeated U+0640 glyphs.
- Arabic wordmark string: «الإنجليزية بإتقان», a meaning translation rather than
  a transliteration. Arabic and Latin marks are drawn to **identical ink length**,
  with kashida as the tuning variable (the Balmain method). Baselines always
  aligned.

- Two of the six testimonial quote-to-student mappings (عبير, جنان) were matched
  to source screenshots by theme and tone rather than confirmed one-to-one.
  Flagged in `em-testimonials-bank.md`, still unverified against the originals.
- The Arabic page carries an inline pricing section the English homepage does
  not have (English keeps pricing on a separate page). Confirm the divergence is
  intended before launch.

### QA before any `/ar/` page ships

Safari on macOS and iOS first, it has the trickiest Arabic shaping. Then
mid-range Android Chrome. Check contextual forms connect, diacritics on
تعلّم/مصمّمة/مخصّصة don't collide, and bidi never reorders prices or the phone
number. Benchmark: zero requests to googleapis or gstatic in DevTools with Brave
shields up, on every page including the English index.

## Open threads

- **Current Students page**: planned. Needs a booking path for existing students
  plus gated access to homework, lesson plans and course PDFs. Gating cannot be
  done on GitHub Pages alone, since a public repo plus a public host means any
  file URL is fetchable. See the hosting decision below.
- **AI visibility**: English Mastered is ineligible for a Google Business
  Profile (online-only businesses are excluded). Strategy is off-site entity
  building instead: LinkedIn personal and company pages, Facebook, tutor
  directories (Preply, italki, Superprof), plus the existing llms.txt and
  JSON-LD schema.
