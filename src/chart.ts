import { clamp } from "./format";
import type { HistoryPoint } from "./types";

export function buildCurveSvg(points: HistoryPoint[]): string {
  const width = 460;
  const height = 236;
  const padding = 28;
  const minDbm = -100;
  const maxDbm = -30;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const mapped = points.map((point, index) => {
    const x = padding + (points.length === 1 ? usableWidth : (index / (points.length - 1)) * usableWidth);
    const y = padding + ((maxDbm - clamp(point.dbm, minDbm, maxDbm)) / (maxDbm - minDbm)) * usableHeight;
    return { x, y, dbm: point.dbm };
  });

  const line = mapped.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;
  const latest = mapped[mapped.length - 1];

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="RSSI history curve">
      <defs>
        <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#00d18f" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#00d18f" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line class="grid" x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" />
      <line class="grid" x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" />
      <line class="grid" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
      <text x="8" y="${padding + 4}">-30</text>
      <text x="8" y="${height / 2 + 4}">-65</text>
      <text x="8" y="${height - padding + 4}">-100</text>
      <polygon class="curve-area" points="${area}" />
      <polyline class="curve-line" points="${line}" />
      <circle class="curve-point" cx="${latest.x}" cy="${latest.y}" r="5" />
      <text class="latest-label" x="${Math.min(latest.x + 10, width - 86)}" y="${Math.max(latest.y - 10, 24)}">${latest.dbm} dBm</text>
    </svg>
  `;
}
