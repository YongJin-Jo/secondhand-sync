import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AppConfig } from './types.ts';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const localDir = path.join(root, '.local');
export const dataDir = path.join(localDir, 'data');
export const profileDir = path.join(localDir, 'browser-profile');
export const imageDir = (productId: string): string => path.join(dataDir, 'images', productId);

const DEFAULTS = {
  collect: { pageSize: 100, maxPages: 20, maxScrolls: 40 },
  sync: { title: true, price: true, description: true, hideSource: true },
  joongna: { condition: 'used', components: 'none', freeShipping: true },
} as const;

/** 기본값은 한곳에서만 채운다. 읽는 쪽에서 ?? 로 다시 채우지 않는다. */
export async function loadConfig(): Promise<AppConfig> {
  const raw = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')) as Partial<AppConfig>;
  if (!raw.source || !raw.target) throw new Error('config.json에 source와 target이 필요합니다.');
  return {
    source: raw.source,
    target: raw.target,
    collect: { ...DEFAULTS.collect, ...raw.collect },
    sync: { ...DEFAULTS.sync, ...raw.sync },
    joongna: { ...DEFAULTS.joongna, ...raw.joongna },
    categoryMap: { ...raw.categoryMap },
  };
}
