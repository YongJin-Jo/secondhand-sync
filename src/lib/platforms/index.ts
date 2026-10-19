import * as bunjang from './bunjang.ts';
import * as joongna from './joongna.ts';
import type { AppConfig, PlatformName, SourceAdapter, TargetAdapter } from '../types.ts';

// 각 구현이 규약을 지키는지 여기서 한 번 확인한다. 어긋나면 타입 검사에서 걸린다.
const source: SourceAdapter = bunjang;
const target: TargetAdapter = joongna;

const REGISTRY: Record<PlatformName, SourceAdapter | TargetAdapter> = { bunjang: source, joongna: target };

export function getPlatform(name: PlatformName): SourceAdapter | TargetAdapter {
  const platform = REGISTRY[name];
  if (!platform) throw new Error(`모르는 플랫폼입니다: ${name}`);
  return platform;
}

/** 설정이 가리키는 기준·대상 상점을 짝으로 돌려준다. */
export function resolvePlatforms(config: AppConfig): { source: SourceAdapter; target: TargetAdapter } {
  if (config.source.platform !== 'bunjang' || config.target.platform !== 'joongna') {
    throw new Error('지금은 번개장터 → 중고나라 방향만 지원합니다.');
  }
  return { source, target };
}

export { bunjang, joongna };
