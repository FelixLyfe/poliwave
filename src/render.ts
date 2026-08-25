import { CircleCheck, createIcons, Radar, ShieldAlert, Signal, Wifi, WifiOff } from "lucide";
import { buildCurveSvg } from "./chart";
import { buildConnectionStatus } from "./connection";
import {
  clamp,
  escapeAttr,
  escapeHtml,
  formatSourceLabel,
  formatTime,
  signalClass,
} from "./format";
import { getCurrentNetwork, getSelectedNetwork, type AppState } from "./state";
import type { Band, ChannelDistribution, WifiNetwork } from "./types";

export interface RenderHandlers {
  onSelectNetwork(bssid: string | undefined): void;
  onOpenWifiSettings(): void;
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
            <span>当前信号</span>
            <strong id="currentSignal">--</strong>
          </article>
          <article class="metric">
            <span>当前频段</span>
            <strong id="currentBand">--</strong>
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
            <div class="panel connection-panel">
              <div class="panel-head">
                <div>
                  <h2>连接状态</h2>
                </div>
                <i data-lucide="wifi"></i>
              </div>
              <div id="connectionStatus" class="connection-status-list empty-state">等待扫描结果</div>
            </div>

            <div class="panel distribution-panel">
              <div class="panel-head">
                <div>
                  <p class="panel-label">扫描数量，不代表实际信道负载</p>
                  <h2>周边网络分布</h2>
                </div>
                <span class="stamp">扫描估算</span>
              </div>
              <div id="channelDistribution" class="channel-chart empty-state">暂无分布数据</div>
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
  const current = getCurrentNetwork(state);

  setText("networkCount", scan ? String(scan.networks.length) : "0");
  setText("currentSignal", current ? `${current.signalDbm} dBm` : scan ? "未连接" : "--");
  setText("currentBand", current?.band ?? (scan ? "未连接" : "--"));
  const sourceLabel = scan ? formatSourceLabel(scan.source) : state.lastError ? "扫描失败" : "待扫描";
  setText("scanSource", sourceLabel);
  mustGet<HTMLElement>("scanSource").title = scan?.source ?? sourceLabel;
  setText("scanTime", scan ? formatTime(scan.scannedAt) : "--");

  renderNetworks(state, scan?.networks ?? [], handlers);
  renderConnectionStatus(state, current, handlers);
  renderChannelDistribution(state, scan?.channelDistribution ?? [], current);
  renderCurve(state, selected);
  renderSelectedDetail(selected);

  createIcons({ icons: { CircleCheck, Radar, ShieldAlert, Signal, Wifi, WifiOff } });
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
        <button class="network-row ${selected ? "selected" : ""} ${connected ? "connected" : ""}" type="button" role="option" data-bssid="${escapeAttr(network.bssid)}" aria-selected="${selected}" aria-label="查看 ${escapeAttr(network.ssid)} 的信号详情，信号 ${network.signalDbm} dBm" tabindex="${selected ? "0" : "-1"}">
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

function renderConnectionStatus(
  state: AppState,
  current: WifiNetwork | undefined,
  handlers: RenderHandlers,
): void {
  const root = mustGet<HTMLDivElement>("connectionStatus");

  if (!state.scan) {
    root.className = "connection-status-list empty-state";
    root.textContent = state.busy ? "正在读取当前连接" : "等待扫描结果";
    return;
  }

  const items = buildConnectionStatus(current);
  root.className = "connection-status-list";
  root.innerHTML = `${items
    .map(
      (item) => `
        <article class="connection-status-item ${item.tone}">
          <i data-lucide="${item.icon}"></i>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail)}</p>
            ${
              item.canOpenWifiSettings
                ? '<button class="status-action" type="button" data-action="open-wifi-settings">打开 WiFi 设置</button>'
                : ""
            }
          </div>
        </article>
      `,
    )
    .join("")}${
      state.settingsError
        ? `<p class="status-error" role="alert">${escapeHtml(state.settingsError)}</p>`
        : ""
    }`;

  root.querySelector<HTMLButtonElement>('[data-action="open-wifi-settings"]')?.addEventListener("click", () => {
    handlers.onOpenWifiSettings();
  });
}

function renderChannelDistribution(
  state: AppState,
  distribution: ChannelDistribution[],
  current: WifiNetwork | undefined,
): void {
  const root = mustGet<HTMLDivElement>("channelDistribution");

  if (!distribution.length) {
    root.className = "channel-chart empty-state";
    root.textContent = state.busy ? "正在整理周边网络" : "暂无分布数据";
    return;
  }

  const bands: Band[] = ["2.4GHz", "5GHz", "6GHz"];
  const maxCount = Math.max(...distribution.map((item) => item.networkCount), 1);
  root.className = "channel-chart";
  root.innerHTML = bands
    .map((band) => {
      const items = distribution
        .filter((item) => item.band === band)
        .sort((a, b) => a.channel - b.channel);
      if (!items.length) {
        return "";
      }

      return `
        <div class="band-row">
          <div class="band-label">${band}</div>
          <div class="channel-bars">
            ${items
              .map((item) => {
                const isCurrent = current?.band === item.band && current.channel === item.channel;
                const height = Math.max(18, Math.round((item.networkCount / maxCount) * 100));
                return `
                  <div class="channel-item ${isCurrent ? "current" : ""}" title="CH ${item.channel}，本次扫描到 ${item.networkCount} 个 WiFi" aria-label="信道 ${item.channel}，本次扫描到 ${item.networkCount} 个 WiFi${isCurrent ? "，当前连接所在信道" : ""}">
                    <div class="channel-value">
                      <b>${item.networkCount}</b>
                      <div class="bar" style="height:${height}%"></div>
                    </div>
                    <span>${item.channel}</span>
                  </div>
                `;
              })
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
    <div><span>系统状态</span><strong>${network.isConnected ? "当前使用" : "周边网络"}</strong></div>
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
