import { describe, expect, it } from "vitest";
import {
  clamp,
  escapeHtml,
  formatSourceLabel,
  signalClass,
} from "./format";

describe("signalClass", () => {
  it("maps dBm to signal levels at boundaries", () => {
    expect(signalClass(-30)).toBe("excellent");
    expect(signalClass(-55)).toBe("excellent");
    expect(signalClass(-56)).toBe("good");
    expect(signalClass(-67)).toBe("good");
    expect(signalClass(-68)).toBe("fair");
    expect(signalClass(-79)).toBe("fair");
    expect(signalClass(-80)).toBe("poor");
  });
});

describe("formatSourceLabel", () => {
  it("maps known scan sources to friendly labels", () => {
    expect(formatSourceLabel("CoreWLAN")).toBe("macOS WiFi");
    expect(formatSourceLabel("system_profiler SPAirPortDataType")).toBe("系统 WiFi 信息");
    expect(formatSourceLabel("airport -s")).toBe("airport 扫描");
    expect(formatSourceLabel("netsh wlan show networks mode=bssid")).toBe("Windows WiFi");
  });

  it("passes through unknown sources", () => {
    expect(formatSourceLabel("Browser demo data")).toBe("浏览器演示数据");
  });
});

describe("clamp", () => {
  it("limits values to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("escapeHtml", () => {
  it("escapes html-sensitive characters", () => {
    expect(escapeHtml(`<b>"A&B"</b> 'x'`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt; &#39;x&#39;");
  });
});
