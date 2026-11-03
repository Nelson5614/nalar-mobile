const UNITS: [string, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes ago", as YouTube labels comments. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));

  for (const [unit, size] of UNITS) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  }

  return 'just now';
}

/** "Nov 2, 2026", the web's formatDate. */
export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

/** "1.2K", "15K", "2.5M" for like and view counts. */
export function compactCount(count: number): string {
  const scaled = (value: number, suffix: string) => `${Number(value.toFixed(value < 10 ? 1 : 0))}${suffix}`;
  if (count >= 1_000_000) return scaled(count / 1_000_000, 'M');
  if (count >= 1_000) return scaled(count / 1_000, 'K');

  return String(count);
}
