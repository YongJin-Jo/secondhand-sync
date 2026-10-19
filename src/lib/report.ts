import type { ActionType, Plan, PlanAction } from './types.ts';

const won = (value: number | null | undefined): string =>
  value == null ? '-' : `${value.toLocaleString('ko-KR')}원`;

const TITLES: Record<ActionType, string> = {
  create: '[등록 예정] 중고나라에 새로 올립니다.',
  update: '[수정 예정] 연결된 상품만 수정합니다.',
  markSold: '[판매완료 처리 예정]',
  hide: '[중고나라 숨김 처리 예정]',
  hideSource: '[번개장터 숨김 처리 예정] 중고나라에서 숨긴 상품을 번개장터에서도 숨깁니다.',
  reserve: '[예약중 처리 예정]',
};

const ORDER: ActionType[] = ['create', 'update', 'markSold', 'hide', 'hideSource', 'reserve'];

function describeAction(type: ActionType, action: PlanAction): string {
  if (type === 'create') {
    return `  - ${action.bunjang.title} (${won(action.bunjang.price)}) 번개장터 ${action.bunjang.id}`;
  }
  if (type === 'update') {
    const detail = (action.changes ?? [])
      .map((change) =>
        change.field === 'price'
          ? `가격 ${won(change.from as number)} → ${won(change.to as number)}`
          : `${change.field} 변경`,
      )
      .join(', ');
    return `  - 중고나라 ${action.joongna?.id} "${action.joongna?.title}" (${detail})`;
  }
  if (type === 'hideSource') {
    return `  - 번개장터 ${action.bunjang.id} "${action.bunjang.title}" ← 중고나라 ${action.joongna?.id} 숨김`;
  }
  return `  - 중고나라 ${action.joongna?.id} "${action.joongna?.title}" ← 번개장터 ${action.bunjang.status}`;
}

export function formatPlan(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`계획 시각: ${plan.createdAt}`);
  lines.push(`번개장터 ${plan.counts.source}건 / 중고나라 ${plan.counts.target}건 / 연결 ${plan.counts.links}건`);
  lines.push(
    [
      `등록 ${plan.counts.create}`,
      `수정 ${plan.counts.update}`,
      `판매완료 ${plan.counts.markSold}`,
      `중고나라숨김 ${plan.counts.hide}`,
      `번개장터숨김 ${plan.counts.hideSource ?? 0}`,
      `예약 ${plan.counts.reserve}`,
      `연결후보 ${plan.counts.candidates}`,
      `중고나라만 ${plan.counts.orphans}`,
    ].join(' · '),
  );

  for (const type of ORDER) {
    const group = plan.actions.filter((action) => action.type === type);
    if (group.length === 0) continue;
    lines.push('', TITLES[type]);
    for (const action of group) lines.push(describeAction(type, action));
  }

  if (plan.candidates.length) {
    lines.push('', '[연결 후보] 자동 연결하지 않습니다. npm run link -- --bunjang <ID> --joongna <ID>');
    for (const candidate of plan.candidates) {
      lines.push(`  - 번개장터 ${candidate.bunjang.id} "${candidate.bunjang.title}" (${won(candidate.bunjang.price)})`);
      for (const match of candidate.matches) {
        lines.push(
          `      ↔ 중고나라 ${match.id} "${match.title}" (${won(match.price)}, 유사도 ${match.score}${match.samePrice ? ', 같은 가격' : ''})`,
        );
      }
    }
  }
  if (plan.skipped.length) {
    lines.push('', '[건너뜀]');
    for (const item of plan.skipped) {
      lines.push(`  - ${item.bunjang?.title ?? item.joongna?.title}: ${item.reason}`);
    }
  }
  if (plan.orphans.length) {
    lines.push('', '[중고나라에만 있는 상품] 삭제하지 않습니다.');
    for (const item of plan.orphans) {
      lines.push(`  - ${item.joongna.id} "${item.joongna.title}" (${won(item.joongna.price)}, ${item.joongna.status})`);
    }
  }
  return lines.join('\n');
}
