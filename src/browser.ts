import { loadConfig } from './lib/config.ts';
import { withSession } from './lib/session.ts';

const config = await loadConfig();

await withSession(async ({ context, page }) => {
  await page.goto(config.source.url, { waitUntil: 'domcontentloaded' });
  const targetPage = await context.newPage();
  await targetPage.goto(config.target.url, { waitUntil: 'domcontentloaded' });

  console.log('열린 브라우저에서 번개장터·중고나라에 직접 로그인하세요.');
  console.log('중고나라는 "로그인 유지하기"를 켜면 세션이 오래 갑니다.');
  console.log('이 명령은 상품 등록·수정·판매 완료 처리를 수행하지 않습니다.');
  console.log('종료하려면 브라우저 창을 닫으세요. 로그인은 이 프로젝트의 로컬 프로필에 저장됩니다.');

  await new Promise<void>((resolve) => {
    context.once('close', () => resolve());
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
});
