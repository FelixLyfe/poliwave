import { invoke } from "@tauri-apps/api/core";
import { demoScan } from "./demo";
import type { ConnectResult, ScanResult, WifiNetwork } from "./types";

let demoConnectedSsid = "Studio-5G";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function fetchScan(): Promise<ScanResult> {
  if (isTauriRuntime()) {
    return invoke<ScanResult>("scan_wifi");
  }

  await delay(360);
  return demoScan(demoConnectedSsid);
}

export async function requestConnect(
  network: WifiNetwork,
  username: string,
  password: string,
): Promise<ConnectResult> {
  if (isTauriRuntime()) {
    return invoke<ConnectResult>("connect_wifi", {
      ssid: network.ssid,
      username: username || null,
      password: password || null,
      security: network.security,
    });
  }

  await delay(520);
  demoConnectedSsid = network.ssid;
  return {
    ssid: network.ssid,
    message: `已连接 ${network.ssid}`,
    confirmed: true,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
