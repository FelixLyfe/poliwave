import { createIcons, KeyRound, Radar, RadioTower, Sparkles, Wifi, X } from "lucide";
import { buildCurveSvg } from "./chart";
import {
  canConnectNetwork,
  clamp,
  connectHint,
  escapeAttr,
  escapeHtml,
  formatSourceLabel,
  formatTime,
  getBusiestChannelLabel,
  loadClass,
  signalClass,
} from "./format";
import { getDialogNetwork, getSelectedNetwork, type AppState } from "./state";
import type { Band, ChannelCongestion, Recommendation, WifiNetwork } from "./types";

export interface RenderHandlers {
  onSelectNetwork(bssid: string | undefined): void;
  onOpenConnectDialog(network: WifiNetwork): void;
  onCloseConnectDialog(): void;
  onSubmitConnect(network: WifiNetwork, username: string, password: string): void;
}

export function mountShell(root: HTMLElement): void {
  root.innerHTML = `
    <main class="shell">
      <section class="command-bar">
        <header class="topbar">
          <div class="app-lockup">
            <span class="app-icon" aria-hidden="true"><i data-lucide="wifi"></i></span>
            <div>
              <p class="kicker">Desktop WiFi Analyzer</p>
              <h1>WiFi 分析器</h1>
            </div>
          </div>
        </header>

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
          <button id="scanBtn" class="button primary" type="button">
            <i data-lucide="radar"></i>
            <span>扫描 WiFi</span>
          </button>
          <label class="toggle">
            <input id="autoScan" type="checkbox" />
            <span>每 5 秒刷新</span>
          </label>
        </div>
      </section>

      <section class="workspace">
        <aside class="panel network-panel">
          <div class="panel-head">
            <div>
              <p class="panel-label">按信号强度排序</p>
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
                <p class="panel-label">RSSI 历史</p>
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
                  <p class="panel-label">连接与信道</p>
                  <h2>建议</h2>
                </div>
                <i data-lucide="sparkles"></i>
              </div>
              <div id="recommendations" class="recommendations empty-state">等待扫描结果</div>
            </div>

            <div class="panel congestion-panel">
              <div class="panel-head">
                <div>
                  <p class="panel-label">信道负载</p>
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
    <div id="connectDialogRoot"></div>
  `;
}

export function render(state: AppState, handlers: RenderHandlers): void {
  const scanBtn = mustGet<HTMLButtonElement>("scanBtn");
  scanBtn.disabled = state.busy || state.connectingBssid !== undefined;
  scanBtn.classList.toggle("loading", state.busy);
  scanBtn.querySelector("span")!.textContent = state.busy ? "扫描中" : "扫描 WiFi";

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
  renderSelectedDetail(state, selected, handlers);
  renderConnectDialog(state, handlers);

  createIcons({ icons: { KeyRound, Radar, RadioTower, Sparkles, Wifi, X } });
}

function renderNetworks(state: AppState, networks: WifiNetwork[], handlers: RenderHandlers): void {
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

  list.querySelectorAll<HTMLButtonElement>(".network-row").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onSelectNetwork(button.dataset.bssid);
    });
  });
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

function renderSelectedDetail(state: AppState, network: WifiNetwork | undefined, handlers: RenderHandlers): void {
  const root = mustGet<HTMLDivElement>("selectedDetail");

  if (!network) {
    root.innerHTML = "";
    return;
  }

  const connecting = state.connectingBssid === network.bssid;
  const canConnect = canConnectNetwork(network);
  const statusClass = state.connectError ? "error" : state.connectMessage ? "success" : "";
  const statusText = state.connectError ?? state.connectMessage ?? "";

  root.innerHTML = `
    <div><span>SSID</span><strong>${escapeHtml(network.ssid)}</strong></div>
    <div><span>BSSID</span><strong>${escapeHtml(network.bssid)}</strong></div>
    <div><span>频段</span><strong>${network.band}</strong></div>
    <div><span>安全</span><strong>${escapeHtml(network.security)}</strong></div>
    <div><span>信号质量</span><strong>${network.quality}%</strong></div>
    <div><span>连接状态</span><strong>${network.isConnected ? "当前连接" : "未连接"}</strong></div>
    <div class="selected-action">
      <button id="connectNetworkBtn" class="button connect-button" type="button" ${connecting || !canConnect ? "disabled" : ""}>
        <i data-lucide="key-round"></i>
        <span>${connecting ? "连接中" : network.isConnected ? "重新连接" : "连接 WiFi"}</span>
      </button>
      <p class="connect-status ${statusClass}">${escapeHtml(statusText || connectHint(network))}</p>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#connectNetworkBtn")?.addEventListener("click", () => {
    handlers.onOpenConnectDialog(network);
  });
}

function renderConnectDialog(state: AppState, handlers: RenderHandlers): void {
  const root = mustGet<HTMLDivElement>("connectDialogRoot");
  const network = getDialogNetwork(state);

  if (!network) {
    root.innerHTML = "";
    return;
  }

  const connecting = state.connectingBssid === network.bssid;
  const passwordLabel = network.isOpen ? "开放网络无需密码" : network.isEnterprise ? "企业 WiFi 密码" : "WiFi 密码";
  const statusClass = state.connectError ? "error" : state.connectMessage ? "success" : "";
  const statusText = state.connectError ?? state.connectMessage ?? connectHint(network);

  root.innerHTML = `
    <div class="modal-backdrop" role="presentation" data-close-dialog="true">
      <section class="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connectDialogTitle">
        <header class="modal-head">
          <div>
            <p class="panel-label">连接网络</p>
            <h2 id="connectDialogTitle">${escapeHtml(network.ssid)}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" data-close-dialog="true">
            <i data-lucide="x"></i>
          </button>
        </header>
        <div class="modal-network-summary">
          <div><span>安全</span><strong>${escapeHtml(network.security)}</strong></div>
          <div><span>频段</span><strong>${network.band}</strong></div>
          <div><span>信号</span><strong>${network.signalDbm} dBm</strong></div>
        </div>
        <form id="connectForm" class="modal-form">
          ${
            network.isEnterprise
              ? `<label class="password-field">
                  <span>用户名</span>
                  <input id="wifiUsername" type="text" autocomplete="username" placeholder="输入企业账号" value="${escapeAttr(state.connectDraftUsername)}" />
                </label>`
              : ""
          }
          <label class="password-field">
            <span>密码</span>
            <input id="wifiPassword" type="password" autocomplete="current-password" placeholder="${passwordLabel}" value="${escapeAttr(state.connectDraftPassword)}" ${network.isOpen ? "disabled" : ""} />
          </label>
          <p class="connect-status ${statusClass}">${escapeHtml(statusText)}</p>
          <div class="modal-actions">
            <button class="button" type="button" data-close-dialog="true">取消</button>
            <button class="button primary connect-button" type="submit" ${connecting ? "disabled" : ""}>
              <i data-lucide="key-round"></i>
              <span>${connecting ? "连接中" : "连接"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.querySelectorAll<HTMLElement>("[data-close-dialog]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element instanceof HTMLButtonElement) {
        handlers.onCloseConnectDialog();
      }
    });
  });
  root.querySelector<HTMLInputElement>("#wifiUsername")?.focus();
  if (!network.isEnterprise && !network.isOpen) {
    root.querySelector<HTMLInputElement>("#wifiPassword")?.focus();
  }
  root.querySelector<HTMLFormElement>("#connectForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = root.querySelector<HTMLInputElement>("#wifiUsername")?.value ?? "";
    const password = root.querySelector<HTMLInputElement>("#wifiPassword")?.value ?? "";
    handlers.onSubmitConnect(network, username, password);
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
