import { isBelowMinimum } from '@/lib/version';

describe('isBelowMinimum', () => {
  test.each([
    ['1.0.0', '0.0.0', false],
    ['1.0.0', '1.0.0', false],
    ['1.0.0', '1.0.1', true],
    ['1.9.0', '1.10.0', true],
    ['2.0.0', '1.99.99', false],
    ['1.2', '1.2.0', false],
  ])('app %s against minimum %s is below: %s', (current, minimum, expected) => {
    expect(isBelowMinimum(current, minimum)).toBe(expected);
  });

  test('a minimum it cannot read never locks the user out', () => {
    expect(isBelowMinimum('1.0.0', 'not-a-version')).toBe(false);
    expect(isBelowMinimum('1.0.0', undefined)).toBe(false);
  });
});
