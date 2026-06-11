import type { ChannelCongestion, WifiNetwork } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(value: string): string {
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

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

export function signalClass(dbm: number): string {
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

export function loadClass(load: number): string {
  if (load >= 72) {
    return "high";
  }
  if (load >= 42) {
    return "mid";
  }
  return "low";
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatSourceLabel(source: string): string {
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

export function getBusiestChannelLabel(channels: ChannelCongestion[]): string {
  const busiest = channels.reduce<ChannelCongestion | undefined>(
    (current, item) => (!current || item.loadScore > current.loadScore ? item : current),
    undefined,
  );
  return busiest ? `${busiest.band} CH ${busiest.channel}` : "--";
}

export function isHiddenNetwork(network: WifiNetwork): boolean {
  return network.ssid === "<hidden>";
}

export function canConnectNetwork(network: WifiNetwork): boolean {
  return !network.isConnected && !isHiddenNetwork(network) && !network.isEnterprise;
}

export function connectHint(network: WifiNetwork): string {
  if (network.isConnected) {
    return "当前已连接";
  }
  if (isHiddenNetwork(network)) {
    return "隐藏网络请在系统 WiFi 设置中连接";
  }
  if (network.isEnterprise) {
    return "企业认证 WiFi 请在系统 WiFi 设置中连接";
  }
  if (network.isOpen) {
    return "开放网络可直接连接";
  }
  return "连接会调用系统 WiFi 命令";
}
