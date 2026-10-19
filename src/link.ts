import { loadLinks, saveLinks, upsertLink, removeLink } from './lib/links.ts';
import { snapshotStore } from './lib/store.ts';
import { parseArgs, flag, value, fail } from './lib/args.ts';

const options = parseArgs();
const store = await loadLinks();
const bunjangId = value(options, 'bunjang');
const joongnaId = value(options, 'joongna');

if (flag(options, 'list') || (!bunjangId && !joongnaId)) {
  if (store.links.length === 0) console.log('연결된 상품이 없습니다.');
  for (const link of store.links) {
    console.log(`번개장터 ${link.bunjangId} ↔ 중고나라 ${link.joongnaId}  (${link.origin}) ${link.title ?? ''}`);
  }
  process.exit(0);
}

if (flag(options, 'remove')) {
  const removed = removeLink(store, { bunjangId: bunjangId ?? undefined, joongnaId: joongnaId ?? undefined });
  await saveLinks(store);
  console.log(`${removed}건 연결을 해제했습니다.`);
  process.exit(0);
}

if (!bunjangId || !joongnaId) {
  fail(
    '사용법: npm run link -- --bunjang <번개장터ID> --joongna <중고나라ID>',
    '        npm run link -- --list',
    '        npm run link -- --remove --bunjang <ID>',
  );
}

const snapshot = await snapshotStore.read();
const source = snapshot?.sourceProducts.find((item) => item.id === bunjangId);
const target = snapshot?.targetProducts.find((item) => item.id === joongnaId);
if (snapshot && (!source || !target)) {
  fail('수집 결과에 없는 상품 ID입니다. 번호를 확인하거나 다시 수집하세요.');
}

// 사용자가 직접 확인한 연결만 기록한다(origin: confirmed).
const link = upsertLink(store, { bunjangId, joongnaId, title: source?.title ?? null, origin: 'confirmed' });
await saveLinks(store);
console.log(`연결 저장: 번개장터 ${link.bunjangId} ↔ 중고나라 ${link.joongnaId}`);
if (source && target) {
  console.log(`  번개장터: ${source.title} (${source.price}원, ${source.status})`);
  console.log(`  중고나라: ${target.title} (${target.price}원, ${target.status})`);
}
