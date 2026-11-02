// Corners of the frame, inset so the mark never runs off the edge. Moving it
// means a recording cannot crop it out with one fixed mask.
const SPOTS = [
  { top: '8%', left: '6%' },
  { top: '72%', left: '64%' },
  { top: '10%', left: '62%' },
  { top: '70%', left: '8%' },
] as const;

export function watermarkSpot(step: number): { top: `${number}%`; left: `${number}%` } {
  return SPOTS[step % SPOTS.length];
}
