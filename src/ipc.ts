import { invoke } from "@tauri-apps/api/core";
import { demoScan } from "./demo";
import type { ScanResult } from "./types";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function fetchScan(): Promise<ScanResult> {
  if (isTauriRuntime()) {
    return invoke<ScanResult>("scan_wifi");
  }

  await delay(360);
  return demoScan();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
