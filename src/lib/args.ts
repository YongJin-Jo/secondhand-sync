export interface Args {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const options: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

export const flag = (args: Args, name: string): boolean => args[name] === true;
export const value = (args: Args, name: string): string | null =>
  typeof args[name] === 'string' ? (args[name] as string) : null;

/** 명령을 멈추고 이유를 알린다. */
export function fail(...messages: string[]): never {
  for (const message of messages) console.error(message);
  process.exit(1);
}
