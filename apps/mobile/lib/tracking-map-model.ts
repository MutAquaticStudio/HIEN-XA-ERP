import type { MobileTrackingPoint } from "./api";

export type NativeMapCoordinate = [number, number];

export function acceptedTrackingCoordinates(points: MobileTrackingPoint[]): NativeMapCoordinate[] {
  return points
    .filter((point) => point.quality !== "suspect" && Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
    .map((point) => [point.longitude, point.latitude] as NativeMapCoordinate);
}

export function latestAcceptedTrackingCoordinate(points: MobileTrackingPoint[]) {
  return acceptedTrackingCoordinates(points).at(-1);
}
