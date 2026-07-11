import { canConnectNetwork, connectHint } from "./format";
import { fetchScan, requestConnect } from "./ipc";
import { mountShell, render, type RenderHandlers } from "./render";
import { createInitialState, ingestHistory } from "./state";
import type { WifiNetwork } from "./types";
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
    state.connectError = undefined;
    state.connectMessage = undefined;
    state.connectDialogBssid = undefined;
    state.connectDraftPassword = "";
    state.connectDraftUsername = "";
    rerender();
  },
  onOpenConnectDialog(network) {
    openConnectDialog(network);
  },
  onCloseConnectDialog() {
    closeConnectDialog();
  },
  onSubmitConnect(network, username, password) {
    void connectSelectedNetwork(network, username, password);
  },
};

const scanBtn = document.getElementById("scanBtn") as HTMLButtonElement;
const autoScanInput = document.getElementById("autoScan") as HTMLInputElement;

scanBtn.addEventListener("click", () => void runScan());
autoScanInput.addEventListener("change", () => {
  state.autoScan = autoScanInput.checked;
  setupAutoScan();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.connectDialogBssid) {
    closeConnectDialog();
  }
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

function openConnectDialog(network: WifiNetwork): void {
  if (!canConnectNetwork(network)) {
    state.connectError = connectHint(network);
    state.connectMessage = undefined;
    rerender();
    return;
  }

  state.connectDialogBssid = network.bssid;
  state.connectDraftPassword = "";
  state.connectDraftUsername = "";
  state.connectError = undefined;
  state.connectMessage = undefined;
  rerender();
}

function closeConnectDialog(): void {
  state.connectDialogBssid = undefined;
  state.connectDraftPassword = "";
  state.connectDraftUsername = "";
  state.connectError = undefined;
  rerender();
}

async function connectSelectedNetwork(network: WifiNetwork, username: string, password: string): Promise<void> {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  state.connectDraftPassword = password;
  state.connectDraftUsername = username;
  if (network.isEnterprise && !trimmedUsername) {
    state.connectError = "请输入企业 WiFi 用户名";
    state.connectMessage = undefined;
    rerender();
    return;
  }
  if (!network.isOpen && !trimmedPassword) {
    state.connectError = "请输入 WiFi 密码";
    state.connectMessage = undefined;
    rerender();
    return;
  }

  state.connectingBssid = network.bssid;
  state.connectError = undefined;
  state.connectMessage = undefined;
  rerender();

  try {
    const result = await requestConnect(network, trimmedUsername, trimmedPassword);
    if (result.confirmed) {
      state.connectMessage = result.message;
      await runScan();
      state.connectDialogBssid = undefined;
      state.connectDraftPassword = "";
      state.connectDraftUsername = "";
    } else {
      // 系统接受了连接请求但轮询超时未确认，保留对话框让用户检查密码。
      state.connectError = result.message;
      await runScan();
    }
  } catch (error) {
    state.connectError = error instanceof Error ? error.message : String(error);
  } finally {
    state.connectingBssid = undefined;
    rerender();
  }
}
