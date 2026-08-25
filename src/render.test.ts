import { describe, expect, it } from "vitest";
import {
  getKeyboardTargetIndex,
  recoveryActionLabel,
  recoverySteps,
  syncAutoScanInput,
} from "./render";

describe("syncAutoScanInput", () => {
  it("reflects the auto-scan state in the checkbox", () => {
    const input = { checked: false };

    syncAutoScanInput(input, true);
    expect(input.checked).toBe(true);

    syncAutoScanInput(input, false);
    expect(input.checked).toBe(false);
  });
});

describe("getKeyboardTargetIndex", () => {
  it("moves within list boundaries", () => {
    expect(getKeyboardTargetIndex("ArrowDown", 1, 4)).toBe(2);
    expect(getKeyboardTargetIndex("ArrowDown", 3, 4)).toBe(3);
    expect(getKeyboardTargetIndex("ArrowUp", 2, 4)).toBe(1);
    expect(getKeyboardTargetIndex("ArrowUp", 0, 4)).toBe(0);
  });

  it("supports list start and end shortcuts", () => {
    expect(getKeyboardTargetIndex("Home", 2, 4)).toBe(0);
    expect(getKeyboardTargetIndex("End", 1, 4)).toBe(3);
    expect(getKeyboardTargetIndex("Enter", 1, 4)).toBeUndefined();
  });
});

describe("recovery guide", () => {
  it("provides an actionable location-permission flow", () => {
    expect(recoverySteps("locationPermissionDenied")).toEqual([
      "打开系统定位设置。",
      "允许 Poliwave 使用定位服务。",
      "返回 Poliwave 后重新扫描。",
    ]);
    expect(recoveryActionLabel("openLocationSettings")).toBe("打开定位设置");
  });

  it("keeps generic scan recovery concise", () => {
    expect(recoverySteps("scanFailed")).toHaveLength(3);
    expect(recoveryActionLabel("retry")).toBe("重新扫描");
  });
});
