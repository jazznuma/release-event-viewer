const sources = [
  { id: 'tower-shibuya', label: 'タワーレコード 渋谷店', shortLabel: 'タワレコ渋谷', short: 'T', tone: 'tower', url: 'https://towershibuya.jp/' },
  { id: 'tower-all', label: 'タワーレコード 全店', shortLabel: 'タワレコ全店', short: 'T', tone: 'tower', url: 'https://tower.jp/STORE/EVENT' },
  { id: 'hmv-shibuya', label: 'HMV 渋谷', shortLabel: 'HMV渋谷', short: 'H', tone: 'hmv', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'hmv-other', label: 'HMV その他の店舗', shortLabel: 'HMVその他', short: 'H', tone: 'hmv', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'vv-all', label: 'ヴィレッジヴァンガード 全店', shortLabel: 'ヴィレヴァン', short: 'V', tone: 'vv', url: 'https://www.village-v.co.jp/event/' },
];

let events = [];
let newEvents = [];

const now = new Date();
const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const state = { selected: new Date(localToday), month: new Date(localToday.getFullYear(), localToday.getMonth(), 1), source: 'all', metroOnly: true, query: '', view: 'calendar' };
const $ = (selector) => document.querySelector(selector);
const pad = (n) => String(n).padStart(2, '0');
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fullDate = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const monthDate = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' });

function renderSources() {
  $('#source-list').innerHTML = `<button class="source-button ${state.source === 'all' ? 'selected' : ''}" data-source="all"><span class="source-mark all-mark">す</span><span>すべて</span></button>` + sources.map((source) => `<button class="source-button ${state.source === source.id ? 'selected' : ''}" data-source="${source.id}"><span class="source-mark ${source.tone}">${source.short}</span><span>${source.label}</span></button>`).join('');
  document.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', () => { state.source = button.dataset.source; render(); }));
}

function matchingEvents(date) {
  return events.filter((event) => event.date === iso(date) && matchesFilters(event));
}

function matchesFilters(event) {
  const term = state.query.trim().toLocaleLowerCase('ja');
  return (!state.metroOnly || isMetroEvent(event)) && (state.source === 'all' || state.source === event.sourceId) && `${event.title} ${event.artist} ${event.venue}`.toLocaleLowerCase('ja').includes(term);
}

function tokyoDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}`;
}

function shortEventDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day)).replace('月', '/').replace('日', '');
}

function eventCard(event, showEventDate = false) {
  const source = sources.find((item) => item.id === event.sourceId);
  const performer = event.artist || '公式ページで確認';
  const venue = event.venue || '店舗情報は公式ページをご確認ください';
  return `<article class="event-row ${showEventDate ? 'new-event-row' : ''}"><div class="event-schedule ${showEventDate ? 'new-event-schedule' : ''}"><time class="event-time" datetime="${event.date}${event.time ? `T${event.time}` : ''}">${event.time || '時間未定'}</time>${showEventDate ? `<span class="new-event-date">${shortEventDate(event.date)}</span>` : ''}</div><div class="event-main"><div class="event-facts"><span class="event-brand-mark ${source.tone}" aria-label="${source.shortLabel}">${source.short}</span><dl class="event-highlights"><div class="event-highlight"><dt>出演者</dt><dd>${performer}</dd></div><div class="event-highlight event-location"><dt>店舗・会場</dt><dd>${venue}</dd></div></dl></div><a href="${event.url}" target="_blank" rel="noopener noreferrer" class="event-title">${event.title}<span aria-hidden="true">↗</span></a><span class="event-source">情報源 ${source.shortLabel}</span></div></article>`;
}

function isMetroEvent(event) {
  const venue = event.venue || '';
  const metroVenue = /渋谷|下北沢|有明|豊洲|池袋|大宮|新宿|吉祥寺|錦糸町|亀有|立川|舞浜|イクスピアリ|TOKYO-BAY|東京ベイ|蘇我|津田沼|川口|越谷|レイクタウン|横浜|川崎|橋本|海老名|ららぽーとTOKYO-BAY|HMV&BOOKS SHIBUYA/i;
  if (metroVenue.test(venue)) return true;
  return /vv-all/.test(event.sourceId) && /(?:@|＠)\s*川崎/.test(event.title || '');
}

function renderCalendar() {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (const label of ['月', '火', '水', '木', '金', '土', '日']) cells.push(`<div class="weekday">${label}</div>`);
  for (let i = 0; i < 42; i++) {
    const day = i - mondayOffset + 1;
    const date = new Date(year, month, day);
    const inMonth = date.getMonth() === month;
    const selected = iso(date) === iso(state.selected);
    const isToday = iso(date) === iso(localToday);
    const hasEvent = matchingEvents(date).length > 0;
    cells.push(`<button class="day-cell ${inMonth ? '' : 'outside'} ${selected ? 'selected-day' : ''} ${isToday ? 'today-day' : ''}" data-date="${iso(date)}" ${inMonth ? '' : 'tabindex="-1"'}><span class="day-number">${date.getDate()}</span>${hasEvent ? '<span class="day-dot" aria-label="イベントあり"></span>' : ''}</button>`);
    if (day >= days && (i + 1) % 7 === 0) break;
  }
  $('#month-heading').textContent = monthDate.format(state.month);
  $('#calendar-grid').innerHTML = cells.join('');
  document.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => { state.selected = new Date(`${button.dataset.date}T00:00:00`); if (state.selected.getMonth() !== state.month.getMonth()) state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1); render(); }));
}

function renderAgenda() {
  const items = matchingEvents(state.selected).sort((a, b) => a.time.localeCompare(b.time));
  const selectedSource = sources.find((source) => source.id === state.source);
  $('#selected-heading').textContent = state.source === 'all' ? 'すべてのイベント' : state.source === 'tower-shibuya' ? 'タワーレコード渋谷店' : selectedSource.label;
  $('#agenda-title').textContent = fullDate.format(state.selected);
  $('#agenda-count').textContent = `${items.length}件`;
  $('#agenda-list').innerHTML = items.length ? items.map((event) => eventCard(event)).join('') : `<div class="empty-state"><p>${state.query || state.source !== 'all' ? '条件に合うイベントはありません。' : 'この日のイベントはありません。'}</p><span>別の日付を選ぶか、公式ページをご確認ください。</span></div>`;
}

function renderNewEvents() {
  const items = newEvents.filter((event) => event.firstSeenAt && matchesFilters(event));
  const groups = new Map();
  for (const event of items) {
    const key = tokyoDateKey(event.firstSeenAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  $('#new-event-count').textContent = items.length ? items.length : '';
  $('#new-events-view').innerHTML = groups.size ? [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, dailyEvents]) => `<section class="new-event-day"><header><h2>${shortEventDate(date)}に追加</h2><span>${dailyEvents.length}件</span></header><div>${dailyEvents.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((event) => eventCard(event, true)).join('')}</div></section>`).join('') : '<div class="empty-state"><p>新しく追加されたイベントはまだありません。</p><span>次回の定期取得後に、追加されたイベントがここに表示されます。</span></div>';
}

function renderViews() {
  const isCalendar = state.view === 'calendar';
  $('#planner-grid').hidden = !isCalendar;
  $('#new-events-view').hidden = isCalendar;
  $('#page-subtitle').textContent = isCalendar ? '日付を選ぶと、その日の開催予定を確認できます。' : '取得で新たに見つかったイベントを、検出日ごとに表示します。';
  $('#calendar-view-button').classList.toggle('selected', isCalendar);
  $('#new-view-button').classList.toggle('selected', !isCalendar);
  $('#calendar-view-button').setAttribute('aria-pressed', String(isCalendar));
  $('#new-view-button').setAttribute('aria-pressed', String(!isCalendar));
  renderNewEvents();
}

function render() { renderSources(); renderCalendar(); renderAgenda(); renderViews(); }
$('#prev-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
$('#next-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
function moveSelectedDay(amount) {
  state.selected = new Date(state.selected.getFullYear(), state.selected.getMonth(), state.selected.getDate() + amount);
  state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  render();
}
$('#prev-day').addEventListener('click', () => moveSelectedDay(-1));
$('#next-day').addEventListener('click', () => moveSelectedDay(1));
$('#today-button').addEventListener('click', () => { state.selected = new Date(localToday); state.month = new Date(localToday.getFullYear(), localToday.getMonth(), 1); render(); });
$('#metro-only').addEventListener('change', (event) => { state.metroOnly = event.target.checked; render(); });
$('#search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
$('#calendar-view-button').addEventListener('click', () => { state.view = 'calendar'; renderViews(); });
$('#new-view-button').addEventListener('click', () => { state.view = 'new'; renderViews(); });

function loadEvents() {
  try {
    const data = JSON.parse($('.layout').dataset.eventData);
    events = Array.isArray(data.events) ? data.events : [];
    newEvents = Array.isArray(data.newEvents) ? data.newEvents : [];
    if (data.refreshedAt) {
      const refreshed = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(data.refreshedAt));
      const hasErrors = Object.values(data.statuses || {}).some((status) => status && !status.ok);
      $('#update-status').textContent = `最終取得 ${refreshed}${hasErrors ? ' ・一部取得できず' : ''}`;
    } else {
      $('#update-status').textContent = data.refreshing ? '情報を取得中' : '初回取得前';
    }
    render();
  } catch (error) {
    events = [];
    render();
    $('#agenda-list').innerHTML = `<div class="empty-state"><p>イベント情報を読み込めませんでした。</p><span>${error.message}</span></div>`;
  }
}
loadEvents();
