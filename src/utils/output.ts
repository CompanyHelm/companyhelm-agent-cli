export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, (_, nestedValue: unknown) => {
    if (typeof nestedValue === "bigint") {
      return nestedValue.toString();
    }

    return nestedValue;
  });
}

export function writeJsonStdout(value: unknown): void {
  process.stdout.write(`${stringifyJson(value)}\n`);
}

export function writeJsonStderr(value: unknown): void {
  process.stderr.write(`${stringifyJson(value)}\n`);
}
