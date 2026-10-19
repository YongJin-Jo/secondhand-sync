import { loadConfig } from './lib/config.ts';
import { planStore, snapshotStore } from './lib/store.ts';
import { loadLinks } from './lib/links.ts';
import { buildPlan } from './lib/diff.ts';
import { formatPlan } from './lib/report.ts';
import { fail } from './lib/args.ts';

const snapshot = await snapshotStore.read();
if (!snapshot) fail('수집 결과가 없습니다. 먼저 "npm run collect"를 실행하세요.');

const config = await loadConfig();
const links = await loadLinks();
const plan = buildPlan({
  sourceProducts: snapshot.sourceProducts,
  targetProducts: snapshot.targetProducts,
  links,
  sync: config.sync,
});
plan.snapshotAt = snapshot.collectedAt;

const file = await planStore.write(plan);
console.log(formatPlan(plan));
console.log(`\n저장: ${file}`);
console.log('반영하려면 내용을 확인한 뒤 "npm run apply -- --confirm"을 실행하세요.');
