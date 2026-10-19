import { STATUS } from './types.ts';
import { findBySource } from './links.ts';
import { findCandidates } from './match.ts';
import type { ActionType, FieldChange, LinkStore, Plan, PlanAction, Product, SyncConfig } from './types.ts';

/** 연결된 상품에서 어떤 필드가 다른지 계산한다. 수집하지 못한 값은 비교하지 않는다. */
export function fieldDiff(source: Product, target: Product, sync: Partial<SyncConfig> = {}): FieldChange[] {
  const enabled = (field: keyof SyncConfig) => sync[field] !== false;
  const changes: FieldChange[] = [];
  if (enabled('title') && source.title && target.title && source.title !== target.title) {
    changes.push({ field: 'title', from: target.title, to: source.title });
  }
  if (enabled('price') && source.price != null && target.price != null && source.price !== target.price) {
    changes.push({ field: 'price', from: target.price, to: source.price });
  }
  if (
    enabled('description') &&
    source.description &&
    target.description &&
    source.description.trim() !== target.description.trim()
  ) {
    changes.push({ field: 'description', from: target.description, to: source.description });
  }
  return changes;
}

const INACTIVE: ReadonlySet<string> = new Set([STATUS.sold, STATUS.hidden]);
const STATUS_ACTION: Partial<Record<Product['status'], ActionType>> = {
  [STATUS.sold]: 'markSold',
  [STATUS.hidden]: 'hide',
  [STATUS.reserved]: 'reserve',
};

export function buildPlan(input: {
  sourceProducts: Product[];
  targetProducts: Product[];
  links: LinkStore;
  sync?: Partial<SyncConfig>;
}): Plan {
  const { sourceProducts, targetProducts, links, sync = {} } = input;
  const targetById = new Map(targetProducts.map((item) => [item.id, item]));
  const linkedTargetIds = new Set(links.links.map((link) => link.joongnaId));

  const actions: PlanAction[] = [];
  const candidates: Plan['candidates'] = [];
  const skipped: Plan['skipped'] = [];

  for (const source of sourceProducts) {
    const link = findBySource(links, source.id);

    if (!link) {
      // 번개장터에서 판매완료·숨김이고 중고나라에 연결된 상품이 없으면 가져오지 않는다.
      if (INACTIVE.has(source.status)) {
        skipped.push({
          bunjang: source,
          reason:
            source.status === STATUS.sold
              ? '판매 완료 상품이고 연결된 중고나라 상품이 없습니다. 등록하지 않습니다.'
              : '번개장터에서 숨김 상태이고 연결된 중고나라 상품이 없습니다. 등록하지 않습니다.',
        });
        continue;
      }
      const matches = findCandidates(source, targetProducts.filter((target) => !linkedTargetIds.has(target.id)));
      if (matches.length > 0) {
        candidates.push({
          bunjang: source,
          matches,
          reason: '같은 상품으로 보이지만 자동 연결하지 않습니다. npm run link 로 확인하세요.',
        });
        continue;
      }
      actions.push({ type: 'create', bunjang: source });
      continue;
    }

    const target = targetById.get(link.joongnaId);
    if (!target) {
      skipped.push({
        bunjang: source,
        link,
        reason: '연결된 중고나라 상품을 목록에서 찾지 못했습니다. 재등록 전에 직접 확인하세요.',
      });
      continue;
    }

    // 한쪽이 숨김이면 반대쪽도 숨긴다. 숨김 해제는 자동으로 하지 않는다.
    if (
      sync.hideSource !== false &&
      target.status === STATUS.hidden &&
      source.status !== STATUS.hidden &&
      source.status !== STATUS.sold
    ) {
      actions.push({ type: 'hideSource', bunjang: source, joongna: target, link });
      continue;
    }

    // 연결된 상품은 상태를 맞춘다. 중고나라가 이미 같은 상태면 아무것도 하지 않는다.
    const statusAction = STATUS_ACTION[source.status];
    if (source.status !== target.status && statusAction) {
      if (target.status === STATUS.sold) {
        skipped.push({
          bunjang: source,
          joongna: target,
          reason: '중고나라에서 이미 판매 완료입니다. 상태를 되돌리지 않습니다.',
        });
        continue;
      }
      actions.push({ type: statusAction, bunjang: source, joongna: target, link });
      continue;
    }

    if (INACTIVE.has(source.status)) {
      skipped.push({ bunjang: source, joongna: target, reason: `양쪽 모두 ${source.status} 상태입니다.` });
      continue;
    }

    const changes = fieldDiff(source, target, sync);
    if (changes.length > 0) actions.push({ type: 'update', bunjang: source, joongna: target, link, changes });
  }

  const candidateTargetIds = new Set(candidates.flatMap((item) => item.matches.map((match) => match.id)));
  const orphans = targetProducts
    .filter((target) => !linkedTargetIds.has(target.id) && !candidateTargetIds.has(target.id))
    .map((target) => ({
      joongna: target,
      reason: '번개장터에 대응 상품이 없거나 연결되지 않았습니다. 삭제는 하지 않습니다.',
    }));

  const count = (type: ActionType) => actions.filter((action) => action.type === type).length;
  return {
    createdAt: new Date().toISOString(),
    counts: {
      source: sourceProducts.length,
      target: targetProducts.length,
      links: links.links.length,
      create: count('create'),
      update: count('update'),
      markSold: count('markSold'),
      hide: count('hide'),
      hideSource: count('hideSource'),
      reserve: count('reserve'),
      candidates: candidates.length,
      orphans: orphans.length,
    },
    actions,
    candidates,
    skipped,
    orphans,
  };
}
