import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = join(root, 'site');
const [template, eventData] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'data', 'events.json'), 'utf8'),
]);
const escapedData = JSON.stringify(JSON.parse(eventData))
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
let html = template.replace('__INITIAL_EVENT_DATA__', escapedData);
html = html.replace(
  '<form action="/refresh" method="post"><button class="refresh-button" type="submit">今すぐ更新</button></form>',
  '<span class="refresh-note">毎日自動更新</span>',
);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(join(output, 'index.html'), html, 'utf8'),
  cp(join(root, 'app.js'), join(output, 'app.js')),
  cp(join(root, 'styles.css'), join(output, 'styles.css')),
]);
console.log(`GitHub Pages用ファイルを ${output} に作成しました`);
