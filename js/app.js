'use strict';

/* ═══════════ 사이드바: 태그 ═══════════ */
function renderTags() {
  $('#tagList').innerHTML = store.tags.map((t) => `
    <div class="tag-row">
      <input type="color" value="${t.color}" data-tag-color="${t.id}" aria-label="${esc(t.name)} 색" />
      <input type="text" value="${esc(t.name)}" data-tag-name="${t.id}" maxlength="20" aria-label="태그 이름" />
      <button class="mini-x" data-del-tag="${t.id}" aria-label="삭제">✕</button>
    </div>`).join('');
}
$('#tagAdd').addEventListener('click', () => {
  setStore({ tags: [...store.tags, { id: uid(), name: '새 태그', color: '#c9b8ea' }] });
});
$('#tagList').addEventListener('change', (e) => {
  const colorId = e.target.dataset.tagColor;
  const nameId = e.target.dataset.tagName;
  if (!colorId && !nameId) return;
  const value = e.target.value;
  setStore({
    tags: store.tags.map((t) => {
      if (t.id === colorId) return { ...t, color: value };
      if (t.id === nameId && value.trim()) return { ...t, name: value.trim() };
      return t;
    }),
  });
});

/* ═══════════ 이벤트/루틴 CRUD ═══════════ */
$('#eventAddBtn').addEventListener('click', () => {
  $('#evDate').value = selectedKey;
  $('#evTag').innerHTML = store.tags.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  setEvTimeMode('timed'); // 열 때마다 기본은 시간 지정
  $('#eventDialog').showModal();
});
$('#evCancel').addEventListener('click', () => $('#eventDialog').close());

function setEvTimeMode(mode) {
  $('#evTimeMode').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#evTimeRow').style.display = mode === 'allday' ? 'none' : '';
}
$('#evTimeMode').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (btn) setEvTimeMode(btn.dataset.mode);
});
$('#eventForm').addEventListener('submit', (e) => {
  const allday = $('#evTimeMode .seg-btn.on').dataset.mode === 'allday';
  const title = $('#evTitle').value.trim();
  const date = $('#evDate').value;
  const start = allday ? '' : $('#evStart').value;
  const end = allday ? '' : $('#evEnd').value;
  const desc = $('#evDesc').value.trim();
  if (!title || !date || (!allday && (!start || !end || end <= start))) {
    e.preventDefault();
    toast('⚠️', '입력을 확인해주세요 (종료는 시작 이후여야 해요)');
    return;
  }
  setStore({ events: [...store.events, { id: uid(), title, date, start, end, tag: $('#evTag').value, desc }] });
  $('#eventForm').reset();
});

$('#routineAddBtn').addEventListener('click', () => $('#routineDialog').showModal());
$('#routineForm').addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const name = $('#rtName').value.trim();
  if (!name) { e.preventDefault(); toast('⚠️', '이름을 입력해주세요'); return; }
  setStore({
    routines: [...store.routines, { id: uid(), name, time: $('#rtTime').value, kind: $('#rtKind').value, enabled: true }],
  });
  requestNotifyPermission();
  $('#routineForm').reset();
});

// 위임: 삭제/체크 버튼들
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.delEvent) {
    setStore({ events: store.events.filter((x) => x.id !== btn.dataset.delEvent) });
  } else if (btn.dataset.delRoutine) {
    if (confirm('이 루틴을 삭제할까요?')) {
      setStore({ routines: store.routines.filter((r) => r.id !== btn.dataset.delRoutine) });
    }
  } else if (btn.dataset.check) {
    const prev = store.checks[selectedKey] || {};
    setStore({ checks: { ...store.checks, [selectedKey]: { ...prev, [btn.dataset.check]: !prev[btn.dataset.check] } } });
  } else if (btn.dataset.delRepo) {
    setStore({ repos: store.repos.filter((r) => r.name !== btn.dataset.delRepo) });
  } else if (btn.dataset.delTag) {
    if (store.tags.length <= 1) { toast('⚠️', '태그는 1개 이상 필요해요'); return; }
    if (confirm('태그를 삭제할까요? (기존 기록의 색은 회색으로 보여요)')) {
      if (paintTagId === btn.dataset.delTag) paintTagId = null;
      setStore({ tags: store.tags.filter((t) => t.id !== btn.dataset.delTag) });
    }
  } else if (btn.dataset.toggleRoutine) {
    setStore({
      routines: store.routines.map((r) => r.id === btn.dataset.toggleRoutine ? { ...r, enabled: !r.enabled } : r),
    });
    requestNotifyPermission();
  } else if (btn.dataset.rec) {
    const rec = CLAUDE_RECS[Number(btn.dataset.rec)];
    setStore({ events: [...store.events, { id: uid(), title: rec.title, date: selectedKey, start: rec.start, end: rec.end, tag: 'ai' }] });
    toast('🔮', `'${rec.title}' 일정을 추가했어요!`);
  } else if (btn.dataset.toggleRepo) {
    openRepo = openRepo === btn.dataset.toggleRepo ? null : btn.dataset.toggleRepo;
    renderRepos();
  } else if (btn.dataset.mergePr) {
    mergePr(btn.dataset.repo, btn.dataset.mergePr);
  } else if (btn.dataset.closeIssue) {
    closeIssue(btn.dataset.repo, btn.dataset.closeIssue);
  }
});

/* ═══════════ Claude 추천 루틴 ═══════════ */
// ponytail: 정적 추천 목록 — 실제 Claude API 연동은 별도 백엔드/스크립트 단계에서
const CLAUDE_RECS = [
  { ic: '✨', title: 'Deep Work 블록',       start: '13:00', end: '15:00' },
  { ic: '🌱', title: '짧은 휴식 & 스트레칭', start: '15:20', end: '15:40' },
  { ic: '💻', title: '구현 & 테스트 블록',   start: '16:00', end: '18:00' },
  { ic: '📝', title: '회고 & 정리',          start: '20:00', end: '20:30' },
];
function renderRecs() {
  $('#recList').innerHTML = CLAUDE_RECS.map((r, i) => `
    <div class="rec"><span class="ic">${r.ic}</span>
      <div class="body">${r.start} – ${r.end}<b>${r.title}</b></div>
      <button class="btn-sm" data-rec="${i}">＋</button>
    </div>`).join('');
}

/* ═══════════ 약 알람 카드 + 알림 ═══════════ */
function renderMed() {
  const meds = store.routines.filter((r) => r.kind === 'alert');
  $('#medList').innerHTML = meds.length
    ? meds.map((r) => `
        <div class="med-row"><span>⏰</span>
          <div class="body">${esc(r.name)}<time>${r.time} · 매일</time></div>
          <button class="toggle${r.enabled ? ' on' : ''}" data-toggle-routine="${r.id}" role="switch" aria-checked="${r.enabled}" aria-label="알람 ${r.enabled ? '끄기' : '켜기'}"></button>
        </div>`).join('')
    : '<p class="empty-note" style="padding:0 16px 8px">약/알람 루틴이 없어요. 아래에서 추가하세요.</p>';
}
$('#medAdd').addEventListener('click', () => {
  const name = $('#medName').value.trim();
  if (!name) { toast('⚠️', '알람 이름을 입력해주세요'); return; }
  $('#medName').value = '';
  setStore({ routines: [...store.routines, { id: uid(), name, time: $('#medTime').value, kind: 'alert', enabled: true }] });
  requestNotifyPermission();
});

function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function checkAlarms() {
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const todayKey = fmtDate(now);
  for (const r of store.routines) {
    const fireKey = `${todayKey}|${r.id}`;
    if (!r.enabled || r.time !== hhmm || firedAlarms.has(fireKey)) continue;
    firedAlarms.add(fireKey);
    toast({ alert: '⏰', ai: '🔮', habit: '🤸' }[r.kind], `${r.time} · ${r.name} 시간이에요!`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('몰입캘린더 🌙', { body: `${r.time} · ${r.name}` });
    }
  }
}
setInterval(checkAlarms, 20000);

/* ═══════════ 토스트 ═══════════ */
function toast(icon, msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ═══════════ 네비게이션 ═══════════ */
$('#mPrev').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderMonth(); });
$('#mNext').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderMonth(); });
$('#mToday').addEventListener('click', () => { monthCursor = new Date(); selectedKey = fmtDate(new Date()); renderAll(); });
$('#wPrev').addEventListener('click', () => { weekCursor = addDays(weekCursor, -7); renderWeek(); });
$('#wNext').addEventListener('click', () => { weekCursor = addDays(weekCursor, 7); renderWeek(); });
$('#wToday').addEventListener('click', () => { weekCursor = new Date(); renderWeek(); });

/* ═══════════ 렌더 루트 ═══════════ */
function renderAll() {
  renderMonth();
  renderDayPane();
  renderDayPlans();
  renderPlans();
  renderTracker();
  renderWeek();
  renderDash();
  renderRepos();
  renderTags();
  renderRecs();
  renderMed();
}
renderAll();
fetchRepoStats();
loadProgress();

/* ═══════════ 셀프테스트 (?selftest=1) ═══════════ */
if (new URLSearchParams(location.search).has('selftest')) {
  const results = [];
  const check = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  check('fmtDate', fmtDate(new Date(2025, 4, 15)) === '2025-05-15');
  check('blocksToTime', blocksToTime(24) === '4시간 00분');
  check('SLOTS 114칸', SLOTS === 114);
  check('slotLabel 자정 순환', slotLabel(96) === '00:00' && slotLabel(113) === '02:50');
  check('weekStart(월)', weekStart(new Date(2025, 4, 15)).getDate() === 12); // 2025-05-15(목) → 5/12(월)
  const today = fmtDate(new Date());
  const yesterday = fmtDate(addDays(new Date(), -1));
  const fixture = { [today]: ['coding'], [yesterday]: ['cs', 'cs'] };
  check('computeStreak', computeStreak(fixture, today) === 2);
  check('computeXp', computeXp(fixture) === 3);
  const counts = rangeCounts(fixture, addDays(new Date(), -29), 30);
  check('rangeCounts', counts.cs === 2 && counts.coding === 1);
  const el = document.createElement('div');
  el.id = 'selftest';
  el.textContent = results.every((r) => r.startsWith('PASS')) ? `SELFTEST PASS (${results.length})` : results.join(' | ');
  document.body.appendChild(el);
}
