import type { WifiNetwork } from "./types";

export type ConnectionStatusTone = "positive" | "notice" | "warning";

export interface ConnectionStatusItem {
  tone: ConnectionStatusTone;
  icon: "circle-check" | "shield-alert" | "signal" | "wifi-off";
  title: string;
  detail: string;
  canOpenWifiSettings?: boolean;
}

export function buildConnectionStatus(network?: WifiNetwork): ConnectionStatusItem[] {
  if (!network) {
    return [
      {
        tone: "notice",
        icon: "wifi-off",
        title: "尚未连接 WiFi",
        detail: "请在系统 WiFi 设置中连接一个可信网络。",
        canOpenWifiSettings: true,
      },
    ];
  }

  const items: ConnectionStatusItem[] = [];

  if (hasSecurityRisk(network)) {
    items.push({
      tone: "warning",
      icon: "shield-alert",
      title: "当前网络安全性较低",
      detail: "建议在系统 WiFi 设置中切换到受密码保护的可信网络。",
      canOpenWifiSettings: true,
    });
  }

  if (network.signalDbm >= -55) {
    items.push({
      tone: "positive",
      icon: "circle-check",
      title: "信号很强",
      detail: "当前无线信号充足，无需调整位置。",
    });
  } else if (network.signalDbm >= -67) {
    items.push({
      tone: "positive",
      icon: "circle-check",
      title: "信号良好",
      detail: "当前无线信号足够日常使用，无需调整位置。",
    });
  } else if (network.signalDbm >= -79) {
    items.push({
      tone: "notice",
      icon: "signal",
      title: "信号一般",
      detail: "若连接不稳定，可尝试靠近路由器或减少墙体、金属物体遮挡。",
    });
  } else {
    items.push({
      tone: "warning",
      icon: "signal",
      title: "信号较弱",
      detail: "建议靠近路由器，并减少墙体或金属物体遮挡。",
    });
  }

  return items.slice(0, 2);
}

function hasSecurityRisk(network: WifiNetwork): boolean {
  return network.isOpen || network.security.toLowerCase().includes("wep");
}
