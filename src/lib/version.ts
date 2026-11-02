function parse(version: string | undefined): number[] | null {
  if (!version || !/^\d+(\.\d+){0,2}$/.test(version)) return null;

  const parts = version.split('.').map(Number);
  while (parts.length < 3) parts.push(0);

  return parts;
}

/**
 * The minimum comes from the server. One it cannot read must never lock
 * people out of the app, so anything unparseable counts as satisfied.
 */
export function isBelowMinimum(current: string, minimum: string | undefined): boolean {
  const have = parse(current);
  const need = parse(minimum);
  if (!have || !need) return false;

  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] < need[i];
  }

  return false;
}
