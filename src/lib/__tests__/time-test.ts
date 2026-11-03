import { compactCount, shortDate, timeAgo } from '@/lib/time';

const now = new Date('2026-11-03T12:00:00Z').getTime();

describe('timeAgo', () => {
  test.each([
    ['2026-11-03T11:59:40Z', 'just now'],
    ['2026-11-03T11:55:00Z', '5 minutes ago'],
    ['2026-11-03T11:00:00Z', '1 hour ago'],
    ['2026-11-01T12:00:00Z', '2 days ago'],
    ['2026-10-13T12:00:00Z', '3 weeks ago'],
    ['2026-06-03T12:00:00Z', '5 months ago'],
    ['2024-11-03T12:00:00Z', '2 years ago'],
  ])('%s reads as %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });

  test('no date reads as nothing', () => {
    expect(timeAgo(null, now)).toBe('');
  });
});

describe('shortDate', () => {
  test('reads like the web cards', () => {
    expect(shortDate('2026-11-02T10:00:00+00:00')).toBe('Nov 2, 2026');
    expect(shortDate(null)).toBeNull();
  });
});

describe('compactCount', () => {
  test.each([
    [0, '0'],
    [999, '999'],
    [1200, '1.2K'],
    [15000, '15K'],
    [2_500_000, '2.5M'],
  ])('%d reads as %s', (count, expected) => {
    expect(compactCount(count)).toBe(expected);
  });
});
