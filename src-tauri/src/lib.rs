mod wifi;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime, WindowEvent,
};

const SHOW_PANEL_MENU_ID: &str = "show_control_panel";
const QUIT_MENU_ID: &str = "quit";

#[tauri::command]
fn scan_wifi() -> Result<wifi::ScanResult, String> {
    wifi::scan()
}

fn show_control_panel<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

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
            let tray_icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;

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
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![scan_wifi])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
