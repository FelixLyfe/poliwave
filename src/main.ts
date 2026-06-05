import { invoke } from "@tauri-apps/api/core";
import { createIcons, Radar, RadioTower, Sparkles, Wifi } from "lucide";
import "./styles.css";

type Band = "2.4GHz" | "5GHz" | "6GHz" | "Unknown";

interface WifiNetwork {
  ssid: string;
  bssid: string;
  signalDbm: number;
  quality: number;
  channel: number;
  frequencyMhz: number;
  band: Band;
  security: string;
  isConnected: boolean;
}

interface ChannelCongestion {
  band: Band;
  channel: number;
  networkCount: number;
  strongestSignalDbm: number;
  loadScore: number;
}

interface Recommendation {
  kind: "connect" | "channel" | string;
  title: string;
  detail: string;
  targetSsid?: string | null;
  channel?: number | null;
  score: number;
}

interface ScanResult {
  scannedAt: string;
  source: string;
  networks: WifiNetwork[];
  channels: ChannelCongestion[];
  recommendations: Recommendation[];
}

interface HistoryPoint {
  time: number;
  dbm: number;
}

const HISTORY_LIMIT = 36;
const state: {
  scan?: ScanResult;
  selectedBssid?: string;
  history: Map<string, HistoryPoint[]>;
  autoScan: boolean;
  busy: boolean;
  lastError?: string;
} = {
  history: new Map(),
  autoScan: false,
  busy: false,
};

let autoScanTimer: number | undefined;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="shell">
    <section class="command-bar">
      <header class="topbar">
        <div>
          <p class="eyebrow">Desktop WiFi Signal Analyzer</p>
          <h1>WiFi 信号分析器</h1>
        </div>
      </header>

      <section class="status-grid" aria-label="扫描摘要">
        <article class="metric">
          <span>发现网络</span>
          <strong id="networkCount">0</strong>
        </article>
        <article class="metric">
          <span>最佳信号</span>
          <strong id="bestSignal">--</strong>
        </article>
        <article class="metric">
          <span>拥堵信道</span>
          <strong id="busyChannel">--</strong>
        </article>
        <article class="metric source-metric">
          <span>数据源</span>
          <strong id="scanSource">待扫描</strong>
        </article>
      </section>

      <div class="actions">
        <button id="scanBtn" class="button primary" type="button">
          <i data-lucide="radar"></i>
          <span>扫描 WiFi</span>
        </button>
        <label class="toggle">
          <input id="autoScan" type="checkbox" />
          <span>自动刷新</span>
        </label>
      </div>
    </section>

    <section class="workspace">
      <aside class="panel network-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">按信号强度排序</p>
            <h2>周围 WiFi</h2>
          </div>
          <span id="scanTime" class="stamp">--</span>
        </div>
        <div id="networkList" class="network-list empty-state">点击扫描开始分析</div>
      </aside>

      <section class="analysis">
        <section class="panel curve-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">RSSI History</p>
              <h2 id="curveTitle">RSSI 曲线</h2>
            </div>
            <span id="curveMeta" class="stamp">选择一个网络</span>
          </div>
          <div id="rssiCurve" class="curve empty-state">扫描后选择网络查看曲线</div>
          <div id="selectedDetail" class="selected-detail"></div>
        </section>

        <section class="insight-grid">
          <div class="panel recommendation-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">连接与信道建议</p>
                <h2>建议</h2>
              </div>
              <i data-lucide="sparkles"></i>
            </div>
            <div id="recommendations" class="recommendations empty-state">等待扫描结果</div>
          </div>

          <div class="panel congestion-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Channel Load</p>
                <h2>信道拥堵</h2>
              </div>
              <div class="legend">
                <span><b class="legend-dot low"></b>低</span>
                <span><b class="legend-dot mid"></b>中</span>
                <span><b class="legend-dot high"></b>高</span>
              </div>
            </div>
            <div id="channelChart" class="channel-chart empty-state">暂无信道数据</div>
          </div>
        </section>
      </section>
    </section>
  </main>
`;

const scanBtn = mustGet<HTMLButtonElement>("scanBtn");
const autoScanInput = mustGet<HTMLInputElement>("autoScan");

scanBtn.addEventListener("click", () => void runScan());
autoScanInput.addEventListener("change", () => {
  state.autoScan = autoScanInput.checked;
  setupAutoScan();
});

createIcons({ icons: { Radar, RadioTower, Sparkles, Wifi } });
render();
void runScan();

async function runScan(): Promise<void> {
  if (state.busy) {
    return;
  }

  state.busy = true;
  state.lastError = undefined;
  render();

  try {
    const scan = await getScanResult();
    state.scan = scan;
    ingestHistory(scan);

    const current = scan.networks.find((network) => network.isConnected);
    const selectionStillExists = scan.networks.some((network) => network.bssid === state.selectedBssid);
    if ((!state.selectedBssid || !selectionStillExists) && scan.networks[0]) {
      state.selectedBssid = current?.bssid ?? scan.networks[0].bssid;
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function getScanResult(): Promise<ScanResult> {
  if (isTauriRuntime()) {
    return invoke<ScanResult>("scan_wifi");
  }

  await new Promise((resolve) => window.setTimeout(resolve, 360));
  return demoScan();
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function setupAutoScan(): void {
  if (autoScanTimer !== undefined) {
    window.clearInterval(autoScanTimer);
  }
  autoScanTimer = state.autoScan ? window.setInterval(() => void runScan(), 5000) : undefined;
}

function ingestHistory(scan: ScanResult): void {
  const now = Date.parse(scan.scannedAt);

  for (const network of scan.networks) {
    const points = state.history.get(network.bssid) ?? [];
    points.push({ time: now, dbm: network.signalDbm });
    state.history.set(network.bssid, points.slice(-HISTORY_LIMIT));
  }
}

function render(): void {
  scanBtn.disabled = state.busy;
  scanBtn.classList.toggle("loading", state.busy);
  scanBtn.querySelector("span")!.textContent = state.busy ? "扫描中" : "扫描 WiFi";

  const scan = state.scan;
  const selected = getSelectedNetwork();

  setText("networkCount", scan ? String(scan.networks.length) : "0");
  setText("bestSignal", scan?.networks[0] ? `${scan.networks[0].signalDbm} dBm` : "--");
  setText("busyChannel", scan ? getBusiestChannelLabel(scan.channels) : "--");
  const sourceLabel = scan ? formatSourceLabel(scan.source) : state.lastError ? "扫描失败" : "待扫描";
  setText("scanSource", sourceLabel);
  mustGet<HTMLElement>("scanSource").title = scan?.source ?? sourceLabel;
  setText("scanTime", scan ? formatTime(scan.scannedAt) : "--");

  renderNetworks(scan?.networks ?? []);
  renderRecommendations(scan?.recommendations ?? []);
  renderChannels(scan?.channels ?? []);
  renderCurve(selected);
  renderSelectedDetail(selected);

  createIcons({ icons: { Radar, RadioTower, Sparkles, Wifi } });
}

function renderNetworks(networks: WifiNetwork[]): void {
  const list = mustGet<HTMLDivElement>("networkList");

  if (state.lastError) {
    list.className = "network-list empty-state error";
    list.textContent = state.lastError;
    return;
  }

  if (!networks.length) {
    list.className = "network-list empty-state";
    list.textContent = state.busy ? "正在读取无线网卡数据" : "未发现 WiFi";
    return;
  }

  list.className = "network-list";
  list.innerHTML = networks
    .map((network) => {
      const selected = network.bssid === state.selectedBssid;
      const connected = network.isConnected;
      return `
        <button class="network-row ${selected ? "selected" : ""} ${connected ? "connected" : ""}" type="button" data-bssid="${escapeAttr(network.bssid)}">
          <span class="signal-mark ${signalClass(network.signalDbm)}"></span>
          <span class="network-main">
            <span class="network-title">
              <strong>${escapeHtml(network.ssid)}</strong>
              ${connected ? '<span class="connected-badge">当前连接</span>' : ""}
            </span>
            <small>${escapeHtml(network.bssid)} · CH ${network.channel || "--"} · ${network.frequencyMhz || "--"} MHz</small>
          </span>
          <span class="network-side">
            <b>${network.signalDbm} dBm</b>
            <small>${network.band}</small>
          </span>
          <span class="quality-bar" aria-hidden="true"><span style="width:${clamp(network.quality, 0, 100)}%"></span></span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll<HTMLButtonElement>(".network-row").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedBssid = button.dataset.bssid;
      render();
    });
  });
}

function renderRecommendations(recommendations: Recommendation[]): void {
  const root = mustGet<HTMLDivElement>("recommendations");

  if (!recommendations.length) {
    root.className = "recommendations empty-state";
    root.textContent = state.busy ? "正在生成建议" : "等待扫描结果";
    return;
  }

  root.className = "recommendations";
  root.innerHTML = recommendations
    .map((item) => {
      const icon = item.kind === "connect" ? "wifi" : "radio-tower";
      return `
        <article class="recommendation">
          <i data-lucide="${icon}"></i>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail)}</p>
          </div>
          <span>${Math.round(item.score)}</span>
        </article>
      `;
    })
    .join("");
}

function renderChannels(channels: ChannelCongestion[]): void {
  const root = mustGet<HTMLDivElement>("channelChart");

  if (!channels.length) {
    root.className = "channel-chart empty-state";
    root.textContent = state.busy ? "正在计算信道负载" : "暂无信道数据";
    return;
  }

  const bands: Band[] = ["2.4GHz", "5GHz", "6GHz"];
  root.className = "channel-chart";
  root.innerHTML = bands
    .map((band) => {
      const items = channels
        .filter((channel) => channel.band === band)
        .sort((a, b) => a.channel - b.channel);
      if (!items.length) {
        return "";
      }

      return `
        <div class="band-row">
          <div class="band-label">${band}</div>
          <div class="channel-bars">
            ${items
              .map(
                (item) => `
                  <div class="channel-item" title="CH ${item.channel}, ${item.networkCount} networks, ${item.loadScore}% load">
                    <div class="bar ${loadClass(item.loadScore)}" style="height:${Math.max(10, item.loadScore)}%"></div>
                    <span>${item.channel}</span>
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCurve(network?: WifiNetwork): void {
  const root = mustGet<HTMLDivElement>("rssiCurve");
  const curveTitle = mustGet<HTMLHeadingElement>("curveTitle");
  const curveMeta = mustGet<HTMLSpanElement>("curveMeta");

  if (!network) {
    root.className = "curve empty-state";
    root.textContent = state.busy ? "等待扫描样本" : "扫描后选择网络查看曲线";
    curveTitle.textContent = "RSSI 曲线";
    curveMeta.textContent = "选择一个网络";
    return;
  }

  const points = state.history.get(network.bssid) ?? [{ time: Date.now(), dbm: network.signalDbm }];
  curveTitle.textContent = `${network.ssid} RSSI`;
  curveMeta.textContent = `${network.band} · CH ${network.channel || "--"}`;
  root.className = "curve";
  root.innerHTML = buildCurveSvg(points);
}

function renderSelectedDetail(network?: WifiNetwork): void {
  const root = mustGet<HTMLDivElement>("selectedDetail");

  if (!network) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = `
    <div><span>SSID</span><strong>${escapeHtml(network.ssid)}</strong></div>
    <div><span>BSSID</span><strong>${escapeHtml(network.bssid)}</strong></div>
    <div><span>安全</span><strong>${escapeHtml(network.security)}</strong></div>
    <div><span>信号质量</span><strong>${network.quality}%</strong></div>
    <div><span>连接状态</span><strong>${network.isConnected ? "当前连接" : "未连接"}</strong></div>
  `;
}

function buildCurveSvg(points: HistoryPoint[]): string {
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

function getSelectedNetwork(): WifiNetwork | undefined {
  const networks = state.scan?.networks ?? [];
  return networks.find((network) => network.bssid === state.selectedBssid) ?? networks[0];
}

function getBusiestChannelLabel(channels: ChannelCongestion[]): string {
  const busiest = channels.reduce<ChannelCongestion | undefined>(
    (current, item) => (!current || item.loadScore > current.loadScore ? item : current),
    undefined,
  );
  return busiest ? `${busiest.band} CH ${busiest.channel}` : "--";
}

function signalClass(dbm: number): string {
  if (dbm >= -55) {
    return "excellent";
  }
  if (dbm >= -68) {
    return "good";
  }
  if (dbm >= -80) {
    return "fair";
  }
  return "poor";
}

function loadClass(load: number): string {
  if (load >= 72) {
    return "high";
  }
  if (load >= 42) {
    return "mid";
  }
  return "low";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatSourceLabel(source: string): string {
  if (source.startsWith("system_profiler")) {
    return "系统 WiFi 信息";
  }
  if (source.startsWith("airport")) {
    return "airport 扫描";
  }
  if (source.startsWith("netsh")) {
    return "Windows WiFi";
  }
  if (source.startsWith("nmcli")) {
    return "Linux WiFi";
  }
  if (source.startsWith("iw ")) {
    return "iw 扫描";
  }
  return source;
}

function demoScan(): ScanResult {
  const now = new Date().toISOString();
  const jitter = () => Math.round((Math.random() - 0.5) * 8);
  const networks: WifiNetwork[] = [
    makeDemo("Studio-5G", "8c:85:90:42:11:01", -49 + jitter(), 149, "WPA3", "5GHz", true),
    makeDemo("Studio-IoT", "8c:85:90:42:11:02", -61 + jitter(), 6, "WPA2", "2.4GHz"),
    makeDemo("Neighbor-Living", "42:31:aa:09:c1:33", -72 + jitter(), 6, "WPA2", "2.4GHz"),
    makeDemo("CafeMesh", "00:25:9c:aa:78:2d", -67 + jitter(), 44, "WPA2", "5GHz"),
    makeDemo("Printer Setup", "c0:ff:ee:00:19:91", -82 + jitter(), 11, "Open", "2.4GHz"),
    makeDemo("Office-Guest", "28:ef:01:dd:22:91", -58 + jitter(), 36, "WPA2", "5GHz"),
  ].sort((a, b) => b.signalDbm - a.signalDbm);

  const channels = buildDemoChannels(networks);

  return {
    scannedAt: now,
    source: "Browser demo data",
    networks,
    channels,
    recommendations: [
      {
        kind: "connect",
        title: "建议连接 Studio-5G",
        detail: "5GHz 信号稳定，信道负载低于邻近 2.4GHz 网络。",
        targetSsid: "Studio-5G",
        channel: 149,
        score: 91,
      },
      {
        kind: "channel",
        title: "2.4GHz 建议切到信道 1",
        detail: "当前 6/11 附近网络较多，信道 1 的重叠干扰最低。",
        channel: 1,
        score: 82,
      },
      {
        kind: "channel",
        title: "5GHz 建议切到信道 149",
        detail: "149 附近负载低，适合主路由或办公设备优先使用。",
        channel: 149,
        score: 88,
      },
    ],
  };
}

function makeDemo(
  ssid: string,
  bssid: string,
  signalDbm: number,
  channel: number,
  security: string,
  band: Band,
  isConnected = false,
): WifiNetwork {
  return {
    ssid,
    bssid,
    signalDbm,
    quality: clamp((signalDbm + 100) * 2, 0, 100),
    channel,
    frequencyMhz: channel <= 14 ? 2407 + channel * 5 : 5000 + channel * 5,
    band,
    security,
    isConnected,
  };
}

function buildDemoChannels(networks: WifiNetwork[]): ChannelCongestion[] {
  const groups = new Map<string, WifiNetwork[]>();
  for (const network of networks) {
    const key = `${network.band}:${network.channel}`;
    groups.set(key, [...(groups.get(key) ?? []), network]);
  }

  return [...groups.entries()].map(([key, items]) => {
    const [band, channel] = key.split(":");
    return {
      band: band as Band,
      channel: Number(channel),
      networkCount: items.length,
      strongestSignalDbm: Math.max(...items.map((item) => item.signalDbm)),
      loadScore: clamp(items.reduce((sum, item) => sum + item.quality, 0), 8, 100),
    };
  });
}

function setText(id: string, value: string): void {
  mustGet<HTMLElement>(id).textContent = value;
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
