import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Locator, Page } from 'playwright';
import { imageDir } from '../config.ts';
import { makeProduct, parsePrice, statusFromText } from '../product.ts';
import { STATUS } from '../types.ts';
import type { Account, CollectOptions, Product, ProductDetail, ShopCheck, StatusResult } from '../types.ts';

// 번개장터 화면 지식은 이 파일에만 둔다. 선택자가 바뀌면 여기만 고친다.
const ORIGIN = 'https://m.bunjang.co.kr';
const manageUrl = (tab: string, size = 100, page = 0): string =>
  `${ORIGIN}/products/manage?tab=${tab}&size=${size}&page=${page}`;
const cell = (row: Locator, name: string): Locator => row.locator(`[class*="_col-${name}"]`).first();
const productRows = (page: Page): Locator =>
  page.locator('div[role="row"]').filter({ has: page.locator('a[href^="/products/"]') });

export const name = 'bunjang' as const;
export const label = '번개장터';


export async function readAccount(page: Page): Promise<Account> {
  await page.goto(manageUrl('ALL', 10), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // 판매자센터 머리말의 상점 아이콘 바로 뒤가 닉네임이다. 이메일 등 개인정보는 읽지 않는다.
  const nickname = await page
    .locator('[class*="placeholder_store"]')
    .first()
    .locator('xpath=following::span[1]')
    .innerText()
    .catch(() => null);
  return { nickname: nickname?.trim() ?? null, productIds: await listProductIds(page) };
}

// 설정한 상점이 로그인한 계정의 상점인지 상품관리 목록과 상점 페이지를 대조한다.
export async function ownsShop(page: Page, shopId: string, productIds: string[]): Promise<ShopCheck | null> {
  if (!shopId || productIds.length === 0) return null;
  await page.goto(`${ORIGIN}/shops/${shopId}/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const shopIds = await listProductIds(page);
  return { matched: productIds.filter((id) => shopIds.includes(id)).length, shopProducts: shopIds.length };
}

// "전체" 탭에는 숨긴 상품이 나오지 않으므로 HIDDEN 탭도 함께 읽는다.
export async function collectList(page: Page, { pageSize, maxPages }: CollectOptions): Promise<Product[]> {
  const all = await collectTab(page, 'ALL', pageSize, maxPages);
  const hidden = await collectTab(page, 'HIDDEN', pageSize, maxPages);
  const seen = new Set(all.map((item) => item.id));
  return [...all, ...hidden.filter((item) => !seen.has(item.id))];
}

async function collectTab(page: Page, tab: string, pageSize: number, maxPages: number): Promise<Product[]> {
  const products: Product[] = [];
  for (let index = 0; index < maxPages; index += 1) {
    await page.goto(manageUrl(tab, pageSize, index), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const rowLocator = productRows(page);
    await rowLocator.first().waitFor({ timeout: 20000 }).catch(() => {});
    const rows = await rowLocator.all();
    if (rows.length === 0) break;

    for (const row of rows) {
      const product = await readRow(row, tab);
      if (product && !products.some((item) => item.id === product.id)) products.push(product);
    }
    if (rows.length < pageSize) break;
  }
  return products;
}

async function readRow(row: Locator, tab: string): Promise<Product | null> {
  const href = await row.locator('a[href^="/products/"]').first().getAttribute('href');
  const id = href?.match(/\/products\/(\d+)/)?.[1];
  if (!id) return null;
  const [title, price, status, image] = await Promise.all([
    cell(row, 'name').innerText(),
    cell(row, 'price').innerText(),
    cell(row, 'saleStatus').innerText(),
    cell(row, 'imageUrl').locator('img').first().getAttribute('src').catch(() => null),
  ]);
  return makeProduct({
    platform: name,
    id,
    title,
    price: parsePrice(price),
    // HIDDEN 탭의 판매상태 칸은 판매중으로 보이므로 탭 기준으로 숨김을 적용한다.
    status: tab === 'HIDDEN' ? STATUS.hidden : statusFromText(status),
    url: `${ORIGIN}/products/${id}`,
    images: image ? [image] : [],
  });
}

// 상세는 카테고리·사진·상태, 수정 화면은 전체 제목·설명·가격을 준다. 수정 화면은 저장하지 않는다.
export async function collectDetail(page: Page, id: string): Promise<ProductDetail> {
  await page.goto(`${ORIGIN}/products/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const detailText = await page.locator('body').innerText();

  const images = await page
    .locator(`img[src*="/product/${id}_"]`)
    .evaluateAll((els) =>
      (els as HTMLImageElement[])
        .map((el) => el.src)
        .filter((src) => !src.includes('%7Bcnt%7D') && !src.includes('{cnt}'))
        .map((src) => src.replace(/_w\d+\.jpg/, '_w1200.jpg')),
    );

  // 카테고리는 상세 페이지의 카테고리 내비게이션에서 읽는다. 수정 화면의 추천 칩과 혼동하지 않는다.
  const categoryNav = page.locator('ul[aria-label="상품 카테고리"] a');
  const names = await categoryNav.allInnerTexts().catch(() => []);
  const codes = (await categoryNav.evaluateAll((els) => els.map((el) => el.getAttribute('href'))).catch(() => []))
    .map((href) => href?.match(/\/categories\/(\d+)/)?.[1])
    .filter((code): code is string => Boolean(code));

  await page.goto(`${ORIGIN}/products/${id}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const [title, description, price] = await Promise.all([
    page.locator('input[name="common.name"]').inputValue().catch(() => null),
    page.locator('textarea[placeholder*="상품 설명"]').first().inputValue().catch(() => null),
    page.locator('input[placeholder="가격을 입력해 주세요"]').first().inputValue().catch(() => null),
  ]);

  return {
    id: String(id),
    title,
    description,
    price: parsePrice(price),
    images: [...new Set(images)],
    category: names.length ? names.map((text) => text.trim()).join(' > ') : null,
    categoryCode: codes.at(-1) ?? null,
    condition: detailText.match(/상품상태\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? null,
    shipping: detailText.match(/배송비\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? null,
    tags: [...detailText.matchAll(/^#(\S+)$/gm)].map((match) => match[1]).filter((tag): tag is string => Boolean(tag)),
  };
}

// 상품관리 표의 "상품숨김" 버튼은 확인창 없이 바로 적용된다. 숨김 해제는 이 도구가 하지 않는다.
export async function hideProduct(page: Page, id: string): Promise<StatusResult> {
  await page.goto(manageUrl('ALL'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const row = page.locator('div[role="row"]').filter({ has: page.locator(`a[href="/products/${id}"]`) }).first();
  await row.waitFor({ timeout: 20000 });
  await row.getByRole('button', { name: '상품숨김' }).click();
  await page.waitForTimeout(3000);

  await page.goto(manageUrl('HIDDEN'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (!(await page.locator(`a[href="/products/${id}"]`).count())) {
    throw new Error('번개장터에서 숨김 처리를 확인하지 못했습니다. 화면을 직접 확인하세요.');
  }
  return { id: String(id), status: STATUS.hidden, appliedAt: new Date().toISOString() };
}

// 사진은 중고나라 업로드에 필요하므로 로컬에만 저장한다.
export async function downloadImages(context: BrowserContext, id: string, urls: string[], limit = 10): Promise<string[]> {
  const dir = imageDir(String(id));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const files: string[] = [];
  for (const [index, url] of urls.slice(0, limit).entries()) {
    const response = await context.request.get(url).catch(() => null);
    if (!response?.ok()) continue;
    const file = path.join(dir, `${String(index + 1).padStart(2, '0')}.jpg`);
    await writeFile(file, await response.body());
    files.push(file);
  }
  return files;
}

function listProductIds(page: Page): Promise<string[]> {
  return page
    .locator('a[href^="/products/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
    .then((hrefs) => [...new Set(hrefs.map((href) => href.match(/\/products\/(\d+)/)?.[1]).filter((id): id is string => Boolean(id)))]);
}
