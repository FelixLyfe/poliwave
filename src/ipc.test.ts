import { describe, expect, it } from "vitest";
import { normalizeScanIssue } from "./ipc";

describe("normalizeScanIssue", () => {
  it("preserves a structured Tauri scan error", () => {
    expect(
      normalizeScanIssue({
        code: "locationPermissionDenied",
        title: "定位权限已被拒绝",
        message: "请前往设置授权。",
        recoveryAction: "openLocationSettings",
        details: "system detail",
      }),
    ).toEqual({
      code: "locationPermissionDenied",
      title: "定位权限已被拒绝",
      message: "请前往设置授权。",
      recoveryAction: "openLocationSettings",
      details: "system detail",
    });
  });

  it("accepts a JSON-serialized invoke error", () => {
    const issue = normalizeScanIssue(
      JSON.stringify({
        code: "wifiDisabled",
        title: "WiFi 已关闭",
        message: "请开启 WiFi。",
        recoveryAction: "openWifiSettings",
      }),
    );

    expect(issue.code).toBe("wifiDisabled");
    expect(issue.recoveryAction).toBe("openWifiSettings");
  });

  it("falls back to a retryable generic issue", () => {
    expect(normalizeScanIssue(new Error("native failure"))).toEqual({
      code: "scanFailed",
      title: "扫描失败",
      message: "系统没有返回可用的 WiFi 扫描结果，请稍后重试。",
      recoveryAction: "retry",
      details: "native failure",
    });
  });
});
