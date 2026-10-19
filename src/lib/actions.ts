import type { Page } from 'playwright';
import { upsertLink, saveLinks } from './links.ts';
import { STATUS } from './types.ts';
import type {
  ActionType,
  AppConfig,
  ApplyResult,
  LinkStore,
  PlanAction,
  ProductDetail,
  ProductPatch,
  ProductStatus,
  SourceAdapter,
  TargetAdapter,
} from './types.ts';

export interface ApplyContext {
  page: Page;
  config: AppConfig;
  links: LinkStore;
  details: Record<string, ProductDetail>;
  source: SourceAdapter;
  target: TargetAdapter;
  dryRun: boolean;
}

/** 핸들러가 돌려주는 결과. 기록(ApplyResult)과 화면 출력(message)을 한 번에 담는다. */
export interface Outcome {
  status: ApplyResult['status'];
  message?: string;
  reason?: string;
  url?: string;
  filled?: Record<string, unknown>;
  joongnaId?: string;
}

type Handler = (action: PlanAction, ctx: ApplyContext) => Promise<Outcome>;

const skip = (reason: string): Outcome => ({ status: 'skipped', reason });
const done = (message: string, extra: Partial<Outcome> = {}): Outcome => ({ status: 'done', message, ...extra });
const checked = (message: string, filled?: Record<string, unknown>): Outcome => ({
  status: 'dry-run',
  message,
  filled,
});

/** 번개장터 카테고리를 중고나라 카테고리로 옮긴다. 매핑이 없으면 등록하지 않는다. */
function resolveCategory(detail: ProductDetail | undefined, config: AppConfig): string | null {
  const byCode = detail?.categoryCode ? config.categoryMap[detail.categoryCode] : undefined;
  const byName = detail?.category ? config.categoryMap[detail.category] : undefined;
  return byCode ?? byName ?? null;
}

const create: Handler = async (action, ctx) => {
  const detail = ctx.details[action.bunjang.id];
  const categoryPath = resolveCategory(detail, ctx.config);
  if (!categoryPath) {
    return skip(
      `중고나라 카테고리 매핑이 없습니다. config.json categoryMap에 "${detail?.categoryCode}" 또는 "${detail?.category}"를 추가하세요.`,
    );
  }
  if (!detail?.imageFiles?.length) {
    return skip('사진이 없습니다. "npm run collect"로 사진을 먼저 내려받으세요.');
  }

  const created = await ctx.target.createProduct(
    ctx.page,
    {
      title: action.bunjang.title,
      price: action.bunjang.price,
      description: detail.description ?? '',
      images: detail.imageFiles,
      categoryPath,
      condition: ctx.config.joongna.condition,
      components: ctx.config.joongna.components,
      freeShipping: ctx.config.joongna.freeShipping,
    },
    { dryRun: ctx.dryRun },
  );

  if (created.dryRun) return checked('확인만 함', created.filled);
  if (!created.id) {
    return {
      status: 'unknown',
      url: created.url,
      reason: '등록 반영 여부가 불명확합니다. 중고나라 내 상점을 직접 확인하세요. 재등록하지 않습니다.',
    };
  }

  upsertLink(ctx.links, {
    bunjangId: action.bunjang.id,
    joongnaId: created.id,
    title: action.bunjang.title,
    origin: 'created',
  });
  await saveLinks(ctx.links);
  return done(`등록 완료: 중고나라 ${created.id}`, { joongnaId: created.id });
};

const update: Handler = async (action, ctx) => {
  const joongnaId = action.joongna!.id;
  const patch: ProductPatch = {};
  for (const change of action.changes ?? []) {
    if (change.field === 'price') patch.price = change.to as number;
    else patch[change.field] = change.to as string;
  }
  const result = await ctx.target.updateProduct(ctx.page, joongnaId, patch, { dryRun: ctx.dryRun });
  if (result.dryRun) return checked(`확인만 함: ${Object.keys(patch).join(', ')}`, result.filled);
  return done(`수정 완료: 중고나라 ${joongnaId}`);
};

/** 중고나라 상태를 바꾸는 작업들은 라벨만 다르다. */
function targetStatus(status: ProductStatus): Handler {
  return async (action, ctx) => {
    const joongnaId = action.joongna!.id;
    if (ctx.dryRun) return checked(`확인만 함: 중고나라 ${joongnaId} → ${status}`);
    await ctx.target.setStatus(ctx.page, joongnaId, status);
    return done(`상태 변경 완료: 중고나라 ${joongnaId} → ${status}`);
  };
}

const hideSource: Handler = async (action, ctx) => {
  if (ctx.dryRun) return checked(`확인만 함: 번개장터 ${action.bunjang.id} → ${STATUS.hidden}`);
  await ctx.source.hideProduct(ctx.page, action.bunjang.id);
  return done(`번개장터 숨김 완료: ${action.bunjang.id}`);
};

export const HANDLERS: Record<ActionType, Handler> = {
  create,
  update,
  markSold: targetStatus(STATUS.sold),
  hide: targetStatus(STATUS.hidden),
  reserve: targetStatus(STATUS.reserved),
  hideSource,
};
