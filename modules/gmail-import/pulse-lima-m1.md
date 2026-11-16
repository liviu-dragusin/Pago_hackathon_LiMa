HACKATHON-PULSE · Team: LiMa · Member: 1 · Page:

Set up our team's progress page as a Claude artifact. Don't ask me anything, and don't touch our code.
Two members work on this team, each in their own session, and both feed ONE shared page. Never write names: members appear only as "Membrul 1" / "Membrul 2".

1. Create the folder `.hackathon-pulse/`. If this is a git repo, add `.hackathon-pulse/` to `$(git rev-parse --git-common-dir)/info/exclude`.
   Write `.hackathon-pulse/me.txt` with these three lines: `team=LiMa`, `member=1`, `page=<link or empty>`. If page is set, also write it to `.hackathon-pulse/link.txt`.

2. Write `.hackathon-pulse/DESIGN.md` with this visual spec (copy it verbatim):
   - Font: Poppins 400–800 from a Google Fonts stylesheet (the only external resource allowed), fallback system-ui. h1 800 clamp(30px,5.2vw,46px); h2 700 1.35rem; h3 600; body 15px/1.6.
   - Light tokens: --ground #EFF2F7 --surface #FFF --surface-2 #F7F8FB --ink #161F28 --muted #5A6B8F --line #DFE6F6 --accent #2B59C3 --accent-soft #E6F0FF --shadow 0 0 1.4px rgba(24,24,27,.3),0 5.6px 11.2px rgba(24,24,27,.1)
   - Dark tokens: --ground #0E131A --surface #171D26 --surface-2 #1D2430 --ink #E6EAF2 --muted #94A3BD --line #2A3240 --accent #7FA2F5 --accent-soft #1A2747 --shadow 0 4px 12px rgba(0,0,0,.35)
   - Poster palette (same in both themes): blue #2A56D4 → #1E43B8, yellow #FFD54A, white #FFF, glass rgba(255,255,255,.14), glass border rgba(255,255,255,.38)
   - Member colors: Membrul 1 = accent blue, Membrul 2 = yellow #FFD54A (with #161F28 text)
   - Masthead: lowercase bold "pago" wordmark in the accent color | 1px separator | "AI Hackathon · LiMa" in small muted text
   - Hero = poster: linear-gradient(160deg,#2A56D4,#1E43B8), white text, radius 28px, padding 28px, h1 in yellow, bold white subline, yellow radial glow at the bottom right; the illustration inside is white/yellow line art (stroke 2.2, round caps), framed by a glass phone outline (radius 34px)
   - Cards: --surface, 1px --line border, radius 18px, --shadow. Icons: line icons (stroke currentColor 2.2) in --accent on a 48px --accent-soft rounded square
   - Pills: radius 999px. The "Ești aici" pill: yellow #FFD54A background, #161F28 text. Member pills "M1" / "M2" in the member colors
   - Page: max-width 880px, 16px side padding, flex column with a 28px gap. Footer: small muted text, top border, "Făcut la Pago"

3. Write `.hackathon-pulse/TICK.md` with these steps:
   a) Read `.hackathon-pulse/me.txt`. If `.hackathon-pulse/link.txt` exists, read the live page with the Artifact tool (action "read", that url) and take the JSON in its `<script type="application/json" id="pulse-data">` block as the shared state. Otherwise start from an empty state.
      State shape: `{ "team": "...", "ticks": [ { "n": 1, "member": 1, "time": "...", "headline": "..." } ], "members": { "1": { "building": "...", "works": "...", "blocking": "...", "features": [ { "name": "...", "for": "..." } ], "next": "..." }, "2": { ... } } }`
   b) Write 8–12 short facts for yourself, taken from this conversation and from `git log --all --oneline -20`:
      - what we're building, what works now, what's blocking us
      - which Claude features I actually used, and what for (only the ones that appear in this conversation or in the repo)
      - our next step, as we described it
      No secrets, no links, no people's names (not even made-up ones).
      Replace ONLY my own `members.<member>` entry with these facts; keep the other member's entry exactly as it is.
   c) Append my tick to `ticks` with n = the highest n + 1 and a headline in Romanian (time in Romanian time). Also append the line `#<N> <time> · M<member> · <headline>` to `.hackathon-pulse/ticks.txt`. Save the full state to `.hackathon-pulse/state.json`.
   d) Spawn ONE subagent (model sonnet) and give it state.json and DESIGN.md. It writes `.hackathon-pulse/pulse.html`, a single file:
      - follows DESIGN.md exactly
      - in Romanian, "explain like I'm 10": drawings (inline SVG) carry the idea, words only label it
      - sections, in order: masthead; hero poster (what we're building, in one line, plus an analogy, merged from both members); a Problem → Idea → Demo diagram; a trail with one stop for each tick, in order of n, each tagged with an M1/M2 pill, and "Ești aici" on the last one; "Cum folosim Claude": one tile for each feature used, merged across members, with M1/M2 pills showing who used it and what for; "Pasul următor": each member's step, as they said it; footer
      - only show what we did: no recommendations, no list of features we didn't use, no score
      - title "LiMa · Pulse"; light + dark theme (tokens on :root, dark under @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) } and under :root[data-theme="dark"]); no executable scripts; the only external resource is the Poppins stylesheet
      - embeds the full state, unchanged, in `<script type="application/json" id="pulse-data">…</script>` (data only, never executed)
      - SVG text and strokes use theme tokens so they read in both themes (the poster colors stay fixed)
      - works on phone: `* { box-sizing: border-box }`, SVGs and cards with `max-width: 100%`, long text wraps (`overflow-wrap: anywhere`), no horizontal scrolling at 360px
   e) Read pulse.html before publishing. Then publish it with the Artifact tool:
      - No link.txt (member 1, first run): publish with file_path = the absolute path of `.hackathon-pulse/pulse.html` and icon "compass", then save the link in `.hackathon-pulse/link.txt`.
      - link.txt exists: publish the same file_path with `url` = the link from link.txt.
      - If the publish is refused because the page changed (the other member published in the meantime), go back to step a) using the version the refusal hands back, merge again, and republish once.
      - If the publish is refused because I can't edit the page: reply `❌ Pulse: ask Membrul 1 to share the page with you with edit access` and stop.
   f) Reply with ONE line only: `✅ Pulse #<N> · M<member> · <headline> · <link>` (or ❌ + the reason).

4. Follow `.hackathon-pulse/TICK.md` now, once.

5. Start the cron: use CronCreate to create a recurring job every 2 hours with the prompt `HACKATHON-PULSE tick: follow .hackathon-pulse/TICK.md`. Member 1 uses minute 7 (`7 */2 * * *`) and member 2 uses minute 67 → `7 1-23/2 * * *`, so the two sessions alternate hours and don't publish at the same time. If CronCreate is not available, invoke the `loop` skill with args `2h HACKATHON-PULSE tick: follow .hackathon-pulse/TICK.md`.

6. Reply with 2 lines only: `✅ Pulse: <link>` and `⏰ Updated every 2h, as long as this session stays open (recurring jobs expire after 7 days)`. Member 1 adds a third line: `👉 Share this page with Membrul 2 with edit access, then send them the link`.
