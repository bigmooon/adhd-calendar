'use strict';

/* ═══════════ 스토어 ═══════════ */
const KEY = 'molip.calendar.v1';
const DEFAULT_STORE = {
  owner: 'bigmooon',
  tags: [
    { id: 'coding',  name: '코딩테스트', color: '#8fbef5' },
    { id: 'cs',      name: 'CS·학습',   color: '#b9a8f2' },
    { id: 'project', name: '프로젝트',   color: '#a9e6bd' },
    { id: 'resume',  name: '이력서',     color: '#f9afc9' },
    { id: 'routine', name: '루틴/알람',  color: '#f9a3a3' },
    { id: 'ai',      name: 'AI/Claude', color: '#cdb8f8' },
    { id: 'etc',     name: '기타',       color: '#d9d5e6' },
  ],
  events: [],   // {id,title,date,start,end,tag}
  routines: [   // {id,name,time,kind:alert|ai|habit,enabled}
    { id: 'r1', name: '비타민 약 복용',      time: '09:00', kind: 'alert', enabled: true },
    { id: 'r2', name: 'Claude 코워크 루틴',  time: '13:00', kind: 'ai',    enabled: true },
    { id: 'r3', name: '스트레칭 & 물마시기', time: '16:00', kind: 'habit', enabled: true },
  ],
  checks: {},   // {date:{routineId:true}}
  tracker: {},  // {date:(tagId|null)[84]}
  repos: [{ name: 'algo-study-notebooks' }, { name: 'adhd-calendar' }],
  ghToken: '', // GitHub Fine-grained PAT (이 브라우저 localStorage에만 저장, repo엔 안 올라감)
};

let store = loadStore();
function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STORE);
    return { ...structuredClone(DEFAULT_STORE), ...JSON.parse(raw) };
  } catch (error) {
    console.error('스토어 로드 실패, 기본값 사용:', error);
    return structuredClone(DEFAULT_STORE);
  }
}
function setStore(patch) {
  store = { ...store, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (error) { console.error('저장 실패:', error); toast('⚠️', '저장에 실패했어요 (저장공간 확인)'); }
  renderAll();
}

/* ═══════════ 순수 헬퍼 ═══════════ */
const TRACK_HOURS = 19;        // 08:00 ~ 다음날 03:00
const SLOTS = TRACK_HOURS * 6; // 10분 단위 114칸 (기존 84칸 데이터는 뒤가 빈칸으로 호환)
const DAY_START_HOUR = 8;
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7)); // 월요일 시작
const timeToHours = (t) => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

function blocksToTime(n) {
  const min = n * 10;
  return `${Math.floor(min / 60)}시간 ${pad(min % 60)}분`;
}
function slotLabel(i) { // 칸 인덱스 → "HH:MM" (자정 넘어가면 00~02시로 순환)
  const m = DAY_START_HOUR * 60 + i * 10;
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}
function filledCount(slots) { return (slots || []).filter(Boolean).length; }
function dayBlocks(tracker, key) { return filledCount(tracker[key]); }
function computeXp(tracker) { // ponytail: 1블록=1XP, 100XP=1레벨 — 밸런싱 필요하면 여기만 수정
  return Object.values(tracker).reduce((sum, slots) => sum + filledCount(slots), 0);
}
function computeStreak(tracker, todayKey) {
  let streak = 0;
  let cursor = parseDate(todayKey);
  if (dayBlocks(tracker, fmtDate(cursor)) === 0) cursor = addDays(cursor, -1); // 오늘 아직 0칸이면 어제부터
  while (dayBlocks(tracker, fmtDate(cursor)) > 0) { streak += 1; cursor = addDays(cursor, -1); }
  return streak;
}
function rangeCounts(tracker, fromDate, days) { // 태그별 채운 칸 수
  const counts = {};
  for (let i = 0; i < days; i += 1) {
    const slots = tracker[fmtDate(addDays(fromDate, i))] || [];
    for (const tagId of slots) if (tagId) counts[tagId] = (counts[tagId] || 0) + 1;
  }
  return counts;
}

/* ═══════════ 상태 ═══════════ */
// 새벽 3시 전이면 아직 "어제"의 트래킹 데이가 진행 중 → 어제를 기본 선택
const bootNow = new Date();
let selectedKey = fmtDate(bootNow.getHours() < 3 ? addDays(bootNow, -1) : bootNow);
let monthCursor = new Date();
let weekCursor = new Date();
let paintTagId = store.tags[0].id;
const firedAlarms = new Set(); // 이 세션에서 이미 울린 알람 (dateKey|routineId)

const $ = (sel) => document.querySelector(sel);
const tagById = (id) => store.tags.find((t) => t.id === id);
const tagColor = (id) => (tagById(id) || {}).color || 'var(--empty)';
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ═══════════ 하늘 데코 ═══════════ */
(function sky() {
  const host = $('#sky');
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const glyphs = ['✦', '✧', '＋', '·'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 46; i += 1) {
    const s = document.createElement('span');
    s.className = 'sky-star';
    s.textContent = glyphs[Math.floor(rnd() * glyphs.length)];
    s.style.cssText = `left:${rnd() * 100}%;top:${rnd() * 100}%;font-size:${8 + rnd() * 12}px;animation-delay:${rnd() * 3}s;${rnd() < 0.3 ? 'color:#ffe9a8' : ''}`;
    frag.appendChild(s);
  }
  [[8, 78, 260], [70, 88, 320], [40, 92, 220]].forEach(([l, t, w]) => {
    const c = document.createElement('span');
    c.className = 'cloud';
    c.style.cssText = `left:${l}%;top:${t}%;width:${w}px;height:${w * 0.32}px`;
    frag.appendChild(c);
  });
  host.appendChild(frag);
})();
