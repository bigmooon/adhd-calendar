'use strict';

/* ═══════════ 사이드바: GitHub ═══════════ */
const repoStats = {}; // {name:{prs:[],issues:[],error?}} — 세션 캐시
let openRepo = null;   // 사이드바에서 펼쳐진 repo 이름

function ghHeaders() { // 토큰 있으면 인증(5000/시간, 쓰기 가능), 없으면 비인증(60/시간, 읽기만)
  return store.ghToken ? { Authorization: `Bearer ${store.ghToken}` } : {};
}

function ghDueByDate() { // ② milestone 마감일 → 날짜별 GitHub 항목 맵
  const map = {};
  for (const [name, st] of Object.entries(repoStats)) {
    if (!st || st.error) continue;
    for (const it of [...st.prs, ...st.issues]) {
      if (it.due) (map[it.due] = map[it.due] || []).push({ ...it, repo: name });
    }
  }
  return map;
}

function ghItemsHtml(name, st) { // ① 펼친 카드: PR/이슈 목록 + ③ 쓰기 버튼
  const canWrite = !!store.ghToken;
  const row = (it, kind) => `
      <div class="gh-item">
        <a href="${it.url}" target="_blank" rel="noopener">#${it.number} ${esc(it.title)}</a>
        ${it.due ? `<span class="gh-due">📅${it.due}</span>` : ''}
        ${canWrite ? `<button class="gh-act" data-${kind === 'pr' ? 'merge-pr' : 'close-issue'}="${it.number}" data-repo="${esc(name)}">${kind === 'pr' ? '머지' : '닫기'}</button>` : ''}
      </div>`;
  const prRows = st.prs.map((p) => row(p, 'pr')).join('');
  const issueRows = st.issues.map((i) => row(i, 'issue')).join('');
  if (!prRows && !issueRows) return '<div class="gh-items"><p class="empty-note">열린 항목이 없어요 🎉</p></div>';
  return `<div class="gh-items">
      ${prRows ? `<div class="gh-h">🔀 PR</div>${prRows}` : ''}
      ${issueRows ? `<div class="gh-h">🐛 Issue</div>${issueRows}` : ''}
      ${!canWrite ? '<p class="gh-hint">🔑 토큰을 넣으면 닫기·머지 가능</p>' : ''}
    </div>`;
}

function renderRepos() {
  $('#repoList').innerHTML = store.repos.map((r) => {
    const st = repoStats[r.name];
    const open = openRepo === r.name;
    let chips = '<span class="chip">…</span>';
    let body = '';
    if (st && st.error) chips = '<span class="chip">조회 실패</span>';
    else if (st) {
      chips = `<button class="chip chip-btn" data-toggle-repo="${esc(r.name)}">PR ${st.prs.length} · Issue ${st.issues.length} ${open ? '▾' : '▸'}</button>`;
      if (open) body = ghItemsHtml(r.name, st);
    }
    return `
      <div class="repo-card">
        <div class="name">📋 <a href="https://github.com/${store.owner}/${r.name}" target="_blank" rel="noopener">${esc(r.name)}</a>
          <button class="mini-x" data-del-repo="${esc(r.name)}" aria-label="삭제">✕</button>
        </div>${chips}${body}
      </div>`;
  }).join('') || '<p class="empty-note" style="padding:0 8px">repo를 추가해보세요</p>';
}

async function fetchRepoStats() { // ① 열린 이슈·PR 목록(제목/링크/마감) 조회
  await Promise.allSettled(store.repos.map(async (r) => {
    if (repoStats[r.name]) return;
    try {
      const headers = ghHeaders();
      const [issuesRes, prRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${store.owner}/${r.name}/issues?state=open&per_page=50`, { headers }),
        fetch(`https://api.github.com/repos/${store.owner}/${r.name}/pulls?state=open&per_page=50`, { headers }),
      ]);
      if (!issuesRes.ok || !prRes.ok) throw new Error(`GitHub API ${issuesRes.status}/${prRes.status}`);
      const rawIssues = await issuesRes.json();
      const prs = await prRes.json();
      const pick = (x) => ({ number: x.number, title: x.title, url: x.html_url, due: x.milestone && x.milestone.due_on ? x.milestone.due_on.slice(0, 10) : null });
      repoStats[r.name] = {
        prs: prs.map(pick),
        issues: rawIssues.filter((i) => !i.pull_request).map(pick), // /issues 응답엔 PR도 포함 → 제외
      };
    } catch (error) {
      console.error(`GitHub 조회 실패 (${r.name}):`, error);
      repoStats[r.name] = { error: true, prs: [], issues: [] };
    }
  }));
  renderRepos();
  renderMonth();   // ② 달력에 마감 반영
  renderDayPane();
}

async function ghWrite(url, options, okMsg, failMsg, repo) { // ③ 공통 쓰기 → 성공 시 해당 repo 재조회
  try {
    const res = await fetch(url, { ...options, headers: { ...ghHeaders(), 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    toast('✅', okMsg);
    delete repoStats[repo];
    await fetchRepoStats();
  } catch (error) {
    console.error(failMsg, error);
    toast('⚠️', failMsg);
  }
}
function closeIssue(repo, number) {
  if (!confirm(`이슈 #${number} 를 닫을까요?`)) return;
  ghWrite(`https://api.github.com/repos/${store.owner}/${repo}/issues/${number}`,
    { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) },
    `이슈 #${number} 닫음`, '이슈 닫기 실패 (토큰 권한 확인)', repo);
}
function mergePr(repo, number) {
  if (!confirm(`PR #${number} 를 머지할까요?`)) return;
  ghWrite(`https://api.github.com/repos/${store.owner}/${repo}/pulls/${number}/merge`,
    { method: 'PUT' },
    `PR #${number} 머지됨`, 'PR 머지 실패 (권한/충돌 확인)', repo);
}
$('#repoAdd').addEventListener('click', () => {
  const name = $('#repoInput').value.trim();
  if (!name || !/^[\w.-]+$/.test(name)) { toast('⚠️', 'repo 이름을 확인해주세요'); return; }
  if (store.repos.some((r) => r.name === name)) return;
  $('#repoInput').value = '';
  setStore({ repos: [...store.repos, { name }] });
  fetchRepoStats();
});

$('#ghSettingsBtn').addEventListener('click', () => {
  $('#ghTokenInput').value = store.ghToken || '';
  $('#tokenDialog').showModal();
});
$('#tokenForm').addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const token = $('#ghTokenInput').value.trim();
  setStore({ ghToken: token });
  Object.keys(repoStats).forEach((k) => delete repoStats[k]); // 토큰 바뀜 → rate limit/권한 달라짐, 전체 재조회
  fetchRepoStats();
  toast('🔑', token ? 'GitHub 토큰 저장됨' : '토큰 제거됨');
});
