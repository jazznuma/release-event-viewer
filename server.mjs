import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshSources, sourceCatalog } from './ingest.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const cachePath = join(root, 'work', 'events-cache.json');
const seedPath = join(root, 'data', 'seed-events.json');
let stored = { events: [], statuses: {}, refreshedAt: '' };
let refreshing = false;

async function loadStoredEvents() {
  try { stored = JSON.parse(await readFile(cachePath, 'utf8')); }
  catch {
    try { stored.events = JSON.parse(await readFile(seedPath, 'utf8')); }
    catch { stored.events = []; }
  }
}

async function refreshAndSave() {
  if (refreshing) return false;
  refreshing = true;
  try {
    const update = await refreshSources(stored.events);
    stored = update;
    await mkdir(join(root, 'work'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(stored, null, 2), 'utf8');
    console.log(`Event refresh finished: ${stored.events.length} events`);
    return true;
  } catch (error) {
    console.error(`Event refresh failed: ${error.message || error}`);
    return false;
  } finally {
    refreshing = false;
  }
}

await loadStoredEvents();
setTimeout(refreshAndSave, 1200).unref();
setInterval(refreshAndSave, 6 * 60 * 60 * 1000).unref();

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function sendHome(res) {
  let html = await readFile(join(root, 'index.html'), 'utf8');
  const bootstrap = JSON.stringify(stored).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  html = html.replace('__INITIAL_EVENT_DATA__', bootstrap);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (pathname === '/' && req.method === 'GET') {
    await sendHome(res);
    return;
  }
  if (pathname === '/events.json' && req.method === 'GET') {
    sendJson(res, 200, { events: stored.events, statuses: stored.statuses, refreshedAt: stored.refreshedAt, refreshing });
    return;
  }
  if (pathname === '/sources.json' && req.method === 'GET') {
    sendJson(res, 200, { sources: sourceCatalog.map((source) => ({ ...source, status: stored.statuses[source.id] || null })), refreshedAt: stored.refreshedAt, refreshing });
    return;
  }
  if (pathname === '/refresh' && req.method === 'POST') {
    await refreshAndSave();
    await sendHome(res);
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Release Event Viewer: http://localhost:${port}`));
