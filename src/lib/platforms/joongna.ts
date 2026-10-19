import type { Locator, Page } from 'playwright';
import { makeProduct, parsePrice } from '../product.ts';
import { STATUS } from '../types.ts';
import type {
  Account,
  CollectOptions,
  CreateResult,
  Product,
  ProductDetail,
  ProductDraft,
  ProductPatch,
  ProductStatus,
  StatusResult,
  WriteOptions,
  WriteResult,
} from '../types.ts';

// 중고나라 화면 지식은 이 파일에만 둔다.
const ORIGIN = 'https://web.joongna.com';
const CARD = 'a[href^="/product/"]:not([href*="form"])';
const option = (page: Page, text: string): Locator => page.locator('[role="option"]', { hasText: text }).first();

export const name = 'joongna' as const;
export const label = '중고나라';
export const mystoreUrl = `${ORIGIN}/mystore`;


export async function readAccount(page: Page): Promise<Account> {
  await page.goto(mystoreUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // 마이페이지 제목이 "중고나라 가게 <가게이름> 페이지" 형태다. 이메일 등 개인정보는 읽지 않는다.
  const headings = await page.locator('h1,h2,h3').allInnerTexts().catch(() => []);
  const nickname = headings.map((text) => text.match(/중고나라 가게\s+(.+?)\s*페이지/)?.[1]?.trim()).find(Boolean);
  return { nickname: nickname ?? null };
}

function statusFromCard(text: string): ProductStatus {
  if (/판매완료/.test(text)) return STATUS.sold;
  if (/숨겨진\s*상품|상품\s*숨김/.test(text)) return STATUS.hidden;
  if (/예약중/.test(text)) return STATUS.reserved;
  return STATUS.selling;
}

// 내 상점은 무한 스크롤이라 더 이상 늘지 않을 때까지 내린다.
export async function collectList(page: Page, { maxScrolls }: CollectOptions): Promise<Product[]> {
  await page.goto(mystoreUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator(CARD).first().waitFor({ timeout: 20000 }).catch(() => {});

  let previous = -1;
  for (let index = 0; index < maxScrolls; index += 1) {
    const count = await page.locator(CARD).count();
    if (count === previous) break;
    previous = count;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1200);
  }

  const products: Product[] = [];
  for (const card of await page.locator(CARD).all()) {
    const href = await card.getAttribute('href');
    const id = href?.match(/\/product\/(\d+)/)?.[1];
    if (!id || products.some((item) => item.id === id)) continue;
    const text = await card.innerText();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const statusLine = lines.findIndex((line) => /판매완료|숨겨진 상품|예약중/.test(line));
    // 가격은 "120,000" 다음 줄이 "원"인 형태다. 제목에 섞인 숫자를 가격으로 읽지 않도록 이 모양만 받는다.
    const priceIndex = lines.findIndex((line, index) => line === '원' && /^[\d,]+$/.test(lines[index - 1] ?? ''));
    products.push(
      makeProduct({
        platform: name,
        id,
        title: lines[statusLine + 1] ?? lines[0] ?? '',
        price: priceIndex > 0 ? parsePrice(lines[priceIndex - 1]) : null,
        status: statusFromCard(text),
        url: `${ORIGIN}/product/${id}`,
        images: [await card.locator('img').first().getAttribute('src').catch(() => null)].filter(
          (src): src is string => Boolean(src),
        ),
      }),
    );
  }
  return products;
}

// 연결된 상품은 수정 화면에서 제목·가격·설명을 읽어 실제 차이를 비교한다. 저장하지 않는다.
export async function collectDetail(page: Page, id: string): Promise<ProductDetail> {
  await openEditForm(page, id);
  const [title, price, description] = await Promise.all([
    page.locator('#product-name').inputValue(),
    page.locator('#productPrice').inputValue(),
    page.locator('#product-description').inputValue(),
  ]);
  return { id: String(id), title: title.trim(), price: parsePrice(price), description, images: [] };
}

async function openEditForm(page: Page, id: string): Promise<void> {
  await page.goto(`${ORIGIN}/product/form?type=modify&productSeq=${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator('#product-name').waitFor({ timeout: 20000 });
}

// 내 상점 카드의 "관리 옵션 열기" 시트를 연다. 카드 식별은 상품 링크 기준.
async function openCardMenu(page: Page, id: string): Promise<void> {
  await page.goto(mystoreUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  for (let index = 0; index < 40; index += 1) {
    if (await page.locator(`${CARD}[href$="/${id}"]`).count()) break;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1000);
  }
  const card = page.locator(`${CARD}[href$="/${id}"]`).first();
  await card.waitFor({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  await card.locator('xpath=..').locator('button[aria-label*="관리 옵션"]').first().click();
  await page.waitForTimeout(1200);
}

const STATUS_LABEL: Partial<Record<ProductStatus, string>> = {
  [STATUS.sold]: '판매완료',
  [STATUS.hidden]: '상품 숨김',
  [STATUS.reserved]: '예약중',
};

export async function setStatus(page: Page, id: string, status: ProductStatus): Promise<StatusResult> {
  const statusLabel = STATUS_LABEL[status];
  if (!statusLabel) throw new Error(`지원하지 않는 상태입니다: ${status}`);
  await openCardMenu(page, id);
  await option(page, '상태변경').click();
  await page.waitForTimeout(1200);
  await option(page, statusLabel).click();
  await page.waitForTimeout(2500);
  // 확인 모달이 나오면 확인을 누른다. 없으면 그대로 진행한다.
  const confirm = page.getByRole('button', { name: /확인|변경|완료/ }).first();
  if (await confirm.count()) await confirm.click().catch(() => {});
  await page.waitForTimeout(2000);
  return { id: String(id), status, appliedAt: new Date().toISOString() };
}

// 판매가격 칸은 읽기 전용이고, 눌러서 열리는 "판매가 설정" 패널에서 입력한다.
async function setPrice(page: Page, price: number | string): Promise<string> {
  await page.locator('#productPrice').locator('xpath=ancestor::div[contains(@class,"cursor-pointer")][1]').first().click();
  const input = page.locator('input[placeholder="가격을 입력해 주세요."]');
  await input.waitFor({ timeout: 15000 });
  await input.fill(String(price));
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '입력 완료' }).click();
  await page.waitForTimeout(1200);
  const applied = await page.locator('#productPrice').inputValue();
  if (!applied) throw new Error('판매가격이 입력되지 않았습니다.');
  return applied;
}

async function selectCategory(page: Page, categoryPath: string): Promise<void> {
  const parts = categoryPath.split('>').map((part) => part.trim()).filter(Boolean);
  const suggestion = page.getByRole('button', { name: parts.join(' > ') }).first();
  if (await suggestion.count()) {
    await suggestion.click();
    await page.waitForTimeout(800);
    return;
  }
  for (const part of parts) {
    const button = page.getByRole('button', { name: part, exact: true }).first();
    await button.waitFor({ timeout: 10000 });
    await button.click();
    await page.waitForTimeout(900);
  }
}

async function fillForm(page: Page, draft: ProductDraft): Promise<void> {
  const { title, price, description, condition, components, images, categoryPath, freeShipping } = draft;
  if (images?.length) {
    await page.locator('input[type="file"]').first().setInputFiles(images);
    await page.waitForTimeout(2500 + images.length * 700);
  }
  if (title != null) await page.locator('#product-name').fill(title);
  if (categoryPath) await selectCategory(page, categoryPath);
  if (price != null) await setPrice(page, price);
  if (description != null) await page.locator('#product-description').fill(description);
  if (condition) await page.locator(`#${condition === 'new' ? 'new' : 'used'}`).check({ force: true }).catch(() => {});
  if (components) await page.locator(`#${components}`).check({ force: true }).catch(() => {});

  const parcel = page.getByText('택배거래', { exact: true }).first();
  if (await parcel.count()) await parcel.click().catch(() => {});
  await page.waitForTimeout(600);
  const shipping = page.getByText(freeShipping ? '배송비 포함' : '배송비 별도', { exact: true }).first();
  if (await shipping.count()) await shipping.click().catch(() => {});
  await page.waitForTimeout(600);
  const agree = page.getByText('판매 정보가 실제 상품과 다를 경우', { exact: false }).first();
  if (await agree.count()) await agree.click().catch(() => {});
}

// 등록과 수정 모두 같은 폼을 쓴다. 저장 버튼 라벨만 다르다.
export async function createProduct(page: Page, product: ProductDraft, { dryRun = false }: WriteOptions = {}): Promise<CreateResult> {
  await page.goto(`${ORIGIN}/product/form?type=regist`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await fillForm(page, product);
  if (dryRun) return { id: null, url: page.url(), dryRun: true, filled: await describeForm(page) };
  await page.getByRole('button', { name: '판매하기', exact: true }).last().click();
  await page.waitForURL(/\/product\/\d+|\/mystore/, { timeout: 60000 });
  return { id: page.url().match(/\/product\/(\d+)/)?.[1] ?? null, url: page.url() };
}

export async function updateProduct(page: Page, id: string, patch: ProductPatch, { dryRun = false }: WriteOptions = {}): Promise<WriteResult> {
  await openEditForm(page, id);
  if (patch.title != null) await page.locator('#product-name').fill(patch.title);
  if (patch.price != null) await setPrice(page, patch.price);
  if (patch.description != null) await page.locator('#product-description').fill(patch.description);
  if (dryRun) return { id: String(id), url: page.url(), dryRun: true, filled: await describeForm(page) };
  await page.getByRole('button', { name: '수정하기', exact: true }).last().click();
  await page.waitForTimeout(4000);
  return { id: String(id), url: page.url() };
}

// 저장하지 않고 입력값이 맞는지 확인할 때 쓴다. 제출 버튼이 열려야 필수값이 다 찬 것이다.
async function describeForm(page: Page): Promise<Record<string, unknown>> {
  return {
    title: await page.locator('#product-name').inputValue(),
    price: await page.locator('#productPrice').inputValue(),
    description: (await page.locator('#product-description').inputValue()).slice(0, 40),
    imageCounter: (await page.locator('body').innerText()).match(/상품 이미지\s*\n\s*(\d+\/10)/)?.[1] ?? null,
    submitEnabled: await page.getByRole('button', { name: /판매하기|수정하기/ }).last().isEnabled(),
  };
}
