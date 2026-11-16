HACKATHON-PULSE setup for team LiMa. Paste this once into Claude Code, in your project folder. That's all.

You are setting up the "Hackathon Pulse" for team LiMa. Every 2 hours (Romanian time, counted from now) a small background timer rebuilds a picture-first page about the team: what it is building, how it uses the Claude ecosystem (prompts, plan mode, CLAUDE.md, skills, slash commands, subagents, MCP, hooks, loops/goals, workflows, artifacts) and 3 moves for the next 2 hours. The timer then pushes the page to a separate `hackathon-pulse` branch of the team's GitHub repo, where the organizers read it.
After setup this costs the team nothing in their Claude sessions. The timer runs outside Claude: scripts read the history, and one short headless `claude -p` (Sonnet) call writes the summary. It never touches the team's working branch, files, index or commits.

## CONFIG (already filled in)
- TEAM_NAME: LiMa
- TEAM_PAGE: https://claude.ai/artifact/NJN7oaCWnaJC51f6Um5dbW
- HACKATHON_GOAL: Pago AI Hackathon Brașov, 16–17 Nov 2026: a working demo plus code by Tuesday 14:00, built with Claude
- DEADLINE: 2026-11-17T12:00:00Z
- LANGUAGE: Romanian

## Do this now, in order, without asking questions. Keep your own output minimal.
1. Create `.hackathon-pulse/` in the repo root (`git rev-parse --show-toplevel`; if this is not a git repo, use the current folder). Add the line `.hackathon-pulse/` to `.git/info/exclude`. All later commands run from the repo root.
2. Write `.hackathon-pulse/state.json`:
   `{"team": TEAM_NAME, "teamPage": TEAM_PAGE, "goal": HACKATHON_GOAL, "deadline": DEADLINE, "language": LANGUAGE, "dedicatedSession": false, "startedAt": <current UTC ISO time>, "lastScanAt": null, "tick": 0, "publishedTo": null, "extraDirs": []}`
3. Write the 6 files below VERBATIM into `.hackathon-pulse/`. They need Node 18+. If `node --version` fails, tell the user to install Node and stop.
4. Run `claude --version` in the shell.
   - **It works:** run `node .hackathon-pulse/timer.mjs once`. This is the first pulse and takes about 1–2 minutes. Then run `node .hackathon-pulse/timer.mjs start`.
   - **It fails** (no `claude` command, e.g. desktop app only): do the first pulse yourself:
     1. Run `node .hackathon-pulse/extract.mjs`.
     2. Spawn ONE subagent (general-purpose, model sonnet) with the prompt "Read .hackathon-pulse/DISTILL.md and do exactly what it says".
     3. Run `node .hackathon-pulse/render.mjs` and then `node .hackathon-pulse/publish.mjs`.
     4. Invoke the `loop` skill with args `2h HACKATHON-PULSE tick: run node .hackathon-pulse/extract.mjs; spawn one sonnet subagent with "Read .hackathon-pulse/DISTILL.md and do exactly what it says"; run node .hackathon-pulse/render.mjs and node .hackathon-pulse/publish.mjs; output one line.`
5. Push test. Check that `.hackathon-pulse/state.json` has `"verified": true`. publish.mjs set it only after confirming with `git ls-remote` that the remote `hackathon-pulse` branch points at the new commit and that the commit contains `pulse.html` and `README.md`.
   - If it is false, read the reason from `publishedTo`. Fix what you can: e.g. no `origin` remote → ask the user for the GitHub repo URL and run `git remote add origin <url>`. Then rerun `node .hackathon-pulse/publish.mjs` once.
   - Also run `node .hackathon-pulse/timer.mjs status` to confirm the timer is running (skip this if you used the loop fallback).
6. Reply with exactly these lines, in the team's language. They are for the organizers, so the team can paste them as they are:
   - Team: LiMa
   - GitHub repo: <repo from state.json>
   - Pulse: <publishedTo> (pulse.html + README.md)
   - Push test: ✅ commit <lastCommit> is on GitHub   (or ❌ + the reason, if verified is still false)
   - Timer: ✅ every 2h until the deadline (next update: <startedAt + 2h, Romanian time>)
   - Local page: <absolute path of .hackathon-pulse/pulse.html>
   - If the laptop restarts: `node .hackathon-pulse/timer.mjs start`

---

### FILE `.hackathon-pulse/extract.mjs`
```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const K = path.join(process.cwd(), '.hackathon-pulse');
const statePath = path.join(K, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const start = Date.parse(state.startedAt);
const since = Date.parse(state.lastScanAt || state.startedAt);
const SELF = /hackathon-pulse/i;
const fmt = (ms) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' }).format(ms);
const redact = (s) => s
  .replace(/https?:\/\/([^/\s?#]+)\S*/g, 'link:$1')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\b(sk-|ghp_|gho_|github_pat_|xox[abp]-|AKIA|AIza)[\w-]+/g, '[secret]')
  .replace(/(bearer|token|password|passwd|secret|api[_-]?key)(\s*[:=]\s*|\s+)\S+/gi, '$1=[secret]')
  .replace(/[A-Za-z0-9+/_-]{32,}/g, '[long]');

const root = process.env.PULSE_PROJECTS_ROOT || path.join(os.homedir(), '.claude', 'projects');
const slug = (p) => path.resolve(p).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const known = fs.existsSync(root) ? fs.readdirSync(root) : [];
const worktrees = (() => { try { return execSync('git worktree list --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim()); } catch { return []; } })();
const wanted = new Set([process.cwd(), ...worktrees, ...(state.extraDirs || [])].map(slug));
const projDirs = known.filter((n) => wanted.has(n.toLowerCase())).map((n) => path.join(root, n));
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsonl') && fs.statSync(p).mtimeMs >= start) files.push(p);
  }
};
projDirs.forEach(walk);

const inc = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
const t = { prompts: 0, toolCalls: 0, tools: {}, skills: {}, agents: {}, slash: {}, mcp: {}, loops: 0, workflows: 0, planMode: 0, artifacts: 0, todos: 0, edits: {} };
const buckets = {};
const bucket = (ts) => {
  const i = Math.floor((ts - start) / 7.2e6);
  return (buckets[i] ||= { from: fmt(start + i * 7.2e6), prompts: 0, toolCalls: 0 });
};
const recent = [];
const sessions = new Set();

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  if (state.dedicatedSession && raw.includes('HACKATHON-PULSE-SESSION')) continue;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const ts = Date.parse(e.timestamp);
    if (!ts || ts < start) continue;
    const c = e.message?.content;
    if (e.permissionMode === 'plan') t.planMode++;
    if (e.type === 'user' && !e.isMeta) {
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : '';
      if (!text || SELF.test(text)) continue;
      sessions.add(e.sessionId || f);
      const cmd = text.match(/<command-name>\/?([^<\s]+)<\/command-name>/);
      if (cmd) { inc(t.slash, cmd[1]); if (cmd[1] === 'loop') t.loops++; continue; }
      if (text.trimStart().startsWith('<')) continue;
      t.prompts++; bucket(ts).prompts++;
      if (ts >= since) recent.push({ ts, text: redact(text.replace(/\s+/g, ' ')).slice(0, 240) });
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      for (const x of c) {
        if (x.type !== 'tool_use') continue;
        const n = x.name, i = x.input || {};
        if (SELF.test(JSON.stringify(i))) continue;
        t.toolCalls++; bucket(ts).toolCalls++; inc(t.tools, n);
        if (n === 'Skill') inc(t.skills, i.skill);
        else if (n === 'Agent' || n === 'Task') inc(t.agents, i.subagent_type || 'general-purpose');
        else if (n.startsWith('mcp__')) inc(t.mcp, n.split('__')[1]);
        else if (n === 'CronCreate' || n === 'ScheduleWakeup') t.loops++;
        else if (n === 'Workflow') t.workflows++;
        else if (n === 'EnterPlanMode' || n === 'ExitPlanMode') t.planMode++;
        else if (n === 'Artifact') t.artifacts++;
        else if (n === 'TodoWrite' || n === 'TaskCreate') t.todos++;
        else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(n) && i.file_path) inc(t.edits, path.basename(i.file_path));
      }
    }
  }
}

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const ls = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []);
const json = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
const top = (o, n = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const settings = { ...json('.claude/settings.json').hooks, ...json('.claude/settings.local.json').hooks };

const digest = {
  team: state.team, goal: state.goal, language: state.language,
  tick: state.tick + 1, startedAt: fmt(start), now: fmt(Date.now()), newSince: fmt(since),
  deadline: state.deadline ? fmt(Date.parse(state.deadline)) : null,
  hoursLeft: state.deadline ? Math.max(0, Math.round((Date.parse(state.deadline) - Date.now()) / 3.6e5) / 10) : null,
  teamPage: state.teamPage || null,
  sessionsSeen: sessions.size, transcriptFiles: files.length, foldersScanned: projDirs.length,
  totals: { prompts: t.prompts, toolCalls: t.toolCalls, loops: t.loops, workflows: t.workflows, planModeSignals: t.planMode, artifacts: t.artifacts, todoUpdates: t.todos },
  topTools: top(t.tools), skills: top(t.skills), subagents: top(t.agents), slashCommands: top(t.slash),
  mcpServers: top(t.mcp), mostEditedFiles: top(t.edits, 12),
  timeline: Object.keys(buckets).sort((a, b) => a - b).map((k) => buckets[k]).slice(-12),
  recentPrompts: recent.sort((a, b) => a.ts - b.ts).slice(-15).map((r) => ({ at: fmt(r.ts), text: r.text })),
  commits: sh(`git log --all --since="${state.startedAt}" --pretty=format:%h%x09%ad%x09%s --date=format:%H:%M`).split('\n').filter(Boolean).slice(0, 40).map(redact),
  projectSetup: {
    claudeMdLines: fs.existsSync('CLAUDE.md') ? fs.readFileSync('CLAUDE.md', 'utf8').split('\n').length : 0,
    skills: ls('.claude/skills'), agents: ls('.claude/agents'), commands: ls('.claude/commands'),
    hooks: Object.keys(settings || {}), mcpServers: Object.keys(json('.mcp.json').mcpServers || {}),
  },
};
fs.writeFileSync(path.join(K, 'digest.json'), JSON.stringify(digest, null, 1));
fs.writeFileSync(statePath, JSON.stringify({ ...state, tick: state.tick + 1, lastScanAt: new Date().toISOString() }, null, 2));
console.log(`digest ok: tick ${digest.tick}, ${files.length} transcripts, ${t.prompts} prompts, ${t.toolCalls} tool calls, ${digest.commits.length} commits`);
```

### FILE `.hackathon-pulse/timer.mjs`
```js
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const K = path.join(process.cwd(), '.hackathon-pulse');
const P = (f) => path.join(K, f);
const EVERY = 2 * 3.6e6;
const log = (m) => fs.appendFileSync(P('timer.log'), `${new Date().toISOString()} ${m}\n`);
const state = () => JSON.parse(fs.readFileSync(P('state.json'), 'utf8'));
const alive = (pid) => { if (!(pid > 0)) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const pid = () => { try { return +fs.readFileSync(P('timer.pid'), 'utf8'); } catch { return 0; } };
const runNode = (f) => spawnSync(process.execPath, [P(f)], { cwd: process.cwd(), encoding: 'utf8' });

function distill() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
  const prompt = 'HACKATHON-PULSE distill: read .hackathon-pulse/DISTILL.md and do exactly what it says.';
  const args = ['-p', '--model', 'sonnet', '--allowedTools', 'Read,Write,Edit', '--max-turns', '15'];
  const opts = { cwd: process.cwd(), input: prompt, encoding: 'utf8', env, timeout: 15 * 60e3, windowsHide: true };
  let r = spawnSync('claude', args, opts);
  if (r.error && process.platform === 'win32') r = spawnSync('claude.cmd', args, { ...opts, shell: true });
  return r;
}

function tick() {
  const out = [];
  let r = runNode('extract.mjs');
  if (r.status) return log('extract failed: ' + r.stderr);
  out.push(r.stdout.trim());
  r = distill();
  if (r.error || r.status !== 0) return log('claude -p failed: ' + (r.error?.message || r.stderr || r.stdout));
  out.push(r.stdout.trim().split('\n').pop());
  r = runNode('render.mjs');
  if (r.status) return log('render failed: ' + r.stderr);
  r = runNode('publish.mjs');
  out.push((r.stdout || r.stderr).trim());
  const line = out.join(' | ');
  log(line);
  console.log(line);
}

const cmd = process.argv[2] || 'status';
if (cmd === 'once') tick();
else if (cmd === 'start') {
  if (alive(pid())) console.log('timer already running, pid ' + pid());
  else {
    const c = spawn(process.execPath, [P('timer.mjs'), 'run'], { cwd: process.cwd(), detached: true, stdio: 'ignore', windowsHide: true });
    c.unref();
    console.log('timer started, pid ' + c.pid + ' (log: .hackathon-pulse/timer.log)');
  }
} else if (cmd === 'stop') {
  if (alive(pid())) { process.kill(pid()); console.log('timer stopped'); } else console.log('timer not running');
} else if (cmd === 'run') {
  fs.writeFileSync(P('timer.pid'), String(process.pid));
  const start = Date.parse(state().startedAt);
  const nextSlot = () => start + (Math.floor((Date.now() - start) / EVERY) + 1) * EVERY;
  let next = nextSlot();
  log('timer running, next tick ' + new Date(next).toISOString());
  setInterval(() => {
    const deadline = Date.parse(state().deadline || '');
    if (deadline && Date.now() > deadline + 3.6e6) { log('deadline passed, timer exits'); process.exit(0); }
    if (Date.now() >= next) { tick(); next = nextSlot(); log('next tick ' + new Date(next).toISOString()); }
  }, 60e3);
} else {
  console.log(alive(pid()) ? 'timer running, pid ' + pid() : 'timer not running');
}
```

### FILE `.hackathon-pulse/render.mjs`
```js
import fs from 'node:fs';
const K = '.hackathon-pulse/';
const data = fs.readFileSync(K + 'pulse.json', 'utf8');
JSON.parse(data);
const html = fs.readFileSync(K + 'template.html', 'utf8').replace('/*__PULSE_DATA__*/null', () => data.replace(/</g, '\u003c'));
fs.writeFileSync(K + 'pulse.html', html);
console.log('rendered ' + process.cwd() + '/' + K + 'pulse.html');
```

### FILE `.hackathon-pulse/publish.mjs`
```js
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const K = '.hackathon-pulse/';
const BRANCH = 'hackathon-pulse';
const p = JSON.parse(fs.readFileSync(K + 'pulse.json', 'utf8'));
const state = JSON.parse(fs.readFileSync(K + 'state.json', 'utf8'));
const RO = /^ro/i.test(p.language || '');
const git = (cmd, input) => execSync('git ' + cmd, { encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], env: identity() }).trim();
const tryGit = (cmd) => { try { return git(cmd); } catch { return ''; } };
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

function identity() {
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Hackathon Pulse', GIT_COMMITTER_NAME: 'Hackathon Pulse' };
  let email = '';
  try { email = execSync('git config user.email', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = email || 'hackathon-pulse@localhost';
  return env;
}

function readme() {
  const L = RO
    ? { b: 'Ce construiesc', p: 'Problema', i: 'Ideea', d: 'Demo acum', tb: 'Trusa Claude', ld: 'Scara Claude', mv: 'Următoarele 2 ore', tr: 'Traseul', w: 'Victorii', r: 'Riscuri', full: 'Pagina completă cu desene: descarcă `pulse.html` și deschide-l în browser.', st: { 'on-track': 'pe drum bun', drifting: 'deviază', pivoting: 'pivotează' } }
    : { b: 'What they are building', p: 'Problem', i: 'Idea', d: 'Demo now', tb: 'Claude toolbox', ld: 'Claude ladder', mv: 'Next 2 hours', tr: 'Trail', w: 'Wins', r: 'Risks', full: 'Full picture page: download `pulse.html` and open it in a browser.', st: {} };
  const d = p.direction || {}, lv = p.level || {}, b = p.building || {};
  const tools = Object.entries(p.toolbox || {}).map(([k, v]) => `| ${k} | ${v?.count || '—'} | ${cell((v?.names || []).join(', '))} | ${cell(v?.note)} |`).join('\n');
  return `# ${p.team} · Pulse #${p.tick}

**${cell(p.oneLiner)}**
${cell(p.analogy)}

\`${L.st[d.status] || d.status}\` · ${p.updatedAt} · ${p.hoursLeft != null ? p.hoursLeft + (RO ? ' ore rămase' : ' hours left') : ''}

> ${L.full}

## ${L.b}
| ${L.p} | ${L.i} | ${L.d} |
|---|---|---|
| ${cell(b.problem)} | ${cell(b.idea)} | ${cell(b.demo)} |

## ${L.ld}: ${lv.current ?? 0} → ${lv.target ?? 3}
${cell(lv.why)}

**→** ${cell(d.heading)}: ${cell(d.why)}

## ${L.tb}
| | # | | |
|---|---|---|---|
${tools}

## ${L.mv}
${(p.nextMoves || []).map((m, i) => `${i + 1}. **${cell(m.title)}**: ${cell(m.why)}\n   \`${cell(m.tryThis)}\``).join('\n')}

## ${L.w} / ${L.r}
${(p.wins || []).map((x) => '- ✅ ' + cell(x)).join('\n')}
${(p.risks || []).map((x) => '- ⚠️ ' + cell(x)).join('\n')}

## ${L.tr}
${(p.timeline || []).slice().reverse().map((t) => `- #${t.tick} ${t.at} · ${t.mood}: ${cell(t.headline)}`).join('\n')}
`;
}

fs.writeFileSync(K + 'README.md', readme());
if (!tryGit('rev-parse --git-dir')) { console.log('local only (not a git repo): ' + process.cwd() + '/' + K + 'pulse.html'); process.exit(0); }

const html = git('hash-object -w ' + K + 'pulse.html');
const md = git('hash-object -w ' + K + 'README.md');
const tree = git('mktree', `100644 blob ${html}\tpulse.html\n100644 blob ${md}\tREADME.md\n`);
const hasRemote = !!tryGit('remote get-url origin');
if (hasRemote) tryGit(`fetch -q origin ${BRANCH}:refs/remotes/origin/${BRANCH}`);
const parent = tryGit(`rev-parse -q --verify refs/remotes/origin/${BRANCH}`) || tryGit(`rev-parse -q --verify refs/heads/${BRANCH}`);
const commit = git(`commit-tree ${tree}${parent ? ' -p ' + parent : ''} -F -`, `Pulse #${p.tick}: ${cell(p.oneLiner).slice(0, 72)}\n`);
git(`update-ref refs/heads/${BRANCH} ${commit}`);

let where = `local branch ${BRANCH} (no remote)`, repo = null, verified = false;
if (hasRemote) {
  repo = git('remote get-url origin').replace(/^git@([^:]+):/, 'https://$1/').replace(/^https:\/\/[^@/]+@/, 'https://').replace(/\.git$/, '');
  try {
    git(`push -q origin refs/heads/${BRANCH}:refs/heads/${BRANCH}`);
    const remoteSha = (tryGit(`ls-remote origin refs/heads/${BRANCH}`).split(/\s+/)[0] || '');
    const files = tryGit(`ls-tree --name-only ${commit}`).split('\n');
    verified = remoteSha === commit && files.includes('pulse.html') && files.includes('README.md');
    where = `${repo}/tree/${BRANCH}`;
  } catch (e) {
    where = `push failed (${String(e.stderr || e.message).split('\n')[0]}); committed locally on ${BRANCH}`;
  }
}
fs.writeFileSync(K + 'state.json', JSON.stringify({ ...state, repo, publishedTo: where, lastCommit: commit.slice(0, 10), verified }, null, 2));
console.log(`published: ${where} | commit ${commit.slice(0, 10)} | ${verified ? 'VERIFIED on remote: pulse.html + README.md pushed' : 'NOT verified on remote'}`);
```

### FILE `.hackathon-pulse/template.html`
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LiMa Pulse</title>
<style>
:root{--bg:#f7f5f0;--card:#ffffff;--ink:#1d1b18;--muted:#6b665d;--line:#e3ded3;--accent:#d9622b;--good:#2f8f5b;--warn:#c98a12;--bad:#c2413a;--soft:#f1ece2;--path:#b9ab92}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15140f;--card:#1f1d18;--ink:#f1ede4;--muted:#a69f92;--line:#35322b;--accent:#f08a54;--good:#5cc28a;--warn:#e7b04a;--bad:#ef7a72;--soft:#2a2720;--path:#6f6553}}
:root[data-theme="dark"]{--bg:#15140f;--card:#1f1d18;--ink:#f1ede4;--muted:#a69f92;--line:#35322b;--accent:#f08a54;--good:#5cc28a;--warn:#e7b04a;--bad:#ef7a72;--soft:#2a2720;--path:#6f6553}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:clamp(1.6rem,4.5vw,2.4rem);line-height:1.15;margin:.2em 0}
h2{font-size:1.15rem;margin:0 0 12px;display:flex;gap:8px;align-items:center}
h2 .n{background:var(--accent);color:var(--bg);border-radius:50%;width:26px;height:26px;display:inline-grid;place-items:center;font-size:.85rem}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:16px 0}
.muted{color:var(--muted)}.small{font-size:.85rem}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-weight:600;font-size:.85rem;color:var(--bg)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:.82rem}
.hero{display:grid;grid-template-columns:1fr 200px;gap:16px;align-items:center}
@media (max-width:640px){.hero{grid-template-columns:1fr}.hero svg{max-width:220px}}
svg{width:100%;height:auto;display:block}
svg text{fill:var(--ink);font-family:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.tile{border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--soft)}
.tile.off{opacity:.45}.tile .c{font-size:1.6rem;font-weight:700}.tile .ic{font-size:1.2rem}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:640px){.two{grid-template-columns:1fr}}
.move{border:1px solid var(--line);border-radius:12px;padding:12px;margin:8px 0;background:var(--soft)}
.try{display:flex;gap:8px;align-items:flex-start;background:var(--card);border:1px dashed var(--accent);border-radius:8px;padding:8px;margin-top:6px;font-family:ui-monospace,Consolas,monospace;font-size:.85rem;word-break:break-word}
.try span{flex:1}
button{background:var(--accent);color:var(--bg);border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600}
details summary{cursor:pointer;font-weight:600}
dl{margin:8px 0}dt{font-weight:600}dd{margin:0 0 8px;color:var(--muted)}
a{color:var(--accent)}
footer{text-align:center;color:var(--muted);font-size:.8rem;margin-top:24px}
</style>
</head>
<body>
<main id="app"><p class="muted">First pulse coming…</p></main>
<script id="pulse" type="application/json">/*__PULSE_DATA__*/null</script>
<script>
(function(){
var D=null;try{D=JSON.parse(document.getElementById('pulse').textContent)}catch(e){}
if(!D)return;
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var arr=function(a){return Array.isArray(a)?a:[]};
var STATUS={'on-track':'var(--good)','drifting':'var(--warn)','pivoting':'var(--bad)'};
var MOOD={exploring:'var(--warn)',building:'var(--accent)',stuck:'var(--bad)',pivot:'var(--bad)',shipping:'var(--good)'};
var RO=/^ro/i.test(D.language||''),L=RO?{b:'Ce construiesc',tr:'Traseul',tb:'Trusa Claude',ld:'Scara Claude',cp:'Busola',mv:'Următoarele 2 ore — 3 mișcări',w:'Victorii',r:'Riscuri',g:'Glosar — cuvinte pe înțeles',p:'Problema',i:'Ideea',d:'Demo acum',here:'ești aici',goal:'țintă',head:'Direcție',up:'actualizat',ny:'încă nu',ft:'actualizat automat la 2h de Claude · ora României',st:'început',copy:'copiază',goalT:'Țintă',left:'ore rămase'}:{b:''+L.b+'',tr:'Trail map',tb:'Claude toolbox',ld:'Claude ladder',cp:'Compass',mv:''+L.mv+'',w:'Wins',r:'Risks',g:''+L.g+'',p:'Problem',i:'Idea',d:'Demo now',here:'you are here',goal:'goal',head:'Heading',up:'updated',ny:'not yet',ft:'auto-updated every 2h by Claude · Europe/Bucharest',st:'started',copy:'copy',goalT:'Goal',left:'hours left'};
var dir=D.direction||{},lvl=D.level||{},b=D.building||{},tb=D.toolbox||{};
var h='';
// 1 hero
h+='<div class="hero"><div><div class="muted small">'+esc(D.team)+' · hackathon pulse</div><h1>'+esc(D.oneLiner)+'</h1>'+
'<p>'+esc(D.analogy)+'</p><span class="pill" style="background:'+(STATUS[dir.status]||'var(--muted)')+'">'+esc((RO?{'on-track':'pe drum bun','drifting':'deviază','pivoting':'pivotează'}:{})[dir.status]||dir.status||'—')+'</span>'+
' <span class="muted small">'+L.up+' '+esc(D.updatedAt)+' · pulse #'+esc(D.tick)+'</span>'+(/^https:\/\/claude\.ai\//.test(D.teamPage||'')?' <a class="small" href="'+esc(D.teamPage)+'" target="_blank" rel="noopener">'+(RO?'pagina echipei':'team page')+' ↗</a>':'')+'</div>'+
'<svg viewBox="0 0 200 150" aria-hidden="true"><circle cx="150" cy="38" r="20" fill="var(--warn)"/><path d="M0 130 L60 60 L100 105 L135 70 L200 130Z" fill="var(--path)"/><path d="M0 150 L0 130 L200 130 L200 150Z" fill="var(--line)"/><line x1="135" y1="70" x2="135" y2="35" stroke="var(--ink)" stroke-width="2"/><path d="M135 35 L160 42 L135 50Z" fill="var(--accent)"/><circle cx="60" cy="118" r="7" fill="var(--accent)"/></svg></div>';
// 2 building
var box=function(x,t,s,c){return '<rect x="'+x+'" y="10" width="190" height="110" rx="14" fill="var(--soft)" stroke="'+c+'" stroke-width="2"/><text x="'+(x+95)+'" y="36" text-anchor="middle" font-weight="700">'+t+'</text>'+wrap(s,x+95,60)};
function wrap(s,x,y){var w=String(s||'').split(/\s+/),l=[],cur='';w.forEach(function(t){if((cur+' '+t).trim().length>24){l.push(cur);cur=t}else cur=(cur+' '+t).trim()});if(cur)l.push(cur);return l.slice(0,4).map(function(t,i){return '<text x="'+x+'" y="'+(y+i*17)+'" text-anchor="middle" font-size="13">'+esc(t)+'</text>'}).join('')}
h+='<section><h2><span class="n">1</span>'+L.b+'</h2><svg viewBox="0 0 660 130">'+box(0,L.p,b.problem,'var(--bad)')+'<path d="M195 65 L230 65" stroke="var(--muted)" stroke-width="3" marker-end="url(#a)"/>'+box(235,L.i,b.idea,'var(--warn)')+'<path d="M430 65 L465 65" stroke="var(--muted)" stroke-width="3" marker-end="url(#a)"/>'+box(470,L.d,b.demo,'var(--good)')+'<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted)"/></marker></defs></svg><div class="chips" style="margin-top:10px">'+arr(b.stack).map(function(s){return '<span class="chip">'+esc(s)+'</span>'}).join('')+'</div></section>';
// 3 trail
var tl=arr(D.timeline),n=Math.max(tl.length,1),W=640,step=(W-80)/(n+1);
var pts=tl.map(function(t,i){return{x:40+step*(i+1)-step/2+20,y:i%2?70:120,t:t}});
var tr='<svg viewBox="0 0 '+W+' 200"><path d="M10 170 '+pts.map(function(p){return 'L'+p.x+' '+p.y}).join(' ')+'" stroke="var(--path)" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
var last=pts[pts.length-1]||{x:10,y:170};
tr+='<path d="M'+last.x+' '+last.y+' L'+(W-40)+' 40" stroke="var(--path)" stroke-width="4" stroke-dasharray="8 8" fill="none"/><line x1="'+(W-40)+'" y1="40" x2="'+(W-40)+'" y2="8" stroke="var(--ink)" stroke-width="2"/><path d="M'+(W-40)+' 8 L'+(W-15)+' 15 L'+(W-40)+' 22Z" fill="var(--good)"/><text x="'+(W-40)+'" y="60" text-anchor="middle" font-size="12" font-weight="700">'+L.goal+'</text>';
pts.forEach(function(p,i){var me=i===pts.length-1;tr+='<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(me?13:9)+'" fill="'+(MOOD[p.t.mood]||'var(--muted)')+'" stroke="var(--card)" stroke-width="3"/><text x="'+p.x+'" y="'+(p.y+4)+'" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--bg)">'+esc(p.t.tick)+'</text>'+(me?'<text x="'+p.x+'" y="'+(p.y-20)+'" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--accent)">'+L.here+'</text>':'')});
tr+='</svg>';
h+='<section><h2><span class="n">2</span>'+L.tr+'</h2>'+tr+'<div style="margin-top:8px">'+tl.slice().reverse().map(function(t){return '<div class="small"><b style="color:'+(MOOD[t.mood]||'var(--muted)')+'">#'+esc(t.tick)+' '+esc(t.mood)+'</b> <span class="muted">'+esc(t.at)+'</span> — '+esc(t.headline)+'</div>'}).join('')+'</div><p class="small muted">'+L.goalT+': '+esc(D.goal)+(D.hoursLeft!=null?' · <b>'+esc(D.hoursLeft)+' '+L.left+'</b>':'')+'</p></section>';
// 4 toolbox
var TOOLS=[['prompts','💬','Prompts','Prompturi'],['planMode','🗺️','Plan mode','Mod plan'],['memory','🧠','CLAUDE.md / memory','CLAUDE.md / memorie'],['skills','🧰','Skills','Skill-uri'],['slashCommands','⌨️','Slash commands','Comenzi /'],['subagents','🤝','Subagents','Subagenți'],['mcp','🔌','MCP connectors','Conectori MCP'],['hooks','🪝','Hooks','Hook-uri'],['loopsGoals','🔁','Loops & goals','Bucle & ținte'],['workflows','🏭','Workflows','Workflow-uri'],['artifacts','🖼️','Artifacts','Artefacte']];
h+='<section><h2><span class="n">3</span>'+L.tb+'</h2><div class="grid">'+TOOLS.map(function(t){var v=tb[t[0]]||{},c=+v.count||0;return '<div class="tile'+(c?'':' off')+'"><div class="ic">'+t[1]+'</div><div class="c">'+(c||'—')+'</div><div><b>'+(RO?t[3]:t[2])+'</b></div><div class="chips">'+arr(v.names).slice(0,5).map(function(s){return '<span class="chip">'+esc(s)+'</span>'}).join('')+'</div><div class="small muted">'+(c?esc(v.note):L.ny)+'</div></div>'}).join('')+'</div></section>';
// 5 ladder
var RUNG=RO?['Conversație','Ancorat','Verificat','Reutilizabil','Delegare','Autonom']:['Chatting','Grounded','Verified','Reusable','Delegating','Autonomous'],cur=+lvl.current||0,tgt=+lvl.target||3;
var ld='<svg viewBox="0 0 320 260"><line x1="60" y1="10" x2="60" y2="250" stroke="var(--path)" stroke-width="6"/><line x1="160" y1="10" x2="160" y2="250" stroke="var(--path)" stroke-width="6"/>';
RUNG.forEach(function(r,i){var y=235-i*42;ld+='<line x1="60" y1="'+y+'" x2="160" y2="'+y+'" stroke="'+(i<=cur?'var(--accent)':'var(--path)')+'" stroke-width="5"/><text x="172" y="'+(y+5)+'" font-size="13"'+(i===cur?' font-weight="700"':'')+'>'+i+' '+r+'</text>';if(i===tgt)ld+='<text x="40" y="'+(y+6)+'" font-size="18" text-anchor="middle" style="fill:var(--warn)">★</text>';if(i===cur)ld+='<circle cx="110" cy="'+(y-12)+'" r="11" fill="var(--accent)"/><text x="110" y="'+(y-8)+'" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--bg)">'+(RO?'noi':'us')+'</text>'});
ld+='</svg>';
// 6 compass
var ang={'on-track':0,'drifting':35,'pivoting':80}[dir.status]||0;
var cp='<svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="95" fill="var(--soft)" stroke="var(--line)" stroke-width="3"/><text x="110" y="34" text-anchor="middle" font-weight="700" style="fill:var(--good)">'+(RO?'ȚINTĂ':'GOAL')+'</text><g transform="rotate('+ang+' 110 110)"><path d="M110 40 L122 110 L110 120 L98 110Z" fill="var(--accent)"/><path d="M110 180 L122 110 L98 110Z" fill="var(--path)"/></g><circle cx="110" cy="110" r="6" fill="var(--ink)"/></svg>';
h+='<div class="two"><section><h2><span class="n">4</span>'+L.ld+'</h2>'+ld+'<p class="small">'+esc(lvl.why)+'</p></section><section><h2><span class="n">5</span>'+L.cp+'</h2>'+cp+'<p><b>'+L.head+':</b> '+esc(dir.heading)+'</p><p class="small muted">'+esc(dir.why)+'</p></section></div>';
// 7 moves
h+='<section><h2><span class="n">6</span>'+L.mv+'</h2>'+arr(D.nextMoves).slice(0,3).map(function(m,i){return '<div class="move"><b>'+(i+1)+'. '+esc(m.title)+'</b><div class="small muted">'+esc(m.why)+'</div><div class="try"><span>'+esc(m.tryThis)+'</span><button data-c="'+esc(m.tryThis)+'">'+L.copy+'</button></div></div>'}).join('')+'</section>';
// 8 wins/risks
var list=function(a,c){return '<div class="chips">'+arr(a).map(function(s){return '<span class="chip" style="border-color:'+c+'">'+esc(s)+'</span>'}).join('')+'</div>'};
h+='<div class="two"><section><h2>🏆 '+L.w+'</h2>'+list(D.wins,'var(--good)')+'</section><section><h2>⚠️ '+L.r+'</h2>'+list(D.risks,'var(--bad)')+'</section></div>';
// 9 glossary
h+='<section><details><summary>'+L.g+'</summary><dl>'+arr(D.glossary).map(function(g){return '<dt>'+esc(g.term)+'</dt><dd>'+esc(g.plain)+'</dd>'}).join('')+'</dl></details></section>';
h+='<footer>'+L.ft+' · '+L.st+' '+esc(D.startedAt)+'</footer>';
document.getElementById('app').innerHTML=h;
document.addEventListener('click',function(e){var t=e.target.getAttribute&&e.target.getAttribute('data-c');if(t==null)return;try{navigator.clipboard.writeText(t);e.target.textContent='copied'}catch(x){}});
})();
</script>
</body>
</html>
```

### FILE `.hackathon-pulse/DISTILL.md`
```md
# Distill. Read ONLY: .hackathon-pulse/digest.json, .hackathon-pulse/pulse.json (previous tick, may not exist), and this file.
Do not open the team's code or transcripts and do not run commands. Write .hackathon-pulse/pulse.json, then reply with one line: OK | <headline ≤15 words> | <move 1 ≤12 words>.

## Voice
- Write every text field in digest.language, for a 10-year-old: short labels (≤12 words); the pictures carry the idea. One analogy for the whole product.
- Evidence only: every claim comes from the digest (prompts, tool counts, skills, subagents, slash commands, MCP servers, commits, project setup). Never invent a tool they did not use.
- Never name people. Never quote secrets, links, emails or code. Say "the team".
- Be kind and specific: celebrate one real win and name one real risk.

## The ladder (how well the team uses Claude): pick the highest rung that has evidence
0 Chatting: prompts only, Claude edits on request.
1 Grounded: CLAUDE.md or memory, plan mode, task lists, /compact or /clear between tasks.
2 Verified: Claude runs the app or the tests and checks its own work; small commits.
3 Reusable: their own skills, slash commands (.claude/commands) and hooks; prompts they kept repeating turned into tools.
4 Delegating: subagents in parallel (Explore, general-purpose, custom agents); MCP connectors to real tools or data.
5 Autonomous: /loop, /goal, scheduled jobs or Workflows running with checks; artifacts that show results.
Target for the hackathon: rung 3–4 AND a working demo that matches the goal. Rung 5 only pays off once the demo works.
Direction rules:
- If the team is high on the ladder but shows no demo progress (commits, edits toward the goal), move #1 is "ship the demo", not another tool.
- If digest.hoursLeft < 6, all 3 moves serve the demo and the pitch: freeze scope, verify the flow end to end, prepare the presentation.

## Move catalog: pick 3 for the next 2 hours, the ones that unlock the next rung or the demo, each with a copy-paste "try this"
- no CLAUDE.md → `/init`, then add the 3 rules you keep repeating
- no plan mode on big changes → Shift+Tab into plan mode, approve the plan, then build
- no self-check → "run the app/tests and show me it works before you say done"
- same prompt typed 3+ times → "turn this into a skill" or a `.claude/commands/<name>.md`
- slow research / many files → "use 2 subagents in parallel: one maps X, one maps Y"
- needs real data or a service → `/mcp` to connect it
- formatting/test chores → `/hooks` to run them after every edit
- waiting on something → `/loop 10m <check>`; long goal → `/goal <outcome>`
- many independent steps → ask Claude to run them as parallel agents
- demo hard to show → "publish the demo as an artifact page"
- context heavy, answers drifting → `/compact` or `/clear` and restate the goal
- drifting from the goal → "cut X, the judges reward Y"

## pulse.json schema: keep previous timeline entries verbatim and append exactly one for this tick
{
 "team": "", "teamPage": "<digest.teamPage>", "language": "<digest.language>", "goal": "", "hoursLeft": <digest.hoursLeft>,
 "tick": <digest.tick>, "updatedAt": "<digest.now>", "startedAt": "<digest.startedAt>",
 "oneLiner": "what they build, ≤15 words", "analogy": "it's like ...",
 "building": {"problem": "", "idea": "", "demo": "what exists right now", "stack": ["..."]},
 "timeline": [{"tick": 1, "at": "", "headline": "", "mood": "exploring|building|stuck|pivot|shipping"}],
 "toolbox": {
   "prompts": {"count": 0, "names": [], "note": ""}, "planMode": {}, "memory": {}, "skills": {},
   "slashCommands": {}, "subagents": {}, "mcp": {}, "hooks": {}, "loopsGoals": {}, "workflows": {}, "artifacts": {}
 },
 "level": {"current": 0, "target": 3, "why": ""},
 "direction": {"heading": "", "status": "on-track|drifting|pivoting", "why": ""},
 "nextMoves": [{"title": "", "why": "", "tryThis": ""}, {}, {}],
 "wins": ["..."], "risks": ["..."],
 "glossary": [{"term": "subagent", "plain": "a helper Claude that works in its own room and reports back"}]
}
(Every toolbox entry has the shape {"count", "names", "note"}. "status" stays one of the three English keys.)
```
