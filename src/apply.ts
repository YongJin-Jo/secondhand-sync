import { loadConfig } from './lib/config.ts';
import { applyLogStore, planStore, snapshotStore } from './lib/store.ts';
import { withSession, requireLoggedIn, needsLogin } from './lib/session.ts';
import { guardAccounts } from './lib/account.ts';
import { resolvePlatforms } from './lib/platforms/index.ts';
import { loadLinks } from './lib/links.ts';
import { HANDLERS, type ApplyContext } from './lib/actions.ts';
import { parseArgs, flag, value, fail } from './lib/args.ts';
import type { ApplyResult, PlanAction } from './lib/types.ts';

const MAX_PLAN_AGE_MINUTES = 60;

const options = parseArgs();
const dryRun = flag(options, 'dry-run');
const plan = await planStore.read();
const snapshot = await snapshotStore.read();

if (!plan || !snapshot) fail('계획이 없습니다. "npm run collect" 후 "npm run plan"을 먼저 실행하세요.');
if (!flag(options, 'confirm') && !dryRun) {
  fail(
    '반영은 확인이 필요합니다: npm run apply -- --confirm',
    '일부만 반영: --only create|update|markSold|hide|hideSource|reserve, --id <번개장터ID>, --limit <개수>',
    '저장하지 않고 입력값만 확인: --dry-run',
  );
}

const ageMinutes = (Date.now() - new Date(plan.createdAt).getTime()) / 60000;
if (ageMinutes > MAX_PLAN_AGE_MINUTES) {
  fail(`계획이 ${Math.round(ageMinutes)}분 전 것입니다. 다시 수집·계획한 뒤 반영하세요.`);
}

const only = value(options, 'only');
const id = value(options, 'id');
const limit = value(options, 'limit');
let actions: PlanAction[] = plan.actions;
if (only) actions = actions.filter((action) => action.type === only);
if (id) actions = actions.filter((action) => action.bunjang.id === id);
if (limit) actions = actions.slice(0, Number(limit));

if (actions.length === 0) {
  console.log('반영할 작업이 없습니다.');
  process.exit(0);
}

const config = await loadConfig();
const platforms = resolvePlatforms(config);
const results: ApplyResult[] = [];

const summarize = (action: PlanAction): Pick<ApplyResult, 'type' | 'bunjangId' | 'title' | 'joongnaId'> => ({
  type: action.type,
  bunjangId: action.bunjang.id,
  title: action.bunjang.title,
  joongnaId: action.joongna?.id ?? null,
});

try {
  await withSession(async ({ page }) => {
    await page.goto(config.target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    requireLoggedIn(page, platforms.target.label);
    await guardAccounts(page, platforms);

    const ctx: ApplyContext = {
      page,
      config,
      links: await loadLinks(),
      details: snapshot.details,
      source: platforms.source,
      target: platforms.target,
      dryRun,
    };

    for (const action of actions) {
      // 추가 인증이 뜨면 직접 인증할 수 있도록 멈춘다.
      if (needsLogin(page.url())) {
        console.error('추가 인증 화면이 나타났습니다. 브라우저에서 직접 인증한 뒤 다시 실행하세요.');
        break;
      }

      const label = `${action.type} 번개장터 ${action.bunjang.id} "${action.bunjang.title}"`;
      try {
        console.log(`진행: ${label}`);
        const outcome = await HANDLERS[action.type](action, ctx);
        const { message, ...record } = outcome;
        console.log(`  ${message ?? record.reason ?? record.status}`);
        results.push({ ...summarize(action), ...record, joongnaId: record.joongnaId ?? action.joongna?.id ?? null });
      } catch (error) {
        console.error(`실패 (${label}): ${(error as Error).message}`);
        console.error('  반영 여부가 불명확하면 화면을 직접 확인하세요. 자동으로 재시도하지 않습니다.');
        results.push({ ...summarize(action), status: 'failed', error: (error as Error).message });
        break;
      }
    }
  });
} finally {
  const file = await applyLogStore.write({ appliedAt: new Date().toISOString(), results });
  const done = results.filter((item) => item.status === 'done').length;
  console.log(`\n기록: ${file}`);
  console.log(`완료 ${done} / 시도 ${results.length}`);
  console.log('반영 결과를 확인하려면 "npm run collect" 후 "npm run plan"을 다시 실행하세요.');
}
