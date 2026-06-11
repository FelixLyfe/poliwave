export type Band = "2.4GHz" | "5GHz" | "6GHz" | "Unknown";

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  signalDbm: number;
  quality: number;
  channel: number;
  frequencyMhz: number;
  band: Band;
  security: string;
  isOpen: boolean;
  isEnterprise: boolean;
  isConnected: boolean;
}

export interface ChannelCongestion {
  band: Band;
  channel: number;
  networkCount: number;
  strongestSignalDbm: number;
  loadScore: number;
}

export interface Recommendation {
  kind: "connect" | "channel" | string;
  title: string;
  detail: string;
  targetSsid?: string | null;
  channel?: number | null;
  score: number;
}

export interface ScanResult {
  scannedAt: string;
  source: string;
  networks: WifiNetwork[];
  channels: ChannelCongestion[];
  recommendations: Recommendation[];
}

export interface ConnectResult {
  ssid: string;
  message: string;
  confirmed: boolean;
}

export interface HistoryPoint {
  time: number;
  dbm: number;
}
