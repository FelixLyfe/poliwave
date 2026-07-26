import { fetchScan } from "./ipc";
import { mountShell, render, type RenderHandlers } from "./render";
import { createInitialState, ingestHistory } from "./state";
import "./styles.css";

const state = createInitialState();
let autoScanTimer: number | undefined;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

mountShell(app);

const handlers: RenderHandlers = {
  onSelectNetwork(bssid) {
    state.selectedBssid = bssid;
    rerender();
  },
};

const scanBtn = document.getElementById("scanBtn") as HTMLButtonElement;
const autoScanInput = document.getElementById("autoScan") as HTMLInputElement;

scanBtn.addEventListener("click", () => void runScan());
autoScanInput.addEventListener("change", () => {
  state.autoScan = autoScanInput.checked;
  setupAutoScan();
  rerender();
});
rerender();
void runScan();
setupAutoScan();

function rerender(): void {
  render(state, handlers);
}

async function runScan(): Promise<void> {
  if (state.busy) {
    return;
  }

  state.busy = true;
  state.lastError = undefined;
  rerender();

  try {
    const scan = await fetchScan();
    state.scan = scan;
    ingestHistory(state, scan);

    const current = scan.networks.find((network) => network.isConnected);
    const selectionStillExists = scan.networks.some((network) => network.bssid === state.selectedBssid);
    if ((!state.selectedBssid || !selectionStillExists) && scan.networks[0]) {
      state.selectedBssid = current?.bssid ?? scan.networks[0].bssid;
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    rerender();
  }
}

function setupAutoScan(): void {
  if (autoScanTimer !== undefined) {
    window.clearInterval(autoScanTimer);
  }
  autoScanTimer = state.autoScan ? window.setInterval(() => void runScan(), 5000) : undefined;
}
