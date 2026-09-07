export type BorderPoint = { x: number; y: number };
export type BorderSegment = { id: string; countryIds: number[]; points: BorderPoint[] };
const same = (a: BorderPoint, b: BorderPoint) => a.x === b.x && a.y === b.y;
export function joinBorderSegments(segments: readonly BorderSegment[]): BorderPoint[] | null {
  let result: BorderPoint[] = [];
  for (const segment of segments) {
    const points = segment.points;
    if (points.length < 2) return null;
    if (!result.length) { result = [...points]; continue; }
    if (same(result.at(-1)!, points[0])) result.push(...points.slice(1));
    else if (same(result.at(-1)!, points.at(-1)!)) result.push(...points.slice(0, -1).reverse());
    else if (same(result[0], points.at(-1)!)) result.unshift(...points.slice(0, -1));
    else if (same(result[0], points[0])) result.unshift(...points.slice(1).reverse());
    else return null;
  }
  return result;
}
