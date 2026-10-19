import { STATUS, type PlatformName, type Product, type ProductStatus } from './types.ts';

export { STATUS };

export function parsePrice(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const digits = String(text).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

export function normalizeTitle(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** 제목만 같은 상품을 자동 연결하지 않기 위한 비교용 키. 연결 자체는 사용자가 확인한다. */
export function titleKey(text: string | null | undefined): string {
  return normalizeTitle(text).toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, '');
}

export function statusFromText(text: string | null | undefined): ProductStatus {
  const value = normalizeTitle(text);
  if (!value) return STATUS.unknown;
  if (/판매\s*완료|거래\s*완료/.test(value)) return STATUS.sold;
  if (/예약/.test(value)) return STATUS.reserved;
  if (/숨김|감추기|비공개/.test(value)) return STATUS.hidden;
  if (/판매\s*중/.test(value)) return STATUS.selling;
  return STATUS.unknown;
}

export function makeProduct(input: {
  platform: PlatformName;
  id: string;
  title: string | null | undefined;
  price?: number | string | null;
  status?: ProductStatus;
  url?: string | null;
  images?: string[];
  description?: string | null;
}): Product {
  return {
    platform: input.platform,
    id: String(input.id),
    title: normalizeTitle(input.title),
    titleKey: titleKey(input.title),
    price: typeof input.price === 'number' ? input.price : parsePrice(input.price),
    status: input.status ?? STATUS.unknown,
    url: input.url ?? null,
    images: input.images ?? [],
    description: input.description ?? null,
  };
}
