// No-JS end-to-end smoke test: submits server-rendered forms exactly like a browser without JavaScript.
// Usage: npm run test:smoke   (reads ADMIN_EMAIL / ADMIN_PASSWORD from .env via --env-file)
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const email = process.env.SMOKE_EMAIL ?? process.env.ADMIN_EMAIL;
const password = process.env.SMOKE_PASSWORD ?? process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (or SMOKE_EMAIL / SMOKE_PASSWORD).');
  process.exit(2);
}
const jar = new Map();
let failures = 0;

const decode = (s) =>
  s.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
}
function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
function storeCookies(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const [k, v] = pair.split('=');
    if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(raw) || v === '') jar.delete(k);
    else jar.set(k, v);
  }
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: 'manual',
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  storeCookies(res);
  return res;
}
async function get(path) {
  let res = await req(path);
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && hops++ < 5)
    res = await req(new URL(res.headers.get('location'), BASE).pathname + new URL(res.headers.get('location'), BASE).search);
  return { res, html: await res.text(), url: res.url };
}
function forms(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map((m) => ({
    attrs: m[1],
    fields: [...m[2].matchAll(/<input\b([^>]*)>/g)].map((i) => ({
      name: decode(/name="([^"]*)"/.exec(i[1])?.[1] ?? ''),
      value: decode(/value="([^"]*)"/.exec(i[1])?.[1] ?? ''),
      type: /type="([^"]*)"/.exec(i[1])?.[1] ?? 'text',
      checked: /checked/.test(i[1]),
    })),
    body: m[2],
  }));
}
async function submit(pagePath, html, pick, values) {
  const form = forms(html).find(pick);
  if (!form) throw new Error(`form not found on ${pagePath}`);
  const fd = new FormData();
  for (const f of form.fields) {
    if (!f.name) continue;
    if (f.type === 'radio' && !f.checked) continue;
    if (!(f.name in values)) fd.append(f.name, f.value);
  }
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  const res = await req(pagePath, { method: 'POST', body: fd, headers: { origin: BASE } });
  return { res, html: await res.text() };
}

// 1. Wrong password stays on login with a generic error.
let page = await get('/login');
let r = await submit('/login', page.html, (f) => f.fields.some((x) => x.name === '$ACTION_KEY'), {
  email,
  password: 'definitely-wrong',
});
check('wrong password shows generic error', r.html.includes('Invalid email or password.'), `status ${r.res.status}`);
check('password is not echoed back', !r.html.includes('definitely-wrong'));

// 2. Correct login sets httpOnly cookie and redirects.
page = await get('/login');
r = await submit('/login', page.html, (f) => f.fields.some((x) => x.name === '$ACTION_KEY'), { email, password });
const setCookie = r.res.headers.getSetCookie().join(' | ');
check('login redirects', r.res.status === 303, `status ${r.res.status} → ${r.res.headers.get('location')}`);
check(
  'session cookie is HttpOnly + SameSite=Lax',
  /cl_session=cls_/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=lax/i.test(setCookie),
);

// 3. Clients list.
page = await get('/clients');
check('clients list renders seeded data', page.html.includes('Acme Corporation'));
check('per-page title metadata', page.html.includes('<title>Clients · Client Ledger</title>'));

// 4. Create client (with a validation error first).
page = await get('/clients/new');
r = await submit('/clients/new', page.html, (f) => f.fields.some((x) => x.name === '$ACTION_KEY'), {
  name: '',
  email: 'bad',
  phone: '',
  notes: '',
});
check('client form shows field errors and keeps input', r.html.includes('Name is required') && r.html.includes('value="bad"'));
const unique = `E2E Co ${Date.now()}`;
r = await submit('/clients/new', page.html, (f) => f.fields.some((x) => x.name === '$ACTION_KEY'), {
  name: unique,
  email: `e2e${Date.now()}@test.local`,
  phone: '+1 555 0100',
  notes: 'from e2e',
});
const location = r.res.headers.get('location') ?? '';
check('create client redirects to detail', /^\/clients\/[0-9a-f-]{36}\?created=1$/.test(location), location);
const clientPath = location.split('?')[0];

// 5. Record a movement.
page = await get(location);
check(
  'client detail shows created notice + title',
  page.html.includes('Client created') && page.html.includes(`<title>${unique} · Client Ledger</title>`),
);
r = await submit(clientPath, page.html, (f) => f.fields.some((x) => x.name === 'amount'), {
  type: 'EXPENSE',
  amount: '1,234.56',
  occurredOn: '2026-11-20',
  description: '=cmd|evil',
});
check('movement recorded', r.html.includes('Expense of $1,234.56 recorded.'), `status ${r.res.status}`);
page = await get(clientPath);
check('balance reflects movement', page.html.includes('-$1,234.56'));

// 6. CSV export.
const csv = await get(`/exports/clients/${clientPath.split('/').pop()}`);
const csvText = csv.html;
check(
  'csv export downloads',
  csv.res.headers.get('content-type')?.includes('text/csv') &&
    /attachment/.test(csv.res.headers.get('content-disposition') ?? ''),
);
check('csv neutralises formula injection', csvText.includes(`'=cmd|evil`));

// 7. Reports + activity.
page = await get('/reports?range=this-year');
check('reports page renders', page.res.status === 200 && page.html.includes('By client'));
page = await get('/activity');
check('activity shows audit trail', page.html.includes('Movement added') && page.html.includes('Failed sign-in'));
page = await get('/clients/00000000-0000-7000-8000-000000000000');
// Streaming (loading.tsx) commits HTTP 200 before notFound() runs — assert the not-found UI instead. See docs/architecture.md.
check('unknown client → not-found page', page.html.includes('find that page'));

// 8. Logout clears cookie and protects pages again.
page = await get('/clients');
r = await submit('/clients', page.html, (f) => f.body.includes('Sign out<') && !f.body.includes('all devices'), {});
check('logout redirects to login', r.res.status === 303 && (r.res.headers.get('location') ?? '').startsWith('/login'));
const after = await req('/clients');
check('protected page redirects after logout', after.status === 307 && after.headers.get('location')?.includes('/login'));

console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
