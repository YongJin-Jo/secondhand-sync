import { linkStore } from './store.ts';
import type { LinkStore, ProductLink } from './types.ts';

export const loadLinks = (): Promise<LinkStore> => linkStore.read();

export const saveLinks = (store: LinkStore): Promise<string> =>
  linkStore.write({ ...store, updatedAt: new Date().toISOString() });

export const findBySource = (store: LinkStore, bunjangId: string): ProductLink | null =>
  store.links.find((link) => link.bunjangId === String(bunjangId)) ?? null;

export const findByTarget = (store: LinkStore, joongnaId: string): ProductLink | null =>
  store.links.find((link) => link.joongnaId === String(joongnaId)) ?? null;

/** 연결은 사용자가 확인한 경우(confirmed)나 이 도구가 직접 등록한 경우(created)만 기록한다. */
export function upsertLink(
  store: LinkStore,
  input: { bunjangId: string; joongnaId: string; title?: string | null; origin: ProductLink['origin'] },
): ProductLink {
  const next: ProductLink = {
    bunjangId: String(input.bunjangId),
    joongnaId: String(input.joongnaId),
    title: input.title ?? null,
    origin: input.origin,
    linkedAt: new Date().toISOString(),
  };
  const conflict = store.links.find(
    (link) =>
      (link.bunjangId === next.bunjangId && link.joongnaId !== next.joongnaId) ||
      (link.joongnaId === next.joongnaId && link.bunjangId !== next.bunjangId),
  );
  if (conflict) {
    throw new Error(
      `이미 다른 상품과 연결되어 있습니다: 번개장터 ${conflict.bunjangId} ↔ 중고나라 ${conflict.joongnaId}`,
    );
  }
  const index = store.links.findIndex(
    (link) => link.bunjangId === next.bunjangId && link.joongnaId === next.joongnaId,
  );
  if (index >= 0) store.links[index] = next;
  else store.links.push(next);
  return next;
}

export function removeLink(store: LinkStore, filter: { bunjangId?: string; joongnaId?: string }): number {
  const before = store.links.length;
  store.links = store.links.filter(
    (link) =>
      !(filter.bunjangId && link.bunjangId === String(filter.bunjangId)) &&
      !(filter.joongnaId && link.joongnaId === String(filter.joongnaId)),
  );
  return before - store.links.length;
}
