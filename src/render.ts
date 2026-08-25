import { createIcons, Radar, RadioTower, Sparkles, Wifi } from "lucide";
import { buildCurveSvg } from "./chart";
import {
  clamp,
  escapeAttr,
  escapeHtml,
  formatSourceLabel,
  formatTime,
  getBusiestChannelLabel,
  loadClass,
  signalClass,
} from "./format";
import { getSelectedNetwork, type AppState } from "./state";
import type { Band, ChannelCongestion, Recommendation, WifiNetwork } from "./types";

export interface RenderHandlers {
  onSelectNetwork(bssid: string | undefined): void;
}

export function mountShell(root: HTMLElement): void {
  root.innerHTML = `
    <main class="shell">
      <header class="command-bar">
        <div class="app-lockup">
          <span class="app-icon" aria-hidden="true"><img src="/icon.png" alt="" /></span>
          <div class="app-title">
            <h1>Poliwave</h1>
            <p id="scanActivity" class="scan-activity" role="status" aria-live="polite">
              <span class="activity-dot" aria-hidden="true"></span>
              <span>准备扫描</span>
            </p>
          </div>
        </div>

        <section class="status-grid" aria-label="扫描摘要">
          <article class="metric metric-strong">
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
          <button id="scanBtn" class="button primary" type="button" aria-label="立即刷新 WiFi 扫描结果">
            <i data-lucide="radar"></i>
            <span>立即刷新</span>
          </button>
          <label class="toggle">
            <input id="autoScan" type="checkbox" role="switch" />
            <span class="toggle-track" aria-hidden="true"><span></span></span>
            <span class="toggle-label">每 5 秒</span>
          </label>
        </div>
      </header>

      <section class="workspace">
        <aside class="panel network-panel">
          <div class="panel-head">
            <div>
              <p class="panel-label">按信号强度排序</p>
              <h2>周围 WiFi</h2>
            </div>
            <span id="scanTime" class="stamp">--</span>
          </div>
          <div id="networkList" class="network-list empty-state" role="listbox" aria-label="周围 WiFi">点击扫描开始分析</div>
        </aside>

        <section class="analysis">
          <section class="panel curve-panel">
            <div class="panel-head">
              <div>
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
                  <h2>建议</h2>
                </div>
                <i data-lucide="sparkles"></i>
              </div>
              <div id="recommendations" class="recommendations empty-state">等待扫描结果</div>
            </div>

            <div class="panel congestion-panel">
              <div class="panel-head">
                <div>
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
}

export function render(state: AppState, handlers: RenderHandlers): void {
  syncAutoScanInput(mustGet<HTMLInputElement>("autoScan"), state.autoScan);

  const scanBtn = mustGet<HTMLButtonElement>("scanBtn");
  scanBtn.disabled = state.busy;
  scanBtn.setAttribute("aria-busy", String(state.busy));
  scanBtn.classList.toggle("loading", state.busy);
  scanBtn.querySelector("span")!.textContent = state.busy ? "扫描中" : "立即刷新";

  const scanActivity = mustGet<HTMLElement>("scanActivity");
  scanActivity.className = `scan-activity ${state.busy ? "scanning" : state.lastError ? "error" : state.autoScan ? "active" : "paused"}`;
  scanActivity.querySelector("span:last-child")!.textContent = state.busy
    ? "正在扫描周围网络"
    : state.lastError
      ? "上次扫描失败"
      : state.autoScan
        ? "自动刷新已开启"
        : "自动刷新已暂停";

  const scan = state.scan;
  const selected = getSelectedNetwork(state);

  setText("networkCount", scan ? String(scan.networks.length) : "0");
  setText("bestSignal", scan?.networks[0] ? `${scan.networks[0].signalDbm} dBm` : "--");
  setText("busyChannel", scan ? getBusiestChannelLabel(scan.channels) : "--");
  const sourceLabel = scan ? formatSourceLabel(scan.source) : state.lastError ? "扫描失败" : "待扫描";
  setText("scanSource", sourceLabel);
  mustGet<HTMLElement>("scanSource").title = scan?.source ?? sourceLabel;
  setText("scanTime", scan ? formatTime(scan.scannedAt) : "--");

  renderNetworks(state, scan?.networks ?? [], handlers);
  renderRecommendations(state, scan?.recommendations ?? []);
  renderChannels(state, scan?.channels ?? []);
  renderCurve(state, selected);
  renderSelectedDetail(selected);

  createIcons({ icons: { Radar, RadioTower, Sparkles, Wifi } });
}

export function syncAutoScanInput(input: Pick<HTMLInputElement, "checked">, autoScan: boolean): void {
  input.checked = autoScan;
}

function renderNetworks(state: AppState, networks: WifiNetwork[], handlers: RenderHandlers): void {
  const list = mustGet<HTMLDivElement>("networkList");
  const activeElement = document.activeElement;
  const focusedBssid =
    activeElement instanceof HTMLButtonElement && activeElement.classList.contains("network-row")
      ? activeElement.dataset.bssid
      : undefined;

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
        <button class="network-row ${selected ? "selected" : ""} ${connected ? "connected" : ""}" type="button" role="option" data-bssid="${escapeAttr(network.bssid)}" aria-selected="${selected}" aria-label="选择 ${escapeAttr(network.ssid)}，信号 ${network.signalDbm} dBm" tabindex="${selected ? "0" : "-1"}">
          <span class="signal-mark ${signalClass(network.signalDbm)}"></span>
          <span class="network-main">
            <span class="network-title">
              <strong>${escapeHtml(network.ssid)}</strong>
              ${connected ? '<span class="connected-badge">当前网络</span>' : ""}
            </span>
            <small>${escapeHtml(network.bssid)} | CH ${network.channel || "--"} | ${network.frequencyMhz || "--"} MHz</small>
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

  const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(".network-row"));
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      handlers.onSelectNetwork(button.dataset.bssid);
    });
    button.addEventListener("keydown", (event) => {
      const targetIndex = getKeyboardTargetIndex(event.key, index, buttons.length);
      if (targetIndex === undefined) {
        return;
      }

      event.preventDefault();
      const target = buttons[targetIndex];
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
      handlers.onSelectNetwork(target.dataset.bssid);
    });
  });

  if (focusedBssid) {
    buttons.find((button) => button.dataset.bssid === focusedBssid)?.focus({ preventScroll: true });
  }
}

function renderRecommendations(state: AppState, recommendations: Recommendation[]): void {
  const root = mustGet<HTMLDivElement>("recommendations");

  if (!recommendations.length) {
    root.className = "recommendations empty-state";
    root.textContent = state.busy ? "正在生成建议" : "等待扫描结果";
    return;
  }

  root.className = "recommendations";
  root.innerHTML = recommendations
    .map((item) => {
      const icon = item.kind === "network" ? "wifi" : "radio-tower";
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

function renderChannels(state: AppState, channels: ChannelCongestion[]): void {
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

function renderCurve(state: AppState, network?: WifiNetwork): void {
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
  curveMeta.textContent = `${network.band} | CH ${network.channel || "--"}`;
  root.className = "curve";
  root.innerHTML = buildCurveSvg(points);
}

function renderSelectedDetail(network: WifiNetwork | undefined): void {
  const root = mustGet<HTMLDivElement>("selectedDetail");
  const previousBssid = root.dataset.bssid;

  if (!network) {
    root.innerHTML = "";
    delete root.dataset.bssid;
    return;
  }

  root.innerHTML = `
    <div><span>SSID</span><strong>${escapeHtml(network.ssid)}</strong></div>
    <div><span>BSSID</span><strong>${escapeHtml(network.bssid)}</strong></div>
    <div><span>频段</span><strong>${network.band}</strong></div>
    <div><span>安全</span><strong>${escapeHtml(network.security)}</strong></div>
    <div><span>信号质量</span><strong>${network.quality}%</strong></div>
    <div><span>系统状态</span><strong>${network.isConnected ? "当前使用" : "未使用"}</strong></div>
  `;
  root.dataset.bssid = network.bssid;

  if (previousBssid && previousBssid !== network.bssid && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.getAnimations().forEach((animation) => animation.cancel());
    root.animate(
      [
        { opacity: 0.68, transform: "translateX(6px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }
}

export function getKeyboardTargetIndex(key: string, currentIndex: number, itemCount: number): number | undefined {
  if (key === "ArrowDown") {
    return Math.min(currentIndex + 1, itemCount - 1);
  }
  if (key === "ArrowUp") {
    return Math.max(currentIndex - 1, 0);
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return itemCount - 1;
  }
  return undefined;
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
