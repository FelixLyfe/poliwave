import { invoke } from "@tauri-apps/api/core";
import { demoDiagnostics, demoScan } from "./demo";
import type {
  ConnectionDiagnosticReport,
  ScanIssue,
  ScanIssueCode,
  ScanRecoveryAction,
  ScanResult,
} from "./types";

const SCAN_ISSUE_CODES: ScanIssueCode[] = [
  "locationPermissionRequired",
  "locationPermissionDenied",
  "locationServicesDisabled",
  "wifiDisabled",
  "adapterUnavailable",
  "unsupportedPlatform",
  "scanFailed",
];
const RECOVERY_ACTIONS: ScanRecoveryAction[] = [
  "requestLocationPermission",
  "openLocationSettings",
  "openWifiSettings",
  "retry",
];

export class WifiScanError extends Error {
  constructor(readonly issue: ScanIssue) {
    super(issue.message);
    this.name = "WifiScanError";
  }
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function fetchScan(): Promise<ScanResult> {
  if (isTauriRuntime()) {
    try {
      return await invoke<ScanResult>("scan_wifi");
    } catch (error) {
      throw new WifiScanError(normalizeScanIssue(error));
    }
  }

  await delay(360);
  return demoScan();
}

export async function diagnoseConnection(): Promise<ConnectionDiagnosticReport> {
  if (!isTauriRuntime()) {
    await delay(680);
    return demoDiagnostics();
  }

  return invoke<ConnectionDiagnosticReport>("diagnose_connection");
}

export async function openWifiSettings(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("请在系统 WiFi 设置中完成操作。");
  }

  await invoke("open_wifi_settings");
}

export async function openLocationSettings(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("请在系统隐私设置中允许定位访问。");
  }

  await invoke("open_location_settings");
}

export async function requestLocationPermission(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("请在系统隐私设置中允许定位访问。");
  }

  await invoke("request_location_permission");
}

export function normalizeScanIssue(error: unknown): ScanIssue {
  const value = parsePossibleJson(error);
  if (isRecord(value) && isScanIssueCode(value.code)) {
    const code = value.code;
    const title = typeof value.title === "string" ? value.title : "扫描失败";
    const message =
      typeof value.message === "string" ? value.message : "系统没有返回可用的 WiFi 扫描结果。";
    const recoveryAction = isRecoveryAction(value.recoveryAction)
      ? value.recoveryAction
      : code === "unsupportedPlatform"
        ? undefined
        : "retry";

    return {
      code,
      title,
      message,
      recoveryAction,
      details: typeof value.details === "string" ? value.details : undefined,
    };
  }

  const details = error instanceof Error ? error.message : String(error);
  return {
    code: "scanFailed",
    title: "扫描失败",
    message: "系统没有返回可用的 WiFi 扫描结果，请稍后重试。",
    recoveryAction: "retry",
    details,
  };
}

function parsePossibleJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScanIssueCode(value: unknown): value is ScanIssueCode {
  return typeof value === "string" && SCAN_ISSUE_CODES.includes(value as ScanIssueCode);
}

function isRecoveryAction(value: unknown): value is ScanRecoveryAction {
  return typeof value === "string" && RECOVERY_ACTIONS.includes(value as ScanRecoveryAction);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
