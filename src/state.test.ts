import { describe, expect, it } from "vitest";
import { createInitialState, getDialogNetwork, getSelectedNetwork, HISTORY_LIMIT, ingestHistory } from "./state";
import type { ScanResult, WifiNetwork } from "./types";

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

function makeScan(networks: WifiNetwork[], scannedAt = "2026-06-11T08:00:00Z"): ScanResult {
  return {
    scannedAt,
    source: "test",
    networks,
    channels: [],
    recommendations: [],
  };
}

describe("createInitialState", () => {
  it("enables five-second auto scanning by default", () => {
    expect(createInitialState().autoScan).toBe(true);
  });
});

describe("ingestHistory", () => {
  it("appends one point per network per scan", () => {
    const state = createInitialState();
    const network = makeNetwork();

    ingestHistory(state, makeScan([network], "2026-06-11T08:00:00Z"));
    ingestHistory(state, makeScan([{ ...network, signalDbm: -52 }], "2026-06-11T08:00:05Z"));

    const points = state.history.get(network.bssid)!;
    expect(points).toHaveLength(2);
    expect(points[1].dbm).toBe(-52);
  });

  it("trims history to the limit", () => {
    const state = createInitialState();
    const network = makeNetwork();

    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      ingestHistory(state, makeScan([network]));
    }

    expect(state.history.get(network.bssid)).toHaveLength(HISTORY_LIMIT);
  });
});

describe("selectors", () => {
  it("falls back to the strongest network when selection is missing", () => {
    const state = createInitialState();
    const first = makeNetwork({ bssid: "aa:aa:aa:aa:aa:01" });
    const second = makeNetwork({ bssid: "aa:aa:aa:aa:aa:02" });
    state.scan = makeScan([first, second]);

    expect(getSelectedNetwork(state)).toBe(first);

    state.selectedBssid = second.bssid;
    expect(getSelectedNetwork(state)).toBe(second);

    state.selectedBssid = "ff:ff:ff:ff:ff:ff";
    expect(getSelectedNetwork(state)).toBe(first);
  });

  it("returns dialog network only on exact match", () => {
    const state = createInitialState();
    const network = makeNetwork();
    state.scan = makeScan([network]);

    expect(getDialogNetwork(state)).toBeUndefined();

    state.connectDialogBssid = network.bssid;
    expect(getDialogNetwork(state)).toBe(network);
  });
});
