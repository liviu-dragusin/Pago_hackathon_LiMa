// Flux de onboarding: intro → (Gmail sau demo) → progres scanare → confirmare furnizori → gata.
const API = '/api';
let pollTimer = null;
let jobId = null;

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const card = (inner) => `<section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">${inner}</section>`;

const shell = (inner) => `
  <main class="mx-auto max-w-md space-y-4 px-4 pb-10 pt-6">
    <header>
      <p class="text-sm font-semibold text-blue-600">Pago · Bun venit</p>
      <h1 class="text-2xl font-bold text-slate-900">Adu-ți furnizorii într-un singur loc</h1>
    </header>
    ${inner}
  </main>`;

export function mountOnboarding(root) {
  stopPolling();
  const params = new URLSearchParams(location.search);
  const auth = params.get('auth');
  if (auth) history.replaceState({}, '', location.pathname);

  if (auth === 'ok') return startScan(root, 'live');
  if (auth) return showError(root, authMessage(auth));
  renderIntro(root);
}

function authMessage(code) {
  return {
    denied: 'Ai refuzat accesul la Gmail. Poți încerca din nou sau folosi datele demo.',
    state: 'Sesiunea de autorizare a expirat. Încearcă din nou.',
    norefresh: 'Google nu a returnat o autorizare reînnoibilă. Încearcă din nou și acceptă accesul.',
    error: 'Conectarea la Gmail a eșuat. Verifică configurarea serverului.',
  }[code] || 'Conectarea la Gmail a eșuat.';
}

function renderIntro(root) {
  root.innerHTML = shell(`
    ${card(`
      <p class="text-slate-600">Găsim facturile din Gmail și îți propunem furnizorii. Tu alegi ce adaugi.</p>
      <a href="${API}/auth/google/start" class="mt-5 block rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700">
        Conectează Gmail
      </a>
      <p class="mt-3 text-xs text-slate-500">Acces doar la citire. Revocăm accesul imediat după scanare.</p>
      <button id="demo" class="mt-4 w-full rounded-xl px-4 py-3 font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50">
        Încearcă cu date demo
      </button>
    `)}
  `);
  root.querySelector('#demo').addEventListener('click', () => startScan(root, 'demo'));
}

function renderProgress(root, job) {
  const pct = job.total_emails ? Math.round((job.processed * 100) / job.total_emails) : 0;
  root.innerHTML = shell(`
    ${card(`
      <p class="font-semibold">Caut facturile tale…</p>
      <div class="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full bg-blue-600 transition-all" style="width:${pct}%"></div>
      </div>
      <p class="mt-3 text-sm text-slate-600">${job.processed} din ${job.total_emails} emailuri verificate</p>
    `)}
  `);
}

async function startScan(root, mode) {
  root.innerHTML = shell(card('<p class="text-slate-600">Pornim scanarea…</p>'));
  try {
    const res = await fetch(`${API}/scan/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Nu am putut porni scanarea.');
    jobId = data.job_id;
    poll(root);
  } catch (err) {
    showError(root, err.message);
  }
}

function poll(root) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/scan/status?id=${jobId}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error);
      if (job.status === 'done') {
        stopPolling();
        return showReview(root, job.error);
      }
      if (job.status === 'error') {
        stopPolling();
        return showError(root, job.error || 'Scanarea a eșuat.');
      }
      renderProgress(root, job);
    } catch (err) {
      stopPolling();
      showError(root, err.message);
    }
  }, 1200);
}

async function showReview(root, note) {
  const res = await fetch(`${API}/providers/discovered?job_id=${jobId}`);
  const { providers } = await res.json();

  if (!providers.length) {
    root.innerHTML = shell(card(`
      <p class="font-semibold">Nu am găsit facturi noi</p>
      <p class="mt-2 text-slate-600">Poți adăuga furnizorii manual din catalogul Pago.</p>
    `));
    return;
  }

  const rows = providers.map((p) => `
    <label class="flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ring-slate-200 hover:bg-slate-50">
      <input type="checkbox" class="mt-1 h-5 w-5 accent-blue-600" data-id="${p.id}" checked />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="truncate font-semibold">${esc(p.name)}</span>
          <span class="shrink-0 rounded-full px-2 py-0.5 text-xs ${p.catalog_id ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
            ${p.catalog_id ? 'din catalog Pago' : 'furnizor nou'}
          </span>
        </span>
        <span class="mt-1 block text-sm text-slate-600">
          ${esc(p.category || 'altele')}${p.client_code ? ` · cod client ${esc(p.client_code)}` : ''}
        </span>
        <span class="mt-1 block text-sm text-slate-700">
          Ultima factură: <b>${p.last_amount != null ? Number(p.last_amount).toFixed(2) : '–'} ${esc(p.currency || 'RON')}</b>
          ${p.last_due_date ? `· scadentă ${esc(p.last_due_date)}` : ''}
          · ${p.invoice_count} ${p.invoice_count === 1 ? 'factură' : 'facturi'}
        </span>
        ${p.iban && !p.iban_valid ? '<span class="mt-1 block text-xs text-red-600">IBAN-ul din factură nu s-a putut verifica. Confirmă-l înainte de plată.</span>' : ''}
      </span>
      ${p.has_invoice_pdf ? `<a href="${API}/providers/invoice?id=${p.id}" target="_blank" rel="noopener"
        class="flex shrink-0 items-center gap-1 self-start rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50">Factură PDF</a>` : ''}
    </label>`).join('');

  root.innerHTML = shell(`
    ${card(`
      <p class="font-semibold">Am găsit ${providers.length} furnizori în emailurile tale</p>
      <p class="mt-1 text-sm text-slate-600">Bifează-i pe cei pe care vrei să îi adaugi în Pago.</p>
      ${note ? `<p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">${esc(note)}</p>` : ''}
      <div class="mt-4 space-y-2">${rows}</div>
      <button id="confirm" class="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">
        Adaugă furnizorii selectați
      </button>
    `)}
  `);

  root.querySelector('#confirm').addEventListener('click', async (event) => {
    const ids = [...root.querySelectorAll('input[type=checkbox]:checked')].map((el) => Number(el.dataset.id));
    event.currentTarget.disabled = true;
    const res = await fetch(`${API}/providers/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, ids }),
    });
    const data = await res.json();
    if (!res.ok) return showError(root, data.error || 'Nu am putut salva furnizorii.');
    showDone(root, data.added);
  });
}

function showDone(root, count) {
  root.innerHTML = shell(card(`
    <p class="text-lg font-bold">Gata! Ai adăugat ${count} ${count === 1 ? 'furnizor' : 'furnizori'}</p>
    <p class="mt-2 text-slate-600">Facturile lor vor apărea în Pago, cu scadențele urmărite automat.</p>
    <a href="/" class="mt-5 block rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white">Mergi la facturi</a>
  `));
}

function showError(root, message) {
  root.innerHTML = shell(card(`
    <p class="font-semibold text-red-700">${esc(message)}</p>
    <button id="retry" class="mt-4 w-full rounded-xl px-4 py-3 font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50">
      Înapoi
    </button>
  `));
  root.querySelector('#retry').addEventListener('click', () => renderIntro(root));
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
