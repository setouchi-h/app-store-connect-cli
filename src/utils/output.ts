export interface Writer {
  write(chunk: string): unknown;
}

export function writeJson(writer: Writer, value: unknown): void {
  writer.write(`${JSON.stringify(value)}\n`);
}
