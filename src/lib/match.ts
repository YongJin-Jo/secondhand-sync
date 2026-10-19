import type { MatchCandidate, Product } from './types.ts';

// 제목이 플랫폼마다 달라서(같은 상품도 수식어가 다르다) 단순 일치로는 찾지 못한다.
// 유사도는 "연결 후보"를 뽑는 용도로만 쓰고, 연결 자체는 사용자가 확인한다.

const STOPWORDS = new Set(['팝니다', '판매', '판매합니다', '새상품', '정품', '무료배송', '급처', '사이즈']);

export function tokenize(title: string | null | undefined): string[] {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function similarity(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export interface MatchScore {
  score: number;
  titleScore: number;
  samePrice: boolean;
}

export function scoreMatch(source: Product, target: Product): MatchScore {
  const titleScore = similarity(source.title, target.title);
  const samePrice = source.price != null && source.price === target.price;
  return {
    score: Number((titleScore + (samePrice ? 0.25 : 0)).toFixed(3)),
    titleScore: Number(titleScore.toFixed(3)),
    samePrice,
  };
}

/** 후보 임계값: 제목이 꽤 겹치거나, 가격이 같고 제목도 일부 겹치는 경우. */
export function isCandidate({ score, titleScore, samePrice }: MatchScore): boolean {
  if (titleScore >= 0.5) return true;
  if (samePrice && titleScore >= 0.25) return true;
  return score >= 0.6;
}

export function findCandidates(source: Product, targets: Product[]): MatchCandidate[] {
  return targets
    .map((target) => ({ target, ...scoreMatch(source, target) }))
    .filter((entry) => isCandidate(entry))
    .sort((a, b) => b.score - a.score)
    .map(({ target, score, samePrice }) => ({ ...target, score, samePrice }));
}
