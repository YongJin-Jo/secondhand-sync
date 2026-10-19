import { loadConfig } from './lib/config.ts';
import { snapshotStore } from './lib/store.ts';
import { withSession, requireLoggedIn } from './lib/session.ts';
import { guardAccounts } from './lib/account.ts';
import { resolvePlatforms } from './lib/platforms/index.ts';
import { loadLinks, findBySource } from './lib/links.ts';
import { normalizeTitle } from './lib/product.ts';
import { STATUS } from './lib/types.ts';
import { parseArgs, flag } from './lib/args.ts';
import type { ProductDetail, Snapshot } from './lib/types.ts';

const options = parseArgs();
const config = await loadConfig();
const platforms = resolvePlatforms(config);
const links = await loadLinks();

await withSession(async ({ context, page }) => {
  await guardAccounts(page, platforms);

  console.log(`${platforms.source.label} 상품관리 목록을 읽습니다.`);
  const sourceProducts = await platforms.source.collectList(page, config.collect);
  console.log(`${platforms.source.label} ${sourceProducts.length}건`);

  // 상세(설명·사진)는 등록이나 수정에 필요한 상품만 읽는다. 판매완료·숨김에 연결이 없으면 건너뛴다.
  const needsDetail = sourceProducts.filter(
    (product) =>
      findBySource(links, product.id) !== null ||
      (product.status !== STATUS.sold && product.status !== STATUS.hidden),
  );
  console.log(`상세 수집 대상 ${needsDetail.length}건`);

  const details: Record<string, ProductDetail> = {};
  for (const product of needsDetail) {
    const detail = await platforms.source.collectDetail(page, product.id);
    detail.imageFiles = flag(options, 'skip-images')
      ? []
      : await platforms.source.downloadImages(context, product.id, detail.images);
    details[product.id] = detail;
    // 중고나라는 저장할 때 연속 공백을 줄이므로, 비교 기준도 같은 방식으로 맞춘다.
    product.title = normalizeTitle(detail.title) || product.title;
    product.description = detail.description;
    product.images = detail.images;
    console.log(`  · ${product.id} ${product.title} (사진 ${detail.imageFiles.length}장)`);
  }

  console.log(`${platforms.target.label} 내 상점 목록을 읽습니다.`);
  const targetProducts = await platforms.target.collectList(page, config.collect);
  requireLoggedIn(page, platforms.target.label);
  console.log(`${platforms.target.label} ${targetProducts.length}건`);

  // 연결된 상품만 수정 화면에서 설명까지 읽는다. 연결되지 않은 상품은 열지 않는다.
  const linkedTargetIds = new Set(links.links.map((link) => link.joongnaId));
  const targetDetails: Record<string, ProductDetail> = {};
  for (const product of targetProducts.filter((item) => linkedTargetIds.has(item.id))) {
    try {
      const detail = await platforms.target.collectDetail(page, product.id);
      targetDetails[product.id] = detail;
      product.description = detail.description;
      if (detail.price != null) product.price = detail.price;
      console.log(`  · ${platforms.target.label} ${product.id} ${detail.title}`);
    } catch (error) {
      console.log(`  · ${platforms.target.label} ${product.id} 상세를 읽지 못했습니다: ${(error as Error).message}`);
    }
  }

  const snapshot: Snapshot = {
    collectedAt: new Date().toISOString(),
    sourceProducts,
    targetProducts,
    details,
    targetDetails,
  };
  console.log(`저장: ${await snapshotStore.write(snapshot)}`);
});
