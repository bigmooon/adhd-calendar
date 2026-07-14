'use strict';

/* ═══════════ 먼슬리 ═══════════ */
function renderMonth() {
  $('#mTitle').textContent = `${monthCursor.getFullYear()}년 ${monthCursor.getMonth() + 1}월`;
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const todayKey = fmtDate(new Date());
  const eventDates = {};
  for (const ev of store.events) {
    (eventDates[ev.date] = eventDates[ev.date] || []).push(ev);
  }
  const ghDue = ghDueByDate(); // ② GitHub 마감 있는 날
  const planMarks = planMarksByDate(); // 계획 마감일·날짜 있는 단계
  const grid = $('#calGrid');
  grid.innerHTML = WD.map((w, i) => `<div class="wd${i === 0 ? ' sun' : ''}">${w}</div>`).join('');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(gridStart, i);
    const key = fmtDate(d);
    const cell = document.createElement('div');
    const classes = ['cell'];
    if (d.getMonth() !== monthCursor.getMonth()) classes.push('dim');
    if (d.getDay() === 0) classes.push('sun');
    if (key === selectedKey) classes.push('sel');
    else if (key === todayKey) classes.push('today-ring');
    cell.className = classes.join(' ');
    const starBadge = dayBlocks(store.tracker, key) >= 18 ? '<span class="star-b">⭐</span>' : ''; // 3시간+
    const evs = eventDates[key] || [];
    const bars = evs.slice(0, 3)
      .map((ev) => `<span class="ev-bar" style="border-left-color:${tagColor(ev.tag)};background:color-mix(in srgb, ${tagColor(ev.tag)} 18%, #fff)" title="${esc(ev.title)}">${esc(ev.title)}</span>`).join('');
    const more = evs.length > 3 ? `<span class="ev-more">+${evs.length - 3}개</span>` : '';
    const ghMark = ghDue[key] ? '<span class="gh-mark" title="GitHub 마감">🐙</span>' : '';
    const planMark = planMarks[key] ? '<span class="plan-mark" title="계획 일정/마감">🎯</span>' : '';
    cell.innerHTML = `<span class="d">${d.getDate()}</span>${starBadge}${ghMark}${planMark}<span class="evs">${bars}${more}</span>`;
    cell.addEventListener('click', () => { selectedKey = key; renderAll(); });
    frag.appendChild(cell);
  }
  grid.appendChild(frag);
}

/* ═══════════ 선택일 패널 ═══════════ */
function renderDayPane() {
  const d = parseDate(selectedKey);
  $('#dayTitle').textContent = `⭐ ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;

  const events = store.events.filter((ev) => ev.date === selectedKey)
    .sort((a, b) => (a.start || '99').localeCompare(b.start || '99')); // 시간 미정은 뒤로
  const evHtml = events.map((ev) => `
        <div>
          <div class="sched">
            <i class="tagdot" style="background:${tagColor(ev.tag)}"></i>
            <time class="${ev.start ? '' : 'notime'}">${ev.start || '🕓 미정'}</time> <span style="flex:1">${esc(ev.title)}</span>
            <button class="mini-x" data-del-event="${ev.id}" aria-label="삭제">✕</button>
          </div>
          ${ev.desc ? `<div class="sched-desc">${esc(ev.desc)}</div>` : ''}
        </div>`).join('');
  const ghHtml = (ghDueByDate()[selectedKey] || []).map((it) => `
        <div class="sched gh-sched">
          <i class="tagdot" style="background:#c9a0dc"></i>
          <time>🐙</time> <a href="${it.url}" target="_blank" rel="noopener" style="flex:1;color:inherit">${esc(it.repo)} #${it.number} ${esc(it.title)}</a>
        </div>`).join('');
  $('#dayEvents').innerHTML = (evHtml + ghHtml) || '<p class="empty-note">일정이 없어요. ＋로 추가해보세요!</p>';

  const checks = store.checks[selectedKey] || {};
  $('#dayRoutines').innerHTML = store.routines.length
    ? store.routines.map((r) => `
        <div class="routine k-${r.kind}${r.enabled ? '' : ' off'}">
          <span>${{ alert: '⏰', ai: '🔮', habit: '🤸' }[r.kind]}</span> ${esc(r.name)}
          <time>${r.time}</time>
          <button class="ck${checks[r.id] ? ' on' : ''}" data-check="${r.id}" aria-label="완료 체크">✓</button>
          <button class="mini-x" data-del-routine="${r.id}" aria-label="삭제">✕</button>
        </div>`).join('')
    : '<p class="empty-note">루틴이 없어요.</p>';

  const blocks = dayBlocks(store.tracker, selectedKey);
  $('#sumBlocks').textContent = `${blocks} / ${SLOTS}`;
  $('#sumTime').textContent = blocksToTime(blocks);
}

/* ═══════════ 10분 트래커 ═══════════ */
function renderTracker() {
  const d = parseDate(selectedKey);
  $('#trkDate').textContent = `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;

  $('#paintChips').innerHTML = [
    ...store.tags.map((t) => `<button class="pchip${paintTagId === t.id ? ' on' : ''}" data-paint="${t.id}"><i style="background:${t.color}"></i>${esc(t.name)}</button>`),
    `<button class="pchip${paintTagId === null ? ' on' : ''}" data-paint=""><i style="background:var(--empty)"></i>지우개</button>`,
  ].join('');

  const slots = store.tracker[selectedKey] || [];
  const dayStart = parseDate(selectedKey);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const nowIdx = Math.floor((Date.now() - dayStart.getTime()) / 600000); // 지금이 몇 번째 칸인지
  const grid = $('#trkGrid');
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let h = 0; h < TRACK_HOURS; h += 1) {
    const hourLabel = (DAY_START_HOUR + h) % 24;
    const row = document.createElement('div');
    row.className = 'trk-row'
      + (hourLabel === 0 ? ' midnight' : '')
      + (hourLabel < DAY_START_HOUR ? ' day2' : '');
    const lab = document.createElement('button');
    lab.className = 'h';
    lab.dataset.hour = h;
    lab.textContent = pad(hourLabel);
    lab.title = '클릭: 이 시간대 한 줄 채우기/지우기';
    row.appendChild(lab);
    for (let b = 0; b < 6; b += 1) {
      const i = h * 6 + b;
      const cell = document.createElement('i');
      cell.className = 'blk' + (i === nowIdx ? ' now' : '');
      cell.dataset.slot = i;
      cell.title = `${slotLabel(i)} – ${slotLabel(i + 1)}`;
      if (slots[i]) cell.style.background = tagColor(slots[i]);
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }
  grid.appendChild(frag);
}

// 드래그 페인팅: 시작 칸 기준으로 칠하기/지우기 모드를 고정하고,
// 드래그 중엔 칸만 즉시 칠한 뒤 pointerup에서 한 번만 저장/전체 렌더
let dragSlots = null;
let dragMode = null; // 'paint' | 'erase'

function liveSummary(slots) {
  const n = filledCount(slots);
  $('#sumBlocks').textContent = `${n} / ${SLOTS}`;
  $('#sumTime').textContent = blocksToTime(n);
}
function applyPaint(cell) {
  const i = Number(cell.dataset.slot);
  const val = dragMode === 'paint' ? paintTagId : null;
  if (dragSlots[i] === val) return;
  dragSlots[i] = val;
  cell.style.background = val ? tagColor(val) : '';
  liveSummary(dragSlots);
}
$('#trkGrid').addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.blk');
  if (!cell) return;
  e.preventDefault();
  try { e.target.releasePointerCapture(e.pointerId); } catch { /* 터치 드래그 허용용, 실패해도 무해 */ }
  const cur = store.tracker[selectedKey] || [];
  dragSlots = Array.from({ length: SLOTS }, (_, k) => cur[k] ?? null);
  dragMode = (paintTagId === null || dragSlots[Number(cell.dataset.slot)] === paintTagId) ? 'erase' : 'paint';
  applyPaint(cell);
});
$('#trkGrid').addEventListener('pointerover', (e) => {
  if (!dragSlots) return;
  const cell = e.target.closest('.blk');
  if (cell) applyPaint(cell);
});
document.addEventListener('pointerup', () => {
  if (!dragSlots) return;
  const next = dragSlots;
  dragSlots = null;
  setStore({ tracker: { ...store.tracker, [selectedKey]: next } });
});
// 시간 라벨 클릭: 그 시간대 6칸을 현재 태그로 채우기 (이미 다 채워져 있으면 지우기)
$('#trkGrid').addEventListener('click', (e) => {
  const lab = e.target.closest('.h');
  if (!lab) return;
  const h = Number(lab.dataset.hour);
  const cur = store.tracker[selectedKey] || [];
  const next = Array.from({ length: SLOTS }, (_, k) => cur[k] ?? null);
  const idxs = Array.from({ length: 6 }, (_, b) => h * 6 + b);
  const allSame = paintTagId !== null && idxs.every((i) => next[i] === paintTagId);
  for (const i of idxs) next[i] = (paintTagId === null || allSame) ? null : paintTagId;
  setStore({ tracker: { ...store.tracker, [selectedKey]: next } });
});
$('#paintChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-paint]');
  if (!chip) return;
  paintTagId = chip.dataset.paint === '' ? null : chip.dataset.paint;
  renderTracker();
});

/* ═══════════ 위클리 ═══════════ */
function renderWeek() {
  const H0 = 8, H1 = 22, PX = 24;
  const start = weekStart(weekCursor);
  const end = addDays(start, 6);
  const todayKey = fmtDate(new Date());
  $('#wkRange').textContent = `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;

  $('#wkHead').innerHTML = '<div></div>' + Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return `<div class="col-h${fmtDate(d) === todayKey ? ' is-today' : ''}">${WD[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}</div>`;
  }).join('');

  const body = $('#wkBody');
  body.innerHTML = '';
  const times = document.createElement('div');
  times.className = 'wk-times';
  for (let h = H0; h <= H1; h += 2) {
    const s = document.createElement('span');
    s.textContent = `${pad(h)}:00`;
    s.style.top = `${(h - H0) * PX}px`;
    times.appendChild(s);
  }
  body.appendChild(times);

  for (let i = 0; i < 7; i += 1) {
    const key = fmtDate(addDays(start, i));
    const col = document.createElement('div');
    col.className = 'wk-col';
    let allDayN = 0; // ponytail: 시간 미정 일정은 컬럼 상단에 칩으로 쌓음 (08시대 겹침은 드물어 무시)
    for (const ev of store.events.filter((x) => x.date === key)) {
      const el = document.createElement('div');
      const noTime = !ev.start || !ev.end;
      if (noTime) {
        el.className = 'evt evt-allday';
        el.style.cssText = `top:${allDayN * 18}px;background:${tagColor(ev.tag)}`;
        allDayN += 1;
      } else {
        const s = Math.max(timeToHours(ev.start), H0);
        const e = Math.min(timeToHours(ev.end), H1);
        if (e <= s) continue;
        el.className = 'evt';
        el.style.cssText = `top:${(s - H0) * PX}px;height:${(e - s) * PX - 3}px;background:${tagColor(ev.tag)}`;
      }
      el.textContent = ev.title;
      el.title = `${ev.title}${noTime ? ' (시간 미정)' : ` (${ev.start}–${ev.end})`}${ev.desc ? ' — ' + ev.desc : ''} · 클릭해서 삭제`;
      el.addEventListener('click', () => {
        if (confirm(`'${ev.title}' 일정을 삭제할까요?`)) {
          setStore({ events: store.events.filter((x) => x.id !== ev.id) });
        }
      });
      col.appendChild(el);
    }
    body.appendChild(col);
  }
}
