import { clamp } from "./format";
import type { Band, ChannelCongestion, ScanResult, WifiNetwork } from "./types";

export function demoScan(): ScanResult {
  const now = new Date().toISOString();
  const jitter = () => Math.round((Math.random() - 0.5) * 8);
  const networks: WifiNetwork[] = [
    makeDemo("Studio-5G", "8c:85:90:42:11:01", -49 + jitter(), 149, "WPA3", "5GHz"),
    makeDemo("Studio-IoT", "8c:85:90:42:11:02", -61 + jitter(), 6, "WPA2", "2.4GHz"),
    makeDemo("Neighbor-Living", "42:31:aa:09:c1:33", -72 + jitter(), 6, "WPA2", "2.4GHz"),
    makeDemo("CafeMesh", "00:25:9c:aa:78:2d", -67 + jitter(), 44, "WPA2", "5GHz"),
    makeDemo("Printer Setup", "c0:ff:ee:00:19:91", -82 + jitter(), 11, "Open", "2.4GHz"),
    makeDemo("Office-Guest", "28:ef:01:dd:22:91", -58 + jitter(), 36, "WPA2 Enterprise", "5GHz"),
  ]
    .map((network) => ({ ...network, isConnected: network.ssid === "Studio-5G" }))
    .sort((a, b) => b.signalDbm - a.signalDbm);

  const channels = buildDemoChannels(networks);

  return {
    scannedAt: now,
    source: "Browser demo data",
    networks,
    channels,
    recommendations: [
      {
        kind: "network",
        title: "推荐网络 Studio-5G",
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
    // demo 数据为静态样例，安全标记直接由样例文案得出；真实判定逻辑在后端。
    isOpen: security === "Open",
    isEnterprise: security.includes("Enterprise"),
    isConnected: false,
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
