import { watermarkSpot } from '@/lib/watermark';

describe('watermarkSpot', () => {
  test('moves to a different spot each step and cycles back', () => {
    const spots = [0, 1, 2, 3].map(watermarkSpot);

    expect(new Set(spots.map((spot) => JSON.stringify(spot))).size).toBe(4);
    expect(watermarkSpot(4)).toEqual(watermarkSpot(0));
  });

  test('every spot keeps the mark inside the frame', () => {
    for (let step = 0; step < 4; step++) {
      const { top, left } = watermarkSpot(step);
      expect(parseFloat(top)).toBeGreaterThanOrEqual(5);
      expect(parseFloat(top)).toBeLessThanOrEqual(80);
      expect(parseFloat(left)).toBeGreaterThanOrEqual(5);
      expect(parseFloat(left)).toBeLessThanOrEqual(70);
    }
  });
});
