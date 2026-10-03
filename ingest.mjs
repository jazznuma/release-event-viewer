const headers = {
  'User-Agent': 'ReleaseEventViewer/0.1 (personal event calendar; polite periodic fetch)',
  'Accept': 'text/html,application/xhtml+xml',
};
const timeoutMs = 15_000;

export const sourceCatalog = [
  { id: 'tower-shibuya', name: 'タワーレコード 渋谷店', url: 'https://towershibuya.jp/events' },
  { id: 'tower-all', name: 'タワーレコード 全店', url: 'https://tower.jp/STORE/EVENT' },
  { id: 'hmv-shibuya', name: 'HMV 渋谷', url: 'https://www.hmv.co.jp/store/event/' },
  { id: 'hmv-other', name: 'HMV その他の店舗', url: 'https://www.hmv.co.jp/store/event/' },
  { id: 'vv-all', name: 'ヴィレッジヴァンガード 全店', url: 'https://www.village-v.co.jp/event/' },
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
  return /渋谷|shibuya/i.test(venue) ? 'hmv-shibuya' : 'hmv-other';
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

function fromTowerEventsPage(html, pageUrl) {
  const results = [];
  const cards = html.matchAll(/<div\b[^>]*class=["'][^"']*\barchive-listitem-info\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi);
  for (const card of cards) {
    const markup = card[1];
    const anchor = markup.match(/<a\b[^>]*href=["']([^"']*\/20\d{2}\/\d{2}\/\d{2}\/\d+[^"']*)["'][^>]*>/i);
    if (!anchor) continue;
    const title = textOf(markup.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] || '');
    const meta = textOf(markup.match(/<li\b[^>]*class=["'][^"']*\bcal-ym-load\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i)?.[1] || markup);
    const date = extractDate(meta);
    if (!title || !date) continue;
    const tagMarkup = markup.match(/<li\b[^>]*class=["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i)?.[1] || '';
    const artist = [...tagMarkup.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((tag) => textOf(tag[1])).filter(Boolean).join(' / ');
    results.push({ title, artist, venue: 'タワーレコード渋谷店', date, time: extractTime(meta), url: new URL(anchor[1], pageUrl).href, sourceId: 'tower-shibuya', kind: '' });
  }
  return results;
}

function fromTowerAllEvents(html, pageUrl) {
  const results = [];
  for (const cardMatch of html.matchAll(/<dl\b[^>]*class=["'][^"']*\bdateBox\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi)) {
    const markup = cardMatch[1];
    const titleMarkup = markup.match(/<dd\b[^>]*class=["'][^"']*\bevent-title\b[^"']*["'][^>]*>([\s\S]*?)<\/dd>/i)?.[1] || '';
    const title = textOf(titleMarkup);
    const date = extractDate(textOf(markup));
    if (!title || !date) continue;
    const eventAnchor = titleMarkup.match(/<a\b[^>]*href=["']([^"']+)["']/i);
    if (!eventAnchor) continue;
    const venueLink = [...markup.matchAll(/<a\b[^>]*href=["']([^"']*\/store\/(?!event\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({ url: match[1], name: textOf(match[2]) }))
      .find((link) => link.name);
    const descriptions = [...markup.matchAll(/<dd\b([^>]*)>([\s\S]*?)<\/dd>/gi)];
    const eventTitleIndex = descriptions.findIndex((match) => /\bclass=["'][^"']*\bevent-title\b/i.test(match[1]));
    const artist = eventTitleIndex >= 0 ? textOf(descriptions[eventTitleIndex + 1]?.[2] || '') : '';
    const titleVenue = title.match(/(?:@|＠)\s*([^@＠]+)$/)?.[1]?.trim();
    results.push({
      title, artist, venue: venueLink?.name || titleVenue || '店舗情報は公式ページを確認',
      date, time: extractTime(textOf(markup)), url: new URL(eventAnchor[1], pageUrl).href,
      sourceId: 'tower-all', kind: '',
    });
  }
  return results;
}

function fromHmvEvents(html, pageUrl) {
  const events = [];
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']*\/store\/event\/\d+\/?(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const anchorIndex = anchor.index || 0;
    const dlIndex = html.lastIndexOf('<dl', anchorIndex);
    const openDlEnd = html.indexOf('>', dlIndex);
    const closeDl = html.indexOf('</dl>', (anchor.index || 0) + anchor[0].length);
    if (dlIndex < 0 || openDlEnd < 0 || openDlEnd > anchorIndex || closeDl < 0) continue;
    const markup = html.slice(dlIndex, closeDl + 5);
    const text = textOf(markup);
    const date = extractDate(text);
    const linkText = textOf(anchor[2]);
    const primaryTitle = textOf(markup.match(/<dt\b[^>]*>[\s\S]*?<a\b[^>]*href=["'][^"']*\/store\/event\/\d+\/?(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/dt>/i)?.[1] || '');
    const eventType = textOf(markup.match(/<dd\b[^>]*class=["'][^"']*\beventTitle\b[^"']*["'][^>]*>([\s\S]*?)<\/dd>/i)?.[1] || '');
    const performer = primaryTitle && eventType && primaryTitle !== eventType ? primaryTitle : '';
    const title = eventType || primaryTitle || linkText;
    if (!date || !title) continue;
    const venueAnchor = [...markup.matchAll(/<a\b[^>]*href=["']([^"']*\/store\/(?!event\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({ href: match[1], text: textOf(match[2]) }))
      .find((match) => match.text && /HMV|店|渋谷|Namba|NAMBA|HAKATA|Hakata/i.test(match.text));
    const venue = venueAnchor?.text || text.match(/(?:HMV(?:&BOOKS|\s+record shop)?\s*[^。|]{2,60})/i)?.[0]?.trim() || 'HMV店舗';
    const url = new URL(anchor[1], pageUrl).href;
    events.push({ title, artist: performer, venue, date, time: extractTime(text), url, sourceId: sourceForVenue(venue, 'hmv'), kind: '' });
  }
  return events;
}

function shopNameFromCode(value) {
  const code = Number.parseInt(value, 10);
  return new Map([
    [560, '渋谷本店'], [13, '下北沢店'], [479, '名古屋パルコ'],
    [587, 'さっぽろ東急'], [246, 'レイクタウンPLUS+'],
  ]).get(code) || '';
}

function locationFromVvEvent(item) {
  const shop = shopNameFromCode(item['eligible-shops']);
  const namedLocation = item.name?.match(/(?:in\s*VV|inVV|@|＠)\s*([^@＠]+)$/i)?.[1]?.trim();
  const venue = item.venue?.trim();
  const location = shop || venue || namedLocation || 'その他店舗';
  return shop && venue && !location.includes(venue) && !venue.includes(location) ? `${location}・${venue}` : location;
}

function performerFromVvTitle(title = '') {
  const name = title.replace(/^\s*\d{1,2}\/\d{1,2}\([^)]*\)\s*/, '').trim();
  const jointAct = name.match(/^\s*【(.+?)\s*合同/);
  if (jointAct) return jointAct[1].replace(/[【】]/g, '').trim();
  const bracketNames = [...name.matchAll(/【([^】]+)】/g)].map((match) => match[1].trim());
  if (bracketNames.length) return bracketNames.join(' / ');
  const author = name.match(/([^「『「\s]+?先生)サイン会/);
  if (author) return author[1].trim();
  const venueThenArtist = name.match(/(?:@|＠)[^【】]+【([^】]+)】/);
  if (venueThenArtist) return venueThenArtist[1].trim();
  const quotedName = name.match(/^[「『]([^」』]+)[」』]/);
  if (quotedName) return quotedName[1].trim();
  return name.split(/\s+(?=\d+(?:st|nd|rd|th)\b)|(?=フリーイベント|フリーライブ|ミニライブ|発売記念|Release Event|Release\b|inVV|@|＠|サイン会|インストアイベント|[「『])/i)[0].trim();
}

async function scrapeVvAll() {
  const endpoint = 'https://www.village-v.co.jp/common/js/topics.json';
  const items = JSON.parse(await fetchPage(endpoint));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  return items.filter((item) => item.type === 'リリイベ' && item['event-date'] !== '2070-01-01' && /^20\d{2}-\d{2}-\d{2}$/.test(item['event-date'] || '') && item['event-date'] >= today)
    .map((item) => {
      const date = item['event-date'];
      const time = String(item['event-time'] || item['event-time:'] || '').match(/[0-2]\d:[0-5]\d/)?.[0] || '';
      const url = new URL(item.link, 'https://www.village-v.co.jp/').href;
      return {
        id: `vv-all:${date}:${time || 'time-unknown'}:${url}`,
        title: textOf(item.name || ''), artist: performerFromVvTitle(item.name || ''), venue: locationFromVvEvent(item), date, time,
        url, sourceId: 'vv-all', kind: '', fetchedAt: new Date().toISOString(),
      };
    });
}

async function fetchPage(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const prefix = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
  const headerCharset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  const metaCharset = prefix.match(/<meta\b[^>]*(?:charset\s*=\s*["']?([^\s"'/>;]+)|content\s*=\s*["'][^"']*charset\s*=\s*([^\s"'/>;]+))/i);
  const charset = headerCharset || metaCharset?.[1] || metaCharset?.[2] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

async function scrapeSource(sourceId, url, hmv = false) {
  const html = await fetchPage(url);
  if (hmv) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fromHmvEvents(html, url).filter((event) => new Date(`${event.date}T00:00:00`) >= today).map((event) => ({
      ...event,
      id: `${event.sourceId}:${event.date}:${event.time || 'time-unknown'}:${event.url}`,
      fetchedAt: new Date().toISOString(),
    }));
  }
  if (sourceId === 'tower-all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fromTowerAllEvents(html, url).filter((event) => event.date && new Date(`${event.date}T00:00:00`) >= today).map((event) => ({
      ...event,
      id: `${event.sourceId}:${event.date}:${event.time || 'time-unknown'}:${event.url}`,
      fetchedAt: new Date().toISOString(),
    }));
  }
  let events = fromJsonLd(html, hmv ? 'hmv' : sourceId, url);
  if (events.length === 0) events = fromCards(html, hmv ? 'hmv' : sourceId, url);
  events = [...events, ...fromEventAnchors(html, hmv ? 'hmv' : sourceId, url)];
  if (sourceId === 'tower-shibuya') events = fromTowerEventsPage(html, url);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return events.filter((event) => event.date && event.title && new Date(`${event.date}T00:00:00`) >= today).map((event) => ({
    ...event,
    id: `${event.sourceId}:${event.date}:${event.time || 'time-unknown'}:${event.url}`,
    venue: event.venue || sourceCatalog.find((source) => source.id === event.sourceId)?.name || sourceId,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function refreshSources(previousEvents = [], previousNewEvents = []) {
  const refreshedAt = new Date().toISOString();
  const statuses = {};
  const bySource = new Map();
  for (const source of sourceCatalog) bySource.set(source.id, previousEvents.filter((event) => event.sourceId === source.id));
  const tasks = [
    ['tower-shibuya', async () => {
      const base = 'https://towershibuya.jp/events';
      const firstPage = await fetchPage(base);
      const pages = new Set([base]);
      for (const pageLink of firstPage.matchAll(/href=["']([^"']*\?page_num=\d+[^"']*)["']/gi)) pages.add(new URL(pageLink[1], base).href);
      const all = [...fromTowerEventsPage(firstPage, base)];
      let pageCount = 1;
      for (const pageUrl of [...pages].slice(1, 10)) {
        const html = await fetchPage(pageUrl);
        all.push(...fromTowerEventsPage(html, pageUrl));
        pageCount++;
      }
      const unique = new Map(all.map((event) => [`${event.url}|${event.date}|${event.time}`, event]));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return [...unique.values()].filter((event) => new Date(`${event.date}T00:00:00`) >= today).map((event) => ({
        ...event,
        id: `${event.sourceId}:${event.date}:${event.time || 'time-unknown'}:${event.url}`,
        fetchedAt: new Date().toISOString(),
      }));
    }],
    ['tower-all', () => scrapeSource('tower-all', 'https://tower.jp/STORE/EVENT')],
    ['vv-all', () => scrapeVvAll()],
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
    const bestByEvent = new Map();
    for (const event of hmvEvents) {
      const key = `${event.url}|${event.date}|${event.time}`;
      const previous = bestByEvent.get(key);
      const score = (event.venue && event.venue !== 'HMV店舗' ? 2 : 0) + (event.artist ? 1 : 0) + event.title.length / 1000;
      const previousScore = previous ? (previous.venue && previous.venue !== 'HMV店舗' ? 2 : 0) + (previous.artist ? 1 : 0) + previous.title.length / 1000 : -1;
      if (!previous || score > previousScore) bestByEvent.set(key, event);
    }
    const uniqueHmvEvents = [...bestByEvent.values()].map((event) => ({ ...event, sourceId: sourceForVenue(event.venue, 'hmv') }));
    for (const sourceId of ['hmv-shibuya', 'hmv-other']) {
      const events = uniqueHmvEvents.filter((event) => event.sourceId === sourceId);
      bySource.set(sourceId, events);
      statuses[sourceId] = { ok: events.length > 0, count: events.length, checkedAt: new Date().toISOString(), error: events.length ? '' : 'イベント情報を抽出できませんでした' };
    }
  } catch (error) {
    for (const sourceId of ['hmv-shibuya', 'hmv-other']) statuses[sourceId] = { ok: false, count: bySource.get(sourceId).length, checkedAt: new Date().toISOString(), error: String(error.message || error) };
  }
  const merged = [...bySource.values()].flat();
  const unique = new Map();
  for (const event of merged) unique.set(`${event.sourceId}|${event.url}|${event.date}|${event.time}`, event);
  const previousById = new Map(previousEvents.map((event) => [`${event.sourceId}|${event.url}|${event.date}|${event.time}`, event]));
  const tracked = [...unique.entries()].map(([id, event]) => {
    const previous = previousById.get(id);
    return { ...event, firstSeenAt: previous ? (previous.firstSeenAt || null) : refreshedAt };
  });
  const addedEvents = tracked.filter((event) => !previousById.has(`${event.sourceId}|${event.url}|${event.date}|${event.time}`) && event.firstSeenAt);
  const newEventsById = new Map(previousNewEvents.map((event) => [`${event.sourceId}|${event.url}|${event.date}|${event.time}`, event]));
  for (const event of addedEvents) newEventsById.set(`${event.sourceId}|${event.url}|${event.date}|${event.time}`, event);
  return {
    events: tracked.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    newEvents: [...newEventsById.values()].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)),
    statuses,
    refreshedAt,
  };
}
