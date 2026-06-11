mod wifi;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime, WindowEvent,
};

const SHOW_PANEL_MENU_ID: &str = "show_control_panel";
const QUIT_MENU_ID: &str = "quit";

// 标记 async 让命令在独立线程执行：扫描与连接确认轮询都是阻塞调用，不能占用主线程。
#[tauri::command(async)]
fn scan_wifi() -> Result<wifi::ScanResult, String> {
    wifi::scan()
}

#[tauri::command(async)]
fn connect_wifi(
    ssid: String,
    username: Option<String>,
    password: Option<String>,
    security: Option<String>,
) -> Result<wifi::ConnectResult, String> {
    wifi::connect(ssid, username, password, security)
}

fn show_control_panel<R: Runtime>(app: &tauri::AppHandle<R>) {
    set_dock_visibility(app, true);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_control_panel<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    set_dock_visibility(app, false);
}

#[cfg(target_os = "macos")]
fn set_dock_visibility<R: Runtime>(app: &tauri::AppHandle<R>, visible: bool) {
    let _ = app.set_dock_visibility(visible);
}

#[cfg(not(target_os = "macos"))]
fn set_dock_visibility<R: Runtime>(_app: &tauri::AppHandle<R>, _visible: bool) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_panel =
                MenuItemBuilder::with_id(SHOW_PANEL_MENU_ID, "显示控制面板").build(app)?;
            let quit = MenuItemBuilder::with_id(QUIT_MENU_ID, "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_panel)
                .separator()
                .item(&quit)
                .build()?;
            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("WiFi Analyzer")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_control_panel(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    SHOW_PANEL_MENU_ID => show_control_panel(app),
                    QUIT_MENU_ID => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_control_panel(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![scan_wifi, connect_wifi])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_control_panel(app);
            }
        });
}
