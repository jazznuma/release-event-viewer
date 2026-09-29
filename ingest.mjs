const headers = {
  'User-Agent': 'ReleaseEventViewer/0.1 (personal event calendar; polite periodic fetch)',
  'Accept': 'text/html,application/xhtml+xml',
};
const timeoutMs = 15_000;

export const sourceCatalog = [
  { id: 'tower-shibuya', name: 'タワーレコード 渋谷店', url: 'https://towershibuya.jp/' },
  { id: 'tower-all', name: 'タワーレコード 全店', url: 'https://tower.jp/STORE/EVENT' },
  { id: 'hmv-shibuya', name: 'HMV 渋谷', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'hmv-other', name: 'HMV その他の店舗', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'vv-shibuya', name: 'ヴィレッジヴァンガード 渋谷本店', url: 'https://www.village-v.co.jp/event/' },
];

const decodeEntities = (value = '') => value
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const textOf = (html = '') => decodeEntities(html
  .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/[\t\r\n ]+/g, ' ').trim();

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractDate(text) {
  const iso = text.match(/20\d{2}[年./-]\s*\d{1,2}[月./-]\s*\d{1,2}日?/);
  if (iso) return normalizeDate(iso[0].replace(/[年月]/g, '-').replace(/[日.]/g, '').replaceAll('/', '-'));
  const short = text.match(/(?:開催日|日時|日程|DATE)[^\d]{0,12}(\d{1,2})[月/.-](\d{1,2})日?/i);
  if (short) return `${new Date().getFullYear()}-${String(Number(short[1])).padStart(2, '0')}-${String(Number(short[2])).padStart(2, '0')}`;
  return '';
}

function extractTime(text) {
  const match = text.match(/(?:開演|開始|START|日時|DATE)?[^\d]{0,12}([01]?\d|2[0-3])[:：]([0-5]\d)/i);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function sourceForVenue(venue, fallback) {
  if (fallback !== 'hmv') return fallback;
  return /渋谷/.test(venue) ? 'hmv-shibuya' : 'hmv-other';
}

function fromJsonLd(html, sourceId, pageUrl) {
  const found = [];
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some((type) => type === 'Event' || type === 'MusicEvent')) {
      const location = typeof node.location === 'string' ? node.location : node.location?.name || '';
      const date = normalizeDate(node.startDate);
      const time = node.startDate?.match?.(/T(\d{2}:\d{2})/)?.[1] || '';
      const title = node.name?.trim?.() || '';
      const url = node.url || pageUrl;
      if (date && title) found.push({ title, artist: node.performer?.name || '', venue: location, date, time, url: new URL(url, pageUrl).href, sourceId: sourceForVenue(location, sourceId), kind: node.eventAttendanceMode || '' });
    }
    walk(node['@graph']);
    walk(node.itemListElement);
  };
  for (const block of blocks) {
    try { walk(JSON.parse(block[1])); } catch { /* malformed publisher JSON-LD; try card parsing */ }
  }
  return found;
}

function fromCards(html, sourceId, pageUrl) {
  const results = [];
  const cards = html.matchAll(/<(article|li)\b[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const card of cards) {
    const markup = card[2];
    const text = textOf(markup);
    const date = extractDate(text);
    if (!date) continue;
    const anchors = [...markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const candidate = anchors.find((anchor) => textOf(anchor[2]).length > 4 && !/^https?:/i.test(textOf(anchor[2])));
    if (!candidate) continue;
    const title = textOf(candidate[2]);
    const hmvVenue = sourceId === 'hmv' ? text.match(/HMV(?:&BOOKS| record shop)?\s*(?:SHIBUYA|渋谷)[^。|]{0,18}/i)?.[0]?.trim() : '';
    const venue = hmvVenue || text.match(/(?:会場|開催場所|店舗)[:：]?\s*([^。|]{2,70})/)?.[1]?.trim() || '';
    if (sourceId === 'vv-shibuya' && !/渋谷/.test(`${venue} ${text}`)) continue;
    results.push({ title, artist: '', venue, date, time: extractTime(text), url: new URL(candidate[1], pageUrl).href, sourceId: sourceForVenue(venue, sourceId), kind: '' });
  }
  return results;
}

function fromEventAnchors(html, sourceId, pageUrl) {
  const results = [];
  const pattern = sourceId === 'vv-shibuya'
    ? /\/event\/\d+\//i
    : sourceId === 'hmv'
      ? /\/store\/event\/\d+\//i
      : sourceId === 'tower-all'
        ? /\/store\/event\//i
        : null;
  if (!pattern) return results;
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!pattern.test(anchor[1])) continue;
    const title = textOf(anchor[2]);
    if (title.length < 6) continue;
    const index = anchor.index || 0;
    const context = textOf(html.slice(Math.max(0, index - 2200), Math.min(html.length, index + anchor[0].length + 2200)));
    const date = extractDate(context);
    if (!date) continue;
    const hmvVenue = sourceId === 'hmv' ? context.match(/HMV(?:&BOOKS| record shop)?\s*(?:SHIBUYA|渋谷)[^。]{0,18}/i)?.[0]?.trim() : '';
    const venue = hmvVenue || context.match(/(?:HMV(?:&BOOKS| record shop)?\s*[^。]{0,35}|[^。]{0,30}店(?:内)?イベントスペース)/i)?.[0]?.trim() || '';
    if (sourceId === 'vv-shibuya' && !/渋谷本店/.test(context)) continue;
    results.push({ title, artist: '', venue, date, time: extractTime(context), url: new URL(anchor[1], pageUrl).href, sourceId: sourceForVenue(venue, sourceId), kind: '' });
  }
  return results;
}

function fromTowerShibuyaAnchors(html, pageUrl) {
  const results = [];
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']*\/20\d{2}\/\d{2}\/\d{2}\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = textOf(anchor[2]);
    if (!title || /このイベント|詳細|今月のイベント/.test(title)) continue;
    results.push({ title, artist: '', venue: 'タワーレコード渋谷店', date: '', time: '', url: new URL(anchor[1], pageUrl).href, sourceId: 'tower-shibuya', kind: '' });
  }
  return results;
}

async function fetchPage(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function scrapeSource(sourceId, url, hmv = false) {
  const html = await fetchPage(url);
  let events = fromJsonLd(html, hmv ? 'hmv' : sourceId, url);
  if (events.length === 0) events = fromCards(html, hmv ? 'hmv' : sourceId, url);
  events = [...events, ...fromEventAnchors(html, hmv ? 'hmv' : sourceId, url)];
  if (sourceId === 'tower-shibuya') {
    const linkedEvents = fromTowerShibuyaAnchors(html, url);
    for (const linked of linkedEvents.slice(0, 12)) {
      try {
        const detail = await fetchPage(linked.url);
        const structured = fromJsonLd(detail, sourceId, linked.url)[0];
        const body = textOf(detail);
        const date = structured?.date || extractDate(body);
        if (date) events.push({ ...linked, ...structured, title: structured?.title || linked.title, date, time: structured?.time || extractTime(body), venue: structured?.venue || linked.venue });
      } catch { /* one unavailable detail page should not block the other events */ }
    }
  }
  if (sourceId === 'vv-shibuya') events = events.filter((event) => /渋谷/.test(`${event.venue} ${event.title}`));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return events.filter((event) => event.date && event.title && new Date(`${event.date}T00:00:00`) >= today).map((event) => ({
    ...event,
    id: `${event.sourceId}:${event.date}:${event.time || 'time-unknown'}:${event.url}`,
    venue: event.venue || sourceCatalog.find((source) => source.id === event.sourceId)?.name || sourceId,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function refreshSources(previousEvents = []) {
  const statuses = {};
  const bySource = new Map();
  for (const source of sourceCatalog) bySource.set(source.id, previousEvents.filter((event) => event.sourceId === source.id));
  const tasks = [
    ['tower-shibuya', () => scrapeSource('tower-shibuya', 'https://towershibuya.jp/')],
    ['tower-all', () => scrapeSource('tower-all', 'https://tower.jp/STORE/EVENT')],
    ['vv-shibuya', () => scrapeSource('vv-shibuya', 'https://www.village-v.co.jp/event/')],
  ];
  for (const [sourceId, scrape] of tasks) {
    try {
      const events = await scrape();
      if (events.length === 0 && bySource.get(sourceId).length > 0) throw new Error('イベントを抽出できず、保存済み情報を維持しました');
      bySource.set(sourceId, events);
      statuses[sourceId] = { ok: events.length > 0, count: events.length, checkedAt: new Date().toISOString(), error: events.length ? '' : 'イベント情報を抽出できませんでした' };
    } catch (error) {
      statuses[sourceId] = { ok: false, count: bySource.get(sourceId).length, checkedAt: new Date().toISOString(), error: String(error.message || error) };
    }
  }
  try {
    const hmvEvents = await scrapeSource('hmv-shibuya', 'https://www.hmv.co.jp/store/event/sitemap/', true);
    if (hmvEvents.length === 0 && (bySource.get('hmv-shibuya').length + bySource.get('hmv-other').length) > 0) throw new Error('イベントを抽出できず、保存済み情報を維持しました');
    for (const sourceId of ['hmv-shibuya', 'hmv-other']) {
      const events = hmvEvents.filter((event) => event.sourceId === sourceId);
      bySource.set(sourceId, events);
      statuses[sourceId] = { ok: events.length > 0, count: events.length, checkedAt: new Date().toISOString(), error: events.length ? '' : 'イベント情報を抽出できませんでした' };
    }
  } catch (error) {
    for (const sourceId of ['hmv-shibuya', 'hmv-other']) statuses[sourceId] = { ok: false, count: bySource.get(sourceId).length, checkedAt: new Date().toISOString(), error: String(error.message || error) };
  }
  const merged = [...bySource.values()].flat();
  const unique = new Map();
  for (const event of merged) unique.set(`${event.sourceId}|${event.url}|${event.date}|${event.time}`, event);
  return { events: [...unique.values()].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), statuses, refreshedAt: new Date().toISOString() };
}
