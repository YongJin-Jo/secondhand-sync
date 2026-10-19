import type { Page } from 'playwright';
import { accountStore, type ExpectedAccount } from './store.ts';
import { requireLoggedIn } from './session.ts';
import type { Account, PlatformAdapter } from './types.ts';

// 이 도구는 브라우저 프로필에 로그인된 계정으로 동작한다.
// 다른 계정으로 로그인한 채 실행하는 사고를 막기 위해 실행 전에 계정을 확인한다.
// 확인 기준은 저장소에 올라가지 않는 .local/data/account.json에 둔다.

export interface Platforms {
  source: PlatformAdapter;
  target: PlatformAdapter;
}

export const loadExpectedAccount = (): Promise<ExpectedAccount | null> => accountStore.read();

export const saveExpectedAccount = (account: ExpectedAccount): Promise<string> =>
  accountStore.write({ ...account, savedAt: new Date().toISOString() });

export async function readAccounts(page: Page, { source, target }: Platforms): Promise<{
  source: Account;
  target: Account;
}> {
  const sourceAccount = await source.readAccount(page);
  requireLoggedIn(page, source.label);
  const targetAccount = await target.readAccount(page);
  requireLoggedIn(page, target.label);
  return { source: sourceAccount, target: targetAccount };
}

function assertAccount(label: string, expected: string | null | undefined, actual: string | null): void {
  if (!expected) {
    console.log(`확인 생략: ${label} 기준 계정이 없습니다. 지금 로그인된 계정은 "${actual ?? '알 수 없음'}"입니다.`);
    return;
  }
  if (!actual) throw new Error(`${label} 로그인 계정을 읽지 못했습니다. 화면 구조가 바뀌었는지 확인하세요.`);
  if (actual !== expected) {
    throw new Error(
      `${label} 계정이 다릅니다. 설정: "${expected}", 로그인됨: "${actual}". 다른 계정의 상품을 건드리지 않도록 중단합니다.`,
    );
  }
  console.log(`${label} 계정 확인: ${actual}`);
}

/**
 * 수집·반영 전에 로그인된 계정이 저장해 둔 계정과 같은지 확인한다.
 * 저장된 계정이 없으면 막지는 않되, 지금 어떤 계정으로 도는지 알린다.
 */
export async function guardAccounts(page: Page, platforms: Platforms) {
  const expected = await loadExpectedAccount();
  if (!expected) console.log('계정 확인 기준이 없습니다. "npm run whoami -- --save"로 이 계정을 고정할 수 있습니다.');
  const accounts = await readAccounts(page, platforms);
  assertAccount(platforms.source.label, expected?.bunjang, accounts.source.nickname);
  assertAccount(platforms.target.label, expected?.joongna, accounts.target.nickname);
  return accounts;
}
