import { describe, expect, it } from "vitest";
import { buildConnectionStatus } from "./connection";
import type { WifiNetwork } from "./types";

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
    isConnected: true,
    ...overrides,
  };
}

describe("buildConnectionStatus", () => {
  it("offers system settings when WiFi is disconnected", () => {
    expect(buildConnectionStatus()).toEqual([
      expect.objectContaining({ title: "尚未连接 WiFi", canOpenWifiSettings: true }),
    ]);
  });

  it("uses the agreed RSSI boundaries", () => {
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -55 }))[0].title).toBe("信号很强");
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -56 }))[0].title).toBe("信号良好");
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -67 }))[0].title).toBe("信号良好");
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -68 }))[0].title).toBe("信号一般");
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -79 }))[0].title).toBe("信号一般");
    expect(buildConnectionStatus(makeNetwork({ signalDbm: -80 }))[0].title).toBe("信号较弱");
  });

  it("prioritizes security risk and limits the result to two items", () => {
    const items = buildConnectionStatus(
      makeNetwork({ signalDbm: -80, security: "Open", isOpen: true }),
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({ title: "当前网络安全性较低", canOpenWifiSettings: true }),
    );
    expect(items[1].title).toBe("信号较弱");
  });

  it("treats WEP as a security risk", () => {
    expect(buildConnectionStatus(makeNetwork({ security: "WEP" }))[0].title).toBe(
      "当前网络安全性较低",
    );
  });
});
