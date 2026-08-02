import { acceptedTrackingCoordinates, latestAcceptedTrackingCoordinate } from "../lib/tracking-map-model";

describe("native tracking map model", () => {
  it("renders only valid accepted GPS points for the assigned route", () => {
    const points = [
      { latitude: 10.776, longitude: 106.7, recordedAt: "2026-07-29T10:00:00.000Z", quality: "accepted" as const },
      { latitude: 10.777, longitude: 106.701, recordedAt: "2026-07-29T10:01:00.000Z", quality: "suspect" as const },
      { latitude: Number.NaN, longitude: 106.702, recordedAt: "2026-07-29T10:02:00.000Z", quality: "accepted" as const },
      { latitude: 10.778, longitude: 106.703, recordedAt: "2026-07-29T10:03:00.000Z", quality: "accepted" as const }
    ];

    expect(acceptedTrackingCoordinates(points)).toEqual([[106.7, 10.776], [106.703, 10.778]]);
    expect(latestAcceptedTrackingCoordinate(points)).toEqual([106.703, 10.778]);
  });
});
