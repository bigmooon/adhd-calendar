const { test, expect } = require('@playwright/test');

// 장기 계획(여행·프로젝트 공용 + 템플릿) E2E. 각 테스트는 새 컨텍스트 → localStorage 격리.
test.beforeEach(async ({ page }) => {
  // 로그인 게이트 우회: 자격증명이 있으면 게이트가 안 뜨고 pull은 백엔드 없어 조용히 실패.
  // 계획 기능은 로컬 localStorage라 KV 동기화와 무관.
  await page.addInitScript(() => localStorage.setItem('molip.auth', 'dGVzdDp0ZXN0'));
  await page.goto('/index.html');
});

test('여행 템플릿으로 계획을 만들면 카드·D-day·다음 단계가 뜬다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await expect(page.locator('#planDialog')).toBeVisible();
  // 기본 선택은 여행 → 미리보기에 프리셋 단계
  await expect(page.locator('#plPreview')).toContainText('항공권 예약');

  await page.locator('#plTitle').fill('제주도 여행');
  await page.locator('#plDue').fill('2099-12-31'); // 먼 미래 → 머신 시계와 무관하게 항상 D-
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '제주도 여행' });
  await expect(card).toBeVisible();
  await expect(card.locator('.plan-dday')).toContainText('D-');
  await expect(card.locator('.plan-prog')).toContainText('0/6');

  // 매일 보는 선택일 패널에 "다음 단계" 한 줄
  const dayplan = page.locator('#dayPlans .dayplan').filter({ hasText: '제주도 여행' });
  await expect(dayplan).toContainText('다음: 항공권 예약');
});

test('단계를 체크하면 진행률이 오르고 취소선이 생긴다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await page.locator('#plTitle').fill('유럽 여행');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '유럽 여행' });
  await expect(card.locator('.plan-prog')).toContainText('0/6');

  await card.locator('.pstep').first().locator('.ck').click();
  await expect(card.locator('.plan-prog')).toContainText('1/6');
  await expect(card.locator('.pstep').first()).toHaveClass(/done/);
});

test('빈 계획을 만들고 단계를 직접 추가할 수 있다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await page.locator('#plTemplate button[data-tpl="blank"]').click();
  await expect(page.locator('#plPreview')).toContainText('빈 계획');

  await page.locator('#plTitle').fill('사이드 프로젝트');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '사이드 프로젝트' });
  await expect(card.locator('.plan-prog')).toContainText('0/0');

  const addForm = card.locator('.plan-addstep');
  await addForm.locator('input[type=text]').fill('기획 정리');
  await addForm.locator('button[type=submit]').click();

  await expect(card.locator('.plan-prog')).toContainText('0/1');
  await expect(card).toContainText('기획 정리');
});

test('날짜 있는 단계는 먼슬리에 🎯 마커로 표시된다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await page.locator('#plTemplate button[data-tpl="blank"]').click();
  await page.locator('#plTitle').fill('마커 테스트');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '마커 테스트' });
  await expect(page.locator('#calGrid .plan-mark')).toHaveCount(0); // 아직 없음
  const today = await page.evaluate(() => fmtDate(new Date())); // 앱이 보는 오늘 키
  const addForm = card.locator('.plan-addstep');
  await addForm.locator('input[type=text]').fill('오늘 할 일');
  await addForm.locator('input[type=date]').fill(today);
  await addForm.locator('button[type=submit]').click();

  await expect(page.locator('#calGrid .plan-mark')).toHaveCount(1);
});

test('지난 목표일은 D+로 표시된다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await page.locator('#plTitle').fill('지난 계획');
  await page.locator('#plDue').fill('2000-01-01');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '지난 계획' });
  await expect(card.locator('.plan-dday')).toContainText('D+');
});

test('선택일에 걸린 단계는 "오늘:"으로 강조된다', async ({ page }) => {
  await page.locator('#planAddBtn').click();
  await page.locator('#plTemplate button[data-tpl="blank"]').click();
  await page.locator('#plTitle').fill('오늘 강조');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '오늘 강조' });
  const sel = await page.evaluate(() => selectedKey); // 현재 선택일 키
  const addForm = card.locator('.plan-addstep');
  await addForm.locator('input[type=text]').fill('선택일 할 일');
  await addForm.locator('input[type=date]').fill(sel);
  await addForm.locator('button[type=submit]').click();

  const dayplan = page.locator('#dayPlans .dayplan').filter({ hasText: '오늘 강조' });
  await expect(dayplan).toContainText('오늘: 선택일 할 일');
});

test('단계와 계획을 삭제할 수 있다', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // 계획 삭제 confirm 자동 수락
  await page.locator('#planAddBtn').click();
  await page.locator('#plTitle').fill('삭제할 여행');
  await page.locator('#planForm button[value="ok"]').click();

  const card = page.locator('.plan-card').filter({ hasText: '삭제할 여행' });
  await expect(card.locator('.pstep')).toHaveCount(6);
  await card.locator('.pstep').first().locator('.mini-x').click(); // 단계 삭제(확인 없음)
  await expect(card.locator('.pstep')).toHaveCount(5);

  await card.locator('.plan-top .mini-x').click(); // 계획 삭제(확인 수락)
  await expect(page.locator('.plan-card').filter({ hasText: '삭제할 여행' })).toHaveCount(0);
});
