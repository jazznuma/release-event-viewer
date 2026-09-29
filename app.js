const sources = [
  { id: 'tower-shibuya', label: 'タワーレコード 渋谷店', shortLabel: 'タワレコ渋谷', short: 'T', tone: 'tower', url: 'https://towershibuya.jp/' },
  { id: 'tower-all', label: 'タワーレコード 全店', shortLabel: 'タワレコ全店', short: 'T', tone: 'tower', url: 'https://tower.jp/STORE/EVENT' },
  { id: 'hmv-shibuya', label: 'HMV 渋谷', shortLabel: 'HMV渋谷', short: 'H', tone: 'hmv', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'hmv-other', label: 'HMV その他の店舗', shortLabel: 'HMVその他', short: 'H', tone: 'hmv', url: 'https://www.hmv.co.jp/store/event/sitemap/' },
  { id: 'vv-shibuya', label: 'ヴィレッジヴァンガード 渋谷本店', shortLabel: 'ヴィレヴァン渋谷', short: 'V', tone: 'vv', url: 'https://www.village-v.co.jp/event/' },
];

let events = [];

const now = new Date();
const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const state = { selected: new Date(localToday), month: new Date(localToday.getFullYear(), localToday.getMonth(), 1), source: 'all', query: '' };
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
  const term = state.query.trim().toLocaleLowerCase('ja');
  return events.filter((event) => event.date === iso(date) && (state.source === 'all' || state.source === event.sourceId) && `${event.title} ${event.artist} ${event.venue}`.toLocaleLowerCase('ja').includes(term));
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
  const heading = iso(state.selected) === iso(localToday) ? '今日のイベント' : `${fullDate.format(state.selected)}のイベント`;
  $('#selected-heading').textContent = heading;
  $('#agenda-title').textContent = fullDate.format(state.selected);
  $('#agenda-count').textContent = `${items.length}件`;
  $('#agenda-list').innerHTML = items.length ? items.map((event) => {
    const source = sources.find((item) => item.id === event.sourceId);
    return `<article class="event-row"><time class="event-time" datetime="${event.date}T${event.time}">${event.time}</time><div class="event-main"><a href="${event.url}" target="_blank" rel="noopener noreferrer" class="event-title">${event.title}<span aria-hidden="true">↗</span></a><p class="event-details">${event.artist}<span>・</span>${event.venue}</p><span class="event-source"><i class="source-mark small ${source.tone}">${source.short}</i>${source.shortLabel}</span></div></article>`;
  }).join('') : `<div class="empty-state"><p>${state.query || state.source !== 'all' ? '条件に合うイベントはありません。' : 'この日のイベントはありません。'}</p><span>別の日付を選ぶか、公式ページをご確認ください。</span></div>`;
}

function render() { renderSources(); renderCalendar(); renderAgenda(); }
$('#prev-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
$('#next-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
$('#today-button').addEventListener('click', () => { state.selected = new Date(localToday); state.month = new Date(localToday.getFullYear(), localToday.getMonth(), 1); render(); });
$('#search').addEventListener('input', (event) => { state.query = event.target.value; render(); });

function loadEvents() {
  try {
    const data = JSON.parse($('.layout').dataset.eventData);
    events = Array.isArray(data.events) ? data.events : [];
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
