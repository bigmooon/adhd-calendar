'use strict';

/* ═══════════ 장기 계획 (여행·프로젝트 공용 + 템플릿) ═══════════ */
// ponytail: 구조는 하나(목표+체크리스트), 템플릿은 steps 프리셋일 뿐. 종류 늘면 배열 한 줄 추가.
const PLAN_TEMPLATES = {
  travel:  { icon: '✈️', label: '여행',    tag: 'etc',     steps: ['항공권 예약', '숙소 예약', '교통/렌터카', '짐 리스트', '환전', '일정표 짜기'] },
  project: { icon: '📁', label: '프로젝트', tag: 'project', steps: ['범위/목표 정의', '마일스톤 나누기', '작업 쪼개기', '중간 점검', '마무리·배포'] },
  blank:   { icon: '📝', label: '빈 계획',  tag: 'etc',     steps: [] },
};

/* ── 순수 헬퍼 ── */
// D-day 텍스트: 오늘 자정 기준 남은 일수 (D-DAY / D-7 / D+3)
function ddayText(due) {
  if (!due) return '';
  const diff = Math.round((parseDate(due) - parseDate(fmtDate(new Date()))) / 86400000);
  if (diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}
// 다음 할 단계: 안 끝난 것 중 날짜 빠른 순, 날짜 없으면 원래 순서
function nextStep(plan) {
  const undone = plan.steps.filter((s) => !s.done); // filter는 새 배열 → 아래 sort는 원본 불변
  if (!undone.length) return null;
  return undone.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0];
}
// 먼슬리에 🎯 찍을 날짜들: 계획 마감일 + 날짜 있는 단계
function planMarksByDate() {
  const marks = {};
  for (const p of store.plans) {
    if (p.due) marks[p.due] = true;
    for (const s of p.steps) if (s.date) marks[s.date] = true;
  }
  return marks;
}

/* ── 불변 갱신 헬퍼 ── */
function updatePlan(planId, fn) {
  setStore({ plans: store.plans.map((p) => (p.id === planId ? fn(p) : p)) });
}
function togglePlanStep(key) {
  const [pid, sid] = key.split(':');
  updatePlan(pid, (p) => ({ ...p, steps: p.steps.map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) }));
}
function deletePlanStep(key) {
  const [pid, sid] = key.split(':');
  updatePlan(pid, (p) => ({ ...p, steps: p.steps.filter((s) => s.id !== sid) }));
}
function deletePlan(pid) {
  if (confirm('이 계획을 삭제할까요?')) setStore({ plans: store.plans.filter((p) => p.id !== pid) });
}

/* ── 카드 뷰 (전체 지도) ── */
function renderPlans() {
  const host = $('#planList');
  if (!host) return;
  if (!store.plans.length) {
    host.innerHTML = '<p class="empty-note" style="padding:8px 16px 16px">아직 계획이 없어요. ＋로 여행·프로젝트 계획을 만들어보세요!</p>';
    return;
  }
  host.innerHTML = store.plans.map((p) => {
    const total = p.steps.length;
    const done = p.steps.filter((s) => s.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const color = tagColor(p.tag);
    const dday = ddayText(p.due);
    const steps = p.steps.map((s) => `
      <div class="pstep${s.done ? ' done' : ''}">
        <button class="ck${s.done ? ' on' : ''}" data-plan-step="${p.id}:${s.id}" aria-label="완료 체크">✓</button>
        <span class="pstep-t">${esc(s.text)}${s.date ? ` <time>${esc(s.date.slice(5))}</time>` : ''}</span>
        <button class="mini-x" data-del-step="${p.id}:${s.id}" aria-label="단계 삭제">✕</button>
      </div>`).join('');
    return `
      <div class="plan-card" style="border-left-color:${color}">
        <div class="plan-top">
          <span class="plan-title">🎯 ${esc(p.title)}</span>
          ${dday ? `<span class="plan-dday">${dday}</span>` : ''}
          <button class="mini-x" data-del-plan="${p.id}" aria-label="계획 삭제">✕</button>
        </div>
        <div class="plan-bar"><i style="width:${pct}%;background:${color}"></i></div>
        <div class="plan-prog">${done}/${total} 단계</div>
        <div class="plan-steps">${steps}</div>
        <form class="plan-addstep" data-plan-add="${p.id}">
          <input type="text" placeholder="＋ 단계 추가" maxlength="60" aria-label="단계 이름" />
          <input type="date" aria-label="단계 날짜 (선택)" />
          <button class="btn-sm" type="submit">＋</button>
        </form>
      </div>`;
  }).join('');
}

/* ── 선택일 패널: "오늘의 다음 단계" (매일 보는 화면에 밀어넣기) ── */
function renderDayPlans() {
  const host = $('#dayPlans');
  if (!host) return;
  const rows = [];
  for (const p of store.plans) {
    const ns = nextStep(p);
    if (!ns) continue;
    // 선택일에 날짜가 걸린 미완료 단계가 있으면 그걸 우선 노출, 아니면 그냥 다음 단계
    const dated = p.steps.find((s) => !s.done && s.date === selectedKey);
    const step = dated || ns;
    rows.push(`
      <div class="dayplan">
        <button class="ck" data-plan-step="${p.id}:${step.id}" aria-label="완료 체크">✓</button>
        <div class="dp-body">
          <span class="dp-title" style="color:${tagColor(p.tag)}">🎯 ${esc(p.title)}${p.due ? ` <time>${ddayText(p.due)}</time>` : ''}</span>
          <span class="dp-next">${dated ? '오늘: ' : '다음: '}${esc(step.text)}</span>
        </div>
      </div>`);
  }
  host.innerHTML = rows.length ? rows.join('') : '<p class="empty-note">진행 중인 계획이 없어요.</p>';
}

/* ── 이벤트 위임 (계획 액션) ── */
// app.js의 document click 위임과 별개 리스너 — 서로 모르는 dataset은 무시돼 충돌 없음
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.planStep) togglePlanStep(btn.dataset.planStep);
  else if (btn.dataset.delStep) deletePlanStep(btn.dataset.delStep);
  else if (btn.dataset.delPlan) deletePlan(btn.dataset.delPlan);
});
// 카드 안 "단계 추가" 폼
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-plan-add]');
  if (!form) return;
  e.preventDefault();
  const text = form.querySelector('input[type=text]').value.trim();
  if (!text) return;
  const date = form.querySelector('input[type=date]').value;
  updatePlan(form.dataset.planAdd, (p) => ({ ...p, steps: [...p.steps, { id: uid(), text, date, done: false }] }));
});

/* ── 새 계획 모달 ── */
let planTpl = 'travel';
function setPlanTpl(key) {
  planTpl = key;
  $('#plTemplate').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.tpl === key));
  const steps = PLAN_TEMPLATES[key].steps;
  $('#plPreview').textContent = steps.length ? `단계: ${steps.join(' · ')}` : '빈 계획으로 시작해요.';
}
$('#planAddBtn').addEventListener('click', () => {
  setPlanTpl('travel');
  $('#plTitle').value = '';
  $('#plDue').value = '';
  $('#planDialog').showModal();
});
$('#plTemplate').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (btn) setPlanTpl(btn.dataset.tpl);
});
$('#plCancel').addEventListener('click', () => $('#planDialog').close());
$('#planForm').addEventListener('submit', (e) => {
  const title = $('#plTitle').value.trim();
  if (!title) { e.preventDefault(); toast('⚠️', '제목을 입력해주세요'); return; }
  const tpl = PLAN_TEMPLATES[planTpl];
  const steps = tpl.steps.map((text) => ({ id: uid(), text, date: '', done: false }));
  setStore({ plans: [...store.plans, { id: uid(), title, tag: tpl.tag, due: $('#plDue').value, steps }] });
  $('#planForm').reset();
  toast(tpl.icon, `'${title}' 계획을 만들었어요!`);
});
