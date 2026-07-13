import { describe, expect, it } from "vitest";
import { syncAutoScanInput } from "./render";

describe("syncAutoScanInput", () => {
  it("reflects the auto-scan state in the checkbox", () => {
    const input = { checked: false };

    syncAutoScanInput(input, true);
    expect(input.checked).toBe(true);

    syncAutoScanInput(input, false);
    expect(input.checked).toBe(false);
  });
});
