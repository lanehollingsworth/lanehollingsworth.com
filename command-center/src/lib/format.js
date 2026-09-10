export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function usd(n, { sign = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'TBD';
  const value = round2(n);
  const formatted = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = value < 0 ? '-$' : sign ? '+$' : '$';
  return `${prefix}${formatted}`;
}

export function pct(n) {
  if (n === null || n === undefined) return 'TBD';
  return `${round2(n * 100)}%`;
}

export function pad(value, width, align = 'left') {
  const text = String(value);
  if (text.length >= width) return text;
  const filler = ' '.repeat(width - text.length);
  return align === 'right' ? filler + text : text + filler;
}

export function table(rows, columns) {
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((row) => String(col.value(row) ?? '').length)),
  );
  const header = columns.map((col, i) => pad(col.header, widths[i], col.align)).join('  ');
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((row) =>
    columns.map((col, i) => pad(col.value(row) ?? '', widths[i], col.align)).join('  '),
  );
  return [header, rule, ...body].join('\n');
}

export function heading(text) {
  return `\n${text}\n${'='.repeat(text.length)}`;
}

export function subheading(text) {
  return `\n${text}\n${'-'.repeat(text.length)}`;
}

/** Calendar-day math on plain YYYY-MM-DD strings, UTC only, no timezone drift. */
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error(`Invalid date range: ${fromIso} -> ${toIso}`);
  }
  return Math.round((to - from) / 86400000);
}

export function weekday(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
