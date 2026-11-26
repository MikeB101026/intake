// Test harness for the intake app: serves a copy of the repo with one debug hook (window.__ev = direct eval inside the
// app's private scope), a fake camera (Chromium fake media device), and a fake backend (page.route) the test can steer.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
function build(repo, SITE) {
  fs.rmSync(SITE, { recursive: true, force: true }); fs.mkdirSync(SITE, { recursive: true });
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(repo, f), path.join(SITE, f));
  let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const end = html.lastIndexOf('})();\n</script>');
  if (end < 0) throw new Error('could not find the end of the app script');
  html = html.slice(0, end) + 'window.__ev = s => eval(s);\n' + html.slice(end);
  html = html.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject('no sw in tests')");   // no SW cache in tests
  fs.writeFileSync(path.join(SITE, 'index.html'), html);
}
function serve(port, SITE) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
  });
  return new Promise(res => srv.listen(port, '127.0.0.1', () => res(srv)));
}
// backend(op, body, log) -> reply object (or a Promise of one); default: a calm backend that sorts every photo as 'inside'.
// port: pick a different one per test file if tests run at the same time (each port gets its own site copy).
async function start({ repo = require('path').resolve(__dirname, '..'), port = 8790 + Math.floor(Math.random() * 200), backend, linked = true, fakeCam = true } = {}) {
  const SITE = path.join(__dirname, 'site-' + port);
  build(repo, SITE);
  const srv = await serve(port, SITE);
  const args = fakeCam ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [];
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errs = [], calls = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  if (linked) await page.addInitScript(() => { localStorage.setItem('backendUrl', 'https://backend.test/exec'); localStorage.setItem('backendToken', 'tok'); });
  await page.route('https://backend.test/**', async route => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    calls.push({ op: body.op, prompt: (body.prompt || '').slice(0, 60), images: (body.images || []).length });
    let reply;
    try { reply = backend ? await backend(body.op, body, calls) : null; } catch (e) { return route.abort(); }
    if (reply === 'ABORT') return route.abort();
    if (reply == null) reply = defaultReply(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__ev === 'function');
  const ev = s => page.evaluate(s2 => window.__ev(s2), s);
  return { page, ctx, browser, ev, errs, calls, close: async () => { await browser.close(); srv.close(); fs.rmSync(SITE, { recursive: true, force: true }); } };
}
function defaultReply(body) {
  switch (body.op) {
    case 'ping': return { ok: true, v: 9, nextRow: 10 };
    case 'claude': {
      const p = body.prompt || '';
      if (/Decide "kind"/.test(p)) return { text: '{"kind":"inside","trk4":"","box":null}' };
      return { text: '{}' };
    }
    case 'warm': return { ok: true };
    case 'watch': return { names: [] };
    case 'dayRows': return { rows: [], nextRow: 10 };
    default: return { ok: true };
  }
}
module.exports = { start };
