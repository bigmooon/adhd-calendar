'use strict';

/* ═══════════ 대시보드 ═══════════ */
/* 몰입 분석 데이터: track_progress.py가 GitHub 커밋을 분류해 만든 data.json (XP/스트릭/활동) */
let progress = null;
let progressLoaded = false; // fetch 시도 완료 여부 (로딩중 vs 실패 구분용)
const CAT_COLORS = { coding_test: '#8fbef5', cs_study: '#b9a8f2', project: '#a9e6bd', resume: '#f9afc9' }; // 사이드바 태그색과 동일
const catColor = (key) => CAT_COLORS[key] || 'var(--empty)';

function categoryCounts(history, days) { // 최근 days일 카테고리별 활동 건수
  const cutoff = Date.now() - days * 86400000;
  const counts = {};
  for (const ev of history || []) {
    if (new Date(ev.date).getTime() >= cutoff) counts[ev.category] = (counts[ev.category] || 0) + 1;
  }
  return counts;
}

async function loadProgress() { // GitHub 활동 데이터 로드 → 대시보드 반영
  if (window.__PROGRESS__) { // data.js가 있으면 즉시 사용 (file://에서도 동작)
    progress = window.__PROGRESS__;
  } else {
    try { // 배포(http)에서 data.js 없이 data.json만 있을 때 폴백
      const res = await fetch('data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`data.json ${res.status}`);
      progress = await res.json();
    } catch (error) {
      console.error('GitHub 활동 로드 실패:', error);
      progress = null;
    }
  }
  progressLoaded = true;
  renderDash();
}

function renderDash() {
  // XP·스트릭·도넛 = data.json (GitHub 커밋 분석) · 이번 주 몰입 = 로컬 10분 트래커(실제 몰입 분)
  const xp = progress ? progress.xp : 0;
  const lvl = Math.floor(xp / 100) + 1;
  $('#dashXp').innerHTML = `${xp} <small>/ Lv.${lvl}</small>`;
  $('#dashXpBar').style.width = `${xp % 100}%`;
  $('#dashStreak').textContent = progress ? `${progress.streak.current}일` : '—';

  const wkBlocks = Array.from({ length: 7 }, (_, i) => dayBlocks(store.tracker, fmtDate(addDays(weekStart(new Date()), i))))
    .reduce((a, b) => a + b, 0);
  $('#dashWeek').textContent = blocksToTime(wkBlocks);

  const donut = $('#donut');
  const legend = $('#donutLegend');
  if (!progress) {
    donut.style.background = 'var(--empty)';
    legend.innerHTML = progressLoaded
      ? '<span class="empty-note">GitHub 활동을 불러오지 못했어요.<br/>scripts/track_progress.py 실행 후 http로 열어주세요.</span>'
      : '<span class="empty-note">GitHub 활동 불러오는 중…</span>';
    return;
  }
  const cats = progress.config.categories;
  const entries = Object.entries(categoryCounts(progress.history, 30))
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) {
    donut.style.background = 'var(--empty)';
    legend.innerHTML = '<span class="empty-note">최근 30일 GitHub 활동이 없어요.<br/>커밋하면 여기 채워져요!</span>';
    return;
  }
  let acc = 0;
  const segs = entries.map(([key, n]) => {
    const from = (acc / total) * 100;
    acc += n;
    return `${catColor(key)} ${from}% ${(acc / total) * 100}%`;
  });
  donut.style.background = `conic-gradient(${segs.join(', ')})`;
  legend.innerHTML = entries.slice(0, 5).map(([key, n]) =>
    `<span><i style="background:${catColor(key)}"></i>${esc((cats[key] || {}).label || key)}<b>${Math.round((n / total) * 100)}%</b></span>`
  ).join('');
}
