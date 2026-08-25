import type { HistoryPoint, ScanResult, WifiNetwork } from "./types";

export const HISTORY_LIMIT = 36;

export interface AppState {
  scan?: ScanResult;
  selectedBssid?: string;
  history: Map<string, HistoryPoint[]>;
  autoScan: boolean;
  busy: boolean;
  lastError?: string;
  settingsError?: string;
}

export function createInitialState(): AppState {
  return {
    history: new Map(),
    autoScan: true,
    busy: false,
  };
}

export function ingestHistory(state: AppState, scan: ScanResult): void {
  const now = Date.parse(scan.scannedAt);

  for (const network of scan.networks) {
    const points = state.history.get(network.bssid) ?? [];
    points.push({ time: now, dbm: network.signalDbm });
    state.history.set(network.bssid, points.slice(-HISTORY_LIMIT));
  }
}

export function getSelectedNetwork(state: AppState): WifiNetwork | undefined {
  const networks = state.scan?.networks ?? [];
  return networks.find((network) => network.bssid === state.selectedBssid) ?? networks[0];
}

export function getCurrentNetwork(state: AppState): WifiNetwork | undefined {
  return state.scan?.networks.find((network) => network.isConnected);
}
