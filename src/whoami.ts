import { loadConfig } from './lib/config.ts';
import { withSession } from './lib/session.ts';
import { readAccounts, loadExpectedAccount, saveExpectedAccount } from './lib/account.ts';
import { resolvePlatforms } from './lib/platforms/index.ts';
import { parseArgs, flag } from './lib/args.ts';

const options = parseArgs();
const config = await loadConfig();
const platforms = resolvePlatforms(config);

await withSession(async ({ page }) => {
  const expected = await loadExpectedAccount();
  const accounts = await readAccounts(page, platforms);

  console.log(`${platforms.source.label} 닉네임: ${accounts.source.nickname ?? '읽지 못함'} (저장됨: ${expected?.bunjang ?? '없음'})`);
  const owns = await platforms.source.ownsShop(page, config.source.shopId, accounts.source.productIds ?? []);
  if (owns) {
    console.log(`상점 ${config.source.shopId} 상품 ${owns.shopProducts}건 중 ${owns.matched}건이 상품관리 목록과 일치합니다.`);
  }
  console.log(`${platforms.target.label} 가게: ${accounts.target.nickname ?? '읽지 못함'} (저장됨: ${expected?.joongna ?? '없음'})`);

  if (flag(options, 'save')) {
    const file = await saveExpectedAccount({
      bunjang: accounts.source.nickname,
      joongna: accounts.target.nickname,
      shopId: config.source.shopId,
    });
    console.log(`\n저장: ${file}`);
    console.log('이후 collect·apply는 이 계정으로 로그인했을 때만 실행됩니다.');
  } else {
    console.log('\n이 계정으로 고정하려면: npm run whoami -- --save');
  }
});
