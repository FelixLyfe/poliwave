# Poliwave

[English](./README.md) | 简体中文

Poliwave 是一款基于 Tauri + Rust 的桌面端 WiFi 信号分析器 MVP。

![Poliwave 桌面端界面](./poliwave-desktop.png)

## 功能特性

- 通过 Rust 后端扫描附近的 WiFi 网络。
- 按 RSSI 信号强度对网络进行排序。
- 根据信道或频率识别 2.4GHz、5GHz 和 6GHz 频段。
- 按信道展示本次扫描到的周边 WiFi 数量，不将其解释为实际信道负载。
- 在前端记录 RSSI 历史，并为选中的 BSSID 绘制信号曲线。
- 根据当前连接的信号强度和安全类型显示连接状态，需要时可打开系统 WiFi 设置。
- 一键检查 WiFi、默认网关、DNS 和互联网连接，并在可用时显示延迟与丢包率。
- 区分定位权限、WiFi 开关、无线网卡和普通扫描错误，提供对应的系统设置入口与恢复步骤。

## 运行时扫描来源

Poliwave 当前支持 macOS 和 Windows：

- macOS：使用 CoreWLAN，并请求定位服务权限以读取真实 SSID；旧版系统命令仅作为兼容回退
- Windows：`netsh wlan show networks mode=bssid`

在开发过程中如果用普通浏览器打开，应用会使用演示数据，以便在没有 Tauri 的情况下测试界面。

## 诊断与隐私

附近 WiFi 的扫描结果只保存在本机内存中，不会上传。只有在用户主动点击“一键诊断”时，Poliwave 才会进行标准 DNS、ICMP 和 TCP 连通性探测；当前检测目标为 `example.com`、`1.1.1.1` 和 `223.5.5.5`。探测不会上传扫描结果或用户内容，ICMP 不可用时会回退到 TCP 可达性检查。

## 本地构建

### 前置依赖

- Node.js 20+ 和 npm
- Rust stable 工具链和 Cargo
- macOS Tauri 依赖：Xcode Command Line Tools

在 macOS 上安装 Rust：

```bash
brew install rustup
brew link --force rustup
rustup toolchain install stable
rustup default stable
```

安装前端依赖：

```bash
npm install
```

### 开发

浏览器 UI 开发，会使用演示 WiFi 数据：

```bash
npm run dev
```

桌面端开发，会调用真实 Rust WiFi 扫描器：

```bash
npm run tauri:dev
```

### 只构建前端

```bash
npm run build
```

产物：

```text
dist/
```

### 构建 macOS App

```bash
npm run tauri:build
```

产物：

```text
src-tauri/target/release/bundle/macos/Poliwave.app
```

打包成便于分享的 macOS zip：

```bash
cd src-tauri/target/release/bundle/macos
ditto -c -k --sequesterRsrc --keepParent "Poliwave.app" "Poliwave.zip"
```

### 在 macOS 上构建 Windows x64 包

本项目可以通过 `cargo-xwin` 从 macOS 交叉编译 Windows x64 `.exe`。

一次性安装额外工具：

```bash
rustup target add x86_64-pc-windows-msvc
brew install llvm nsis
cargo install cargo-xwin
```

构建 Windows 可执行文件：

```bash
PATH="/opt/homebrew/opt/llvm/bin:$HOME/.cargo/bin:$PATH" \
  npm run tauri -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --ci
```

产物：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/poliwave.exe
```

生成可分享的 Windows zip：

```bash
mkdir -p release/windows-x64
cp src-tauri/target/x86_64-pc-windows-msvc/release/poliwave.exe "release/windows-x64/Poliwave.exe"
COPYFILE_DISABLE=1 LC_ALL=C LANG=C \
  sh -c 'cd release && zip -X -r "Poliwave-Windows-x64.zip" windows-x64'
```

产物：

```text
release/Poliwave-Windows-x64.zip
```

Windows 构建未签名，首次打开时可能触发 SmartScreen 提示。
