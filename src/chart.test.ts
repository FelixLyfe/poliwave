import { describe, expect, it } from "vitest";
import { buildCurveSvg } from "./chart";
import type { HistoryPoint } from "./types";

describe("buildCurveSvg", () => {
  it("renders an svg with one point per sample", () => {
    const points: HistoryPoint[] = [
      { time: 1, dbm: -50 },
      { time: 2, dbm: -60 },
      { time: 3, dbm: -70 },
    ];

    const svg = buildCurveSvg(points);

    expect(svg).toContain("<svg");
    const polyline = svg.match(/<polyline class="curve-line" points="([^"]+)"/);
    expect(polyline).not.toBeNull();
    expect(polyline![1].trim().split(" ")).toHaveLength(3);
    expect(svg).toContain("-70 dBm");
  });

  it("handles a single sample without NaN coordinates", () => {
    const svg = buildCurveSvg([{ time: 1, dbm: -55 }]);

    expect(svg).not.toContain("NaN");
    expect(svg).toContain("-55 dBm");
  });

  it("clamps out-of-range dbm values into the plot area", () => {
    const svg = buildCurveSvg([
      { time: 1, dbm: -10 },
      { time: 2, dbm: -120 },
    ]);

    const polyline = svg.match(/<polyline class="curve-line" points="([^"]+)"/);
    const coords = polyline![1]
      .trim()
      .split(" ")
      .map((pair) => pair.split(",").map(Number));

    // 绘图区高度 236、上下留白 28,y 必须落在 [28, 208] 内
    for (const [, y] of coords) {
      expect(y).toBeGreaterThanOrEqual(28);
      expect(y).toBeLessThanOrEqual(208);
    }
  });
});
