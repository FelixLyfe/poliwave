import { describe, expect, it } from "vitest";
import {
  canConnectNetwork,
  clamp,
  connectHint,
  escapeHtml,
  formatSourceLabel,
  getBusiestChannelLabel,
  isHiddenNetwork,
  loadClass,
  signalClass,
} from "./format";
import type { ChannelCongestion, WifiNetwork } from "./types";

function makeNetwork(overrides: Partial<WifiNetwork> = {}): WifiNetwork {
  return {
    ssid: "Studio-5G",
    bssid: "8c:85:90:42:11:01",
    signalDbm: -50,
    quality: 100,
    channel: 149,
    frequencyMhz: 5745,
    band: "5GHz",
    security: "WPA2",
    isOpen: false,
    isEnterprise: false,
    isConnected: false,
    ...overrides,
  };
}

describe("signalClass", () => {
  it("maps dBm to signal levels at boundaries", () => {
    expect(signalClass(-30)).toBe("excellent");
    expect(signalClass(-55)).toBe("excellent");
    expect(signalClass(-56)).toBe("good");
    expect(signalClass(-68)).toBe("good");
    expect(signalClass(-69)).toBe("fair");
    expect(signalClass(-80)).toBe("fair");
    expect(signalClass(-81)).toBe("poor");
  });
});

describe("loadClass", () => {
  it("maps load score to levels at boundaries", () => {
    expect(loadClass(100)).toBe("high");
    expect(loadClass(72)).toBe("high");
    expect(loadClass(71)).toBe("mid");
    expect(loadClass(42)).toBe("mid");
    expect(loadClass(41)).toBe("low");
    expect(loadClass(0)).toBe("low");
  });
});

describe("formatSourceLabel", () => {
  it("maps known scan sources to friendly labels", () => {
    expect(formatSourceLabel("CoreWLAN")).toBe("macOS WiFi");
    expect(formatSourceLabel("system_profiler SPAirPortDataType")).toBe("系统 WiFi 信息");
    expect(formatSourceLabel("airport -s")).toBe("airport 扫描");
    expect(formatSourceLabel("netsh wlan show networks mode=bssid")).toBe("Windows WiFi");
    expect(formatSourceLabel("nmcli dev wifi list")).toBe("Linux WiFi");
    expect(formatSourceLabel("iw dev scan")).toBe("iw 扫描");
  });

  it("passes through unknown sources", () => {
    expect(formatSourceLabel("Browser demo data")).toBe("浏览器演示数据");
  });
});

describe("getBusiestChannelLabel", () => {
  it("returns the channel with the highest load", () => {
    const channels: ChannelCongestion[] = [
      { band: "2.4GHz", channel: 6, networkCount: 3, strongestSignalDbm: -50, loadScore: 80 },
      { band: "5GHz", channel: 149, networkCount: 1, strongestSignalDbm: -49, loadScore: 30 },
    ];
    expect(getBusiestChannelLabel(channels)).toBe("2.4GHz CH 6");
  });

  it("returns placeholder when empty", () => {
    expect(getBusiestChannelLabel([])).toBe("--");
  });
});

describe("clamp", () => {
  it("limits values to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("escapeHtml", () => {
  it("escapes html-sensitive characters", () => {
    expect(escapeHtml(`<b>"A&B"</b> 'x'`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt; &#39;x&#39;");
  });
});

describe("network connectability", () => {
  it("detects hidden networks", () => {
    expect(isHiddenNetwork(makeNetwork({ ssid: "<hidden>" }))).toBe(true);
    expect(isHiddenNetwork(makeNetwork())).toBe(false);
  });

  it("blocks hidden and enterprise networks from in-app connect", () => {
    expect(canConnectNetwork(makeNetwork())).toBe(true);
    expect(canConnectNetwork(makeNetwork({ isConnected: true }))).toBe(false);
    expect(canConnectNetwork(makeNetwork({ ssid: "<hidden>" }))).toBe(false);
    expect(canConnectNetwork(makeNetwork({ isEnterprise: true }))).toBe(false);
    expect(canConnectNetwork(makeNetwork({ isOpen: true }))).toBe(true);
  });

  it("builds connect hints from backend flags", () => {
    expect(connectHint(makeNetwork({ isConnected: true }))).toContain("当前已连接");
    expect(connectHint(makeNetwork({ ssid: "<hidden>" }))).toContain("隐藏网络");
    expect(connectHint(makeNetwork({ isEnterprise: true }))).toContain("企业认证");
    expect(connectHint(makeNetwork({ isOpen: true }))).toContain("开放网络");
    expect(connectHint(makeNetwork())).toContain("系统 WiFi 命令");
  });
});
