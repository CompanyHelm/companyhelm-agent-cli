export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, (key: string, nestedValue: unknown) => {
    if (key === "$typeName") {
      return undefined;
    }

    if (typeof nestedValue === "bigint") {
      return nestedValue.toString();
    }

    return nestedValue;
  }, 2);
}

export function writeJsonStdout(value: unknown): void {
  process.stdout.write(`${stringifyJson(value)}\n`);
}

export function writeJsonStderr(value: unknown): void {
  process.stderr.write(`${stringifyJson(value)}\n`);
}
