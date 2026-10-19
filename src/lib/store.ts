import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './config.ts';
import type { ApplyResult, LinkStore, Plan, Snapshot } from './types.ts';

export interface JsonFile<T> {
  readonly file: string;
  read(): Promise<T>;
  write(value: T): Promise<string>;
}

/** .local/data 아래 JSON 파일 하나를 읽고 쓰는 창구. 경로를 호출하는 쪽에 흘리지 않는다. */
function jsonFile<T>(name: string, fallback: T): JsonFile<T> {
  const file = path.join(dataDir, name);
  return {
    file,
    async read() {
      try {
        return JSON.parse(await readFile(file, 'utf8')) as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
        throw error;
      }
    },
    async write(value: T) {
      await mkdir(dataDir, { recursive: true, mode: 0o700 });
      await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
      return file;
    },
  };
}

export interface ExpectedAccount {
  bunjang: string | null;
  joongna: string | null;
  shopId?: string;
  savedAt?: string;
}

export interface ApplyLog {
  appliedAt: string;
  results: ApplyResult[];
}

export const snapshotStore = jsonFile<Snapshot | null>('snapshot.json', null);
export const planStore = jsonFile<Plan | null>('plan.json', null);
export const applyLogStore = jsonFile<ApplyLog>('apply-log.json', { appliedAt: '', results: [] });
export const linkStore = jsonFile<LinkStore>('links.json', { version: 1, updatedAt: null, links: [] });
export const accountStore = jsonFile<ExpectedAccount | null>('account.json', null);
