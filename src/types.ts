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

export interface ChannelDistribution {
  band: Band;
  channel: number;
  networkCount: number;
}

export interface ScanResult {
  scannedAt: string;
  source: string;
  networks: WifiNetwork[];
  channelDistribution: ChannelDistribution[];
}

export interface HistoryPoint {
  time: number;
  dbm: number;
}
