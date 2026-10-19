import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { profileDir } from './config.ts';

export interface Session {
  context: BrowserContext;
  page: Page;
}

/** 일반 Chrome 프로필과 분리한 로그인 전용 프로필. 쿠키를 출력하거나 내보내지 않는다. */
export async function openContext({ headless = false } = {}): Promise<BrowserContext> {
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  return chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless, viewport: null });
}

/** 로그인 화면이나 추가 인증으로 넘어갔는지 확인한다. 자동 입력은 하지 않는다. */
export function needsLogin(url: string): boolean {
  return /\/login|\/signin|nid\.naver\.com|accounts\.kakao\.com|\/auth\//i.test(url);
}

export function requireLoggedIn(page: Page, label: string): void {
  if (needsLogin(page.url())) {
    throw new Error(
      `${label} 로그인이 필요합니다. "npm run browser"로 브라우저를 열어 직접 로그인한 뒤 다시 실행하세요.`,
    );
  }
}

/** 명령마다 반복되던 "열고 - 쓰고 - 반드시 닫고"를 한곳에 둔다. */
export async function withSession<T>(run: (session: Session) => Promise<T>, options = {}): Promise<T> {
  const context = await openContext(options);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    return await run({ context, page });
  } finally {
    await context.close();
  }
}
