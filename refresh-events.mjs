import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { refreshSources, sourceCatalog } from './ingest.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataPath = join(root, 'data', 'events.json');
const seedPath = join(root, 'data', 'seed-events.json');

let previousEvents = [];
let previousNewEvents = [];
try {
  const saved = JSON.parse(await readFile(dataPath, 'utf8'));
  previousEvents = Array.isArray(saved.events) ? saved.events : [];
  previousNewEvents = Array.isArray(saved.newEvents) ? saved.newEvents : [];
} catch {
  try { previousEvents = JSON.parse(await readFile(seedPath, 'utf8')); }
  catch { previousEvents = []; }
}

const result = await refreshSources(previousEvents, previousNewEvents);
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(dataPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

for (const source of sourceCatalog) {
  const status = result.statuses[source.id];
  console.log(`${status.ok ? 'OK' : 'WARN'} ${source.name}: ${status.count}件${status.error ? ` (${status.error})` : ''}`);
}
console.log(`取得結果を ${dataPath} に保存しました（${result.events.length}件）`);
