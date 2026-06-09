const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

export function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}
