use chrono::Utc;
use serde::Serialize;
use std::collections::BTreeMap;
#[cfg(target_os = "windows")]
use std::fs;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiNetwork {
    pub ssid: String,
    pub bssid: String,
    pub signal_dbm: i32,
    pub quality: u8,
    pub channel: u16,
    pub frequency_mhz: u16,
    pub band: String,
    pub security: String,
    pub is_connected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCongestion {
    pub band: String,
    pub channel: u16,
    pub network_count: usize,
    pub strongest_signal_dbm: i32,
    pub load_score: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub target_ssid: Option<String>,
    pub channel: Option<u16>,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub scanned_at: String,
    pub source: String,
    pub networks: Vec<WifiNetwork>,
    pub channels: Vec<ChannelCongestion>,
    pub recommendations: Vec<Recommendation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub ssid: String,
    pub message: String,
}

pub fn scan() -> Result<ScanResult, String> {
    let (source, raw) = scan_raw()?;
    let mut networks = parse_by_platform(&raw);
    mark_current_connection(&mut networks);

    networks.sort_by(|a, b| {
        b.signal_dbm
            .cmp(&a.signal_dbm)
            .then_with(|| a.ssid.to_lowercase().cmp(&b.ssid.to_lowercase()))
    });

    let channels = build_channel_stats(&networks);
    let recommendations = build_recommendations(&networks, &channels);

    Ok(ScanResult {
        scanned_at: Utc::now().to_rfc3339(),
        source,
        networks,
        channels,
        recommendations,
    })
}

pub fn connect(
    ssid: String,
    username: Option<String>,
    password: Option<String>,
    security: Option<String>,
) -> Result<ConnectResult, String> {
    let ssid = ssid.trim();
    if ssid.is_empty() || ssid == "<hidden>" {
        return Err("暂不支持连接隐藏 WiFi。".to_string());
    }

    let security = security.unwrap_or_else(|| "Unknown".to_string());
    let username = username
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let password = password
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if !is_open_security(&security) && !is_enterprise_security(&security) && password.is_none() {
        return Err("该 WiFi 需要密码。".to_string());
    }

    connect_by_platform(ssid, username.as_deref(), password.as_deref(), &security)?;

    Ok(ConnectResult {
        ssid: ssid.to_string(),
        message: format!("已发起连接 {ssid}"),
    })
}

#[cfg(target_os = "macos")]
fn connect_by_platform(
    ssid: &str,
    username: Option<&str>,
    password: Option<&str>,
    security: &str,
) -> Result<(), String> {
    if is_enterprise_security(security) || username.is_some() {
        return Err(
            "macOS 的 networksetup 不支持传入企业 WiFi 用户名，请在系统 WiFi 设置中连接。"
                .to_string(),
        );
    }

    let device = macos_wifi_device().ok_or_else(|| "未找到 Wi-Fi 网卡。".to_string())?;
    let mut args = vec!["-setairportnetwork", device.as_str(), ssid];
    if let Some(password) = password {
        args.push(password);
    }
    run_command("networksetup", &args).map(|_| ())
}

#[cfg(target_os = "windows")]
fn connect_by_platform(
    ssid: &str,
    username: Option<&str>,
    password: Option<&str>,
    security: &str,
) -> Result<(), String> {
    if is_enterprise_security(security) || username.is_some() {
        return Err("Windows 企业 WiFi 需要写入系统 802.1X 凭据，本版本暂不支持，请在系统 WiFi 设置中连接。".to_string());
    }

    if password.is_some() || is_open_security(security) {
        let profile_path = write_windows_wifi_profile(ssid, password, security)?;
        let path_string = profile_path.to_string_lossy().to_string();
        let add_result = run_command(
            "netsh",
            &["wlan", "add", "profile", &format!("filename={path_string}")],
        );
        let _ = fs::remove_file(&profile_path);
        add_result?;
    }

    run_command("netsh", &["wlan", "connect", &format!("name={ssid}")]).map(|_| ())
}

#[cfg(target_os = "linux")]
fn connect_by_platform(
    ssid: &str,
    username: Option<&str>,
    password: Option<&str>,
    security: &str,
) -> Result<(), String> {
    let mut args = vec!["dev", "wifi", "connect", ssid];
    if let Some(password) = password {
        if is_enterprise_security(security) {
            let username = username.ok_or_else(|| "该企业 WiFi 需要用户名。".to_string())?;
            args.extend([
                "wifi-sec.key-mgmt",
                "wpa-eap",
                "802-1x.eap",
                "peap",
                "802-1x.phase2-auth",
                "mschapv2",
                "802-1x.identity",
                username,
                "802-1x.password",
                password,
            ]);
        } else {
            args.push("password");
            args.push(password);
        }
    }
    run_command("nmcli", &args).map(|_| ())
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn connect_by_platform(
    _ssid: &str,
    _username: Option<&str>,
    _password: Option<&str>,
    _security: &str,
) -> Result<(), String> {
    Err("WiFi connection is only implemented for macOS, Windows, and Linux.".to_string())
}

#[cfg(target_os = "windows")]
fn write_windows_wifi_profile(
    ssid: &str,
    password: Option<&str>,
    security: &str,
) -> Result<std::path::PathBuf, String> {
    let path = std::env::temp_dir().join(format!(
        "wifi-analyzer-{}.xml",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let profile = windows_wifi_profile_xml(ssid, password, security);
    fs::write(&path, profile).map_err(|err| format!("写入 WiFi 配置失败: {err}"))?;
    Ok(path)
}

#[cfg(target_os = "windows")]
fn windows_wifi_profile_xml(ssid: &str, password: Option<&str>, security: &str) -> String {
    let ssid_hex = ssid
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<String>();
    let security_xml = if let Some(password) = password {
        let authentication = if security.to_ascii_lowercase().contains("wpa3") {
            "WPA3SAE"
        } else {
            "WPA2PSK"
        };
        format!(
            r#"      <authEncryption>
        <authentication>{authentication}</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>{key}</keyMaterial>
      </sharedKey>"#,
            key = xml_escape(password),
        )
    } else {
        r#"      <authEncryption>
        <authentication>open</authentication>
        <encryption>none</encryption>
        <useOneX>false</useOneX>
      </authEncryption>"#
            .to_string()
    };

    format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>{name}</name>
  <SSIDConfig>
    <SSID>
      <hex>{ssid_hex}</hex>
      <name>{name}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
{security_xml}
    </security>
  </MSM>
</WLANProfile>
"#,
        name = xml_escape(ssid),
    )
}

#[cfg(target_os = "macos")]
fn scan_raw() -> Result<(String, String), String> {
    let airport =
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
    if let Ok(raw) = run_command(airport, &["-s"]) {
        if !parse_airport(&raw).is_empty() {
            return Ok(("airport -s".to_string(), raw));
        }
    }

    run_command("system_profiler", &["SPAirPortDataType"])
        .map(|raw| ("system_profiler SPAirPortDataType".to_string(), raw))
}

#[cfg(target_os = "windows")]
fn scan_raw() -> Result<(String, String), String> {
    run_command("netsh", &["wlan", "show", "networks", "mode=bssid"])
        .map(|raw| ("netsh wlan show networks mode=bssid".to_string(), raw))
}

#[cfg(target_os = "linux")]
fn scan_raw() -> Result<(String, String), String> {
    match run_command(
        "nmcli",
        &[
            "-t",
            "-f",
            "SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY",
            "dev",
            "wifi",
            "list",
            "--rescan",
            "yes",
        ],
    ) {
        Ok(raw) => Ok(("nmcli dev wifi list".to_string(), raw)),
        Err(nmcli_error) => run_command("iw", &["dev", "scan"])
            .map(|raw| ("iw dev scan".to_string(), raw))
            .map_err(|iw_error| format!("{nmcli_error}; fallback iw failed: {iw_error}")),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn scan_raw() -> Result<(String, String), String> {
    Err("WiFi scanning is only implemented for macOS, Windows, and Linux.".to_string())
}

fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|err| format!("Failed to run {program}: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{program} exited with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(target_os = "macos")]
fn parse_by_platform(raw: &str) -> Vec<WifiNetwork> {
    if raw.contains("Current Network Information:") || raw.contains("Other Local Wi-Fi Networks:") {
        parse_system_profiler_airport(raw)
    } else {
        parse_airport(raw)
    }
}

#[cfg(target_os = "windows")]
fn parse_by_platform(raw: &str) -> Vec<WifiNetwork> {
    parse_netsh(raw)
}

#[cfg(target_os = "linux")]
fn parse_by_platform(raw: &str) -> Vec<WifiNetwork> {
    if raw.contains("BSS ") && raw.contains("signal:") {
        parse_iw(raw)
    } else {
        parse_nmcli(raw)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn parse_by_platform(_raw: &str) -> Vec<WifiNetwork> {
    Vec::new()
}

fn parse_airport(raw: &str) -> Vec<WifiNetwork> {
    raw.lines()
        .skip(1)
        .filter_map(|line| {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            let bssid_index = tokens.iter().position(|token| is_mac_address(token))?;
            if bssid_index == 0 || tokens.len() <= bssid_index + 2 {
                return None;
            }

            let ssid = tokens[..bssid_index].join(" ");
            let bssid = tokens[bssid_index].to_lowercase();
            let signal_dbm = tokens.get(bssid_index + 1)?.parse::<i32>().ok()?;
            let channel = parse_channel(tokens.get(bssid_index + 2)?)?;
            let security = tokens
                .get(bssid_index + 6..)
                .map(|items| items.join(" "))
                .unwrap_or_else(|| "Unknown".to_string());

            Some(make_network(
                ssid, bssid, signal_dbm, channel, security, None,
            ))
        })
        .collect()
}

#[cfg(target_os = "macos")]
#[derive(Debug, Default)]
struct SystemProfilerNetwork {
    ssid: String,
    channel: u16,
    signal_dbm: Option<i32>,
    security: String,
    is_connected: bool,
}

#[cfg(target_os = "macos")]
fn parse_system_profiler_airport(raw: &str) -> Vec<WifiNetwork> {
    let mut networks = Vec::new();
    let mut in_network_section = false;
    let mut section_is_connected = false;
    let mut current: Option<SystemProfilerNetwork> = None;

    for line in raw.lines() {
        let trimmed = line.trim();

        if trimmed == "Current Network Information:" || trimmed == "Other Local Wi-Fi Networks:" {
            push_system_profiler_network(&mut networks, current.take());
            in_network_section = true;
            section_is_connected = trimmed == "Current Network Information:";
            continue;
        }

        if !in_network_section || trimmed.is_empty() {
            continue;
        }

        if is_system_profiler_section_boundary(trimmed) {
            push_system_profiler_network(&mut networks, current.take());
            in_network_section = false;
            continue;
        }

        if trimmed.ends_with(':') && value_after_colon(trimmed).unwrap_or_default().is_empty() {
            push_system_profiler_network(&mut networks, current.take());
            current = Some(SystemProfilerNetwork {
                ssid: trimmed.trim_end_matches(':').to_string(),
                security: "Unknown".to_string(),
                is_connected: section_is_connected,
                ..Default::default()
            });
            continue;
        }

        let Some(network) = current.as_mut() else {
            continue;
        };

        if let Some(value) = trimmed.strip_prefix("Channel:") {
            network.channel = parse_channel(value.trim()).unwrap_or(0);
        } else if let Some(value) = trimmed.strip_prefix("Security:") {
            network.security = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("Signal / Noise:") {
            network.signal_dbm = parse_signal_dbm(value);
        }
    }

    push_system_profiler_network(&mut networks, current);
    networks
}

#[cfg(target_os = "macos")]
fn push_system_profiler_network(
    networks: &mut Vec<WifiNetwork>,
    network: Option<SystemProfilerNetwork>,
) {
    let Some(network) = network else {
        return;
    };

    if network.ssid.is_empty() || network.channel == 0 {
        return;
    }

    let signal_dbm = network.signal_dbm.unwrap_or(-82);
    let bssid = synthetic_bssid(&network.ssid, network.channel, networks.len());

    let mut parsed = make_network(
        network.ssid,
        bssid,
        signal_dbm,
        network.channel,
        network.security,
        None,
    );
    parsed.is_connected = network.is_connected;
    networks.push(parsed);
}

#[cfg(target_os = "macos")]
fn is_system_profiler_section_boundary(trimmed: &str) -> bool {
    matches!(
        trimmed,
        "Interfaces:" | "Software Versions:" | "Supported Channels:"
    )
}

fn parse_netsh(raw: &str) -> Vec<WifiNetwork> {
    let mut networks = Vec::new();
    let mut current_ssid = String::new();
    let mut current_security = String::from("Unknown");
    let mut current_bssid = String::new();
    let mut current_quality: Option<u8> = None;
    let mut current_channel: Option<u16> = None;

    for line in raw.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("SSID ") && trimmed.contains(':') {
            push_netsh_network(
                &mut networks,
                &current_ssid,
                &current_security,
                &current_bssid,
                current_quality,
                current_channel,
            );
            current_bssid.clear();
            current_quality = None;
            current_channel = None;
            current_ssid = value_after_colon(trimmed).unwrap_or_default().to_string();
        } else if trimmed.starts_with("Authentication") || trimmed.starts_with("身份验证") {
            current_security = value_after_colon(trimmed).unwrap_or("Unknown").to_string();
        } else if trimmed.starts_with("BSSID ") && trimmed.contains(':') {
            push_netsh_network(
                &mut networks,
                &current_ssid,
                &current_security,
                &current_bssid,
                current_quality,
                current_channel,
            );
            current_bssid = value_after_colon(trimmed)
                .unwrap_or_default()
                .to_lowercase();
            current_quality = None;
            current_channel = None;
        } else if trimmed.starts_with("Signal") || trimmed.starts_with("信号") {
            current_quality = value_after_colon(trimmed)
                .and_then(|value| value.trim_end_matches('%').trim().parse::<u8>().ok());
        } else if trimmed.starts_with("Channel") || trimmed.starts_with("频道") {
            current_channel = value_after_colon(trimmed).and_then(|value| parse_channel(value));
        }
    }

    push_netsh_network(
        &mut networks,
        &current_ssid,
        &current_security,
        &current_bssid,
        current_quality,
        current_channel,
    );

    networks
}

fn push_netsh_network(
    networks: &mut Vec<WifiNetwork>,
    ssid: &str,
    security: &str,
    bssid: &str,
    quality: Option<u8>,
    channel: Option<u16>,
) {
    if ssid.is_empty() || !is_mac_address(bssid) {
        return;
    }

    let quality = quality.unwrap_or(0);
    let signal_dbm = quality_to_dbm(quality);

    networks.push(make_network(
        ssid.to_string(),
        bssid.to_string(),
        signal_dbm,
        channel.unwrap_or(0),
        security.to_string(),
        Some(quality),
    ));
}

fn parse_nmcli(raw: &str) -> Vec<WifiNetwork> {
    raw.lines()
        .filter_map(|line| {
            let parts = split_nmcli_line(line);
            if parts.len() < 6 {
                return None;
            }

            let ssid = if parts[0].is_empty() {
                "<hidden>".to_string()
            } else {
                parts[0].clone()
            };
            let bssid = parts[1].to_lowercase();
            let channel = parse_channel(&parts[2])?;
            let frequency_mhz = parts[3].parse::<u16>().ok();
            let quality = parts[4].parse::<u8>().unwrap_or(0);
            let signal_dbm = quality_to_dbm(quality);
            let security = parts[5].clone();

            Some(
                make_network(ssid, bssid, signal_dbm, channel, security, Some(quality))
                    .with_frequency(frequency_mhz),
            )
        })
        .collect()
}

fn parse_iw(raw: &str) -> Vec<WifiNetwork> {
    let mut networks = Vec::new();
    let mut bssid = String::new();
    let mut ssid = String::from("<hidden>");
    let mut channel = 0;
    let mut freq: Option<u16> = None;
    let mut signal_dbm: Option<i32> = None;
    let mut security = String::from("Open");

    for line in raw.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("BSS ") {
            push_iw_network(
                &mut networks,
                &ssid,
                &bssid,
                signal_dbm,
                channel,
                freq,
                &security,
            );
            bssid = trimmed
                .split_whitespace()
                .nth(1)
                .unwrap_or_default()
                .trim_end_matches("(on")
                .to_lowercase();
            ssid = String::from("<hidden>");
            channel = 0;
            freq = None;
            signal_dbm = None;
            security = String::from("Open");
        } else if let Some(rest) = trimmed.strip_prefix("SSID:") {
            ssid = rest.trim().to_string();
            if ssid.is_empty() {
                ssid = String::from("<hidden>");
            }
        } else if let Some(rest) = trimmed.strip_prefix("freq:") {
            freq = rest.trim().parse::<u16>().ok();
            if let Some(freq_mhz) = freq {
                channel = frequency_to_channel(freq_mhz);
            }
        } else if let Some(rest) = trimmed.strip_prefix("signal:") {
            signal_dbm = rest
                .split_whitespace()
                .next()
                .and_then(|value| value.parse::<f32>().ok())
                .map(|value| value.round() as i32);
        } else if trimmed.starts_with("RSN:") {
            security = String::from("WPA2/WPA3");
        } else if trimmed.starts_with("WPA:") {
            security = String::from("WPA");
        }
    }

    push_iw_network(
        &mut networks,
        &ssid,
        &bssid,
        signal_dbm,
        channel,
        freq,
        &security,
    );

    networks
}

fn push_iw_network(
    networks: &mut Vec<WifiNetwork>,
    ssid: &str,
    bssid: &str,
    signal_dbm: Option<i32>,
    channel: u16,
    frequency_mhz: Option<u16>,
    security: &str,
) {
    if !is_mac_address(bssid) {
        return;
    }

    networks.push(
        make_network(
            ssid.to_string(),
            bssid.to_string(),
            signal_dbm.unwrap_or(-100),
            channel,
            security.to_string(),
            None,
        )
        .with_frequency(frequency_mhz),
    );
}

fn build_channel_stats(networks: &[WifiNetwork]) -> Vec<ChannelCongestion> {
    let mut groups: BTreeMap<(String, u16), Vec<&WifiNetwork>> = BTreeMap::new();

    for network in networks {
        if network.channel == 0 {
            continue;
        }
        groups
            .entry((network.band.clone(), network.channel))
            .or_default()
            .push(network);
    }

    groups
        .into_iter()
        .map(|((band, channel), items)| {
            let strongest_signal_dbm = items
                .iter()
                .map(|network| network.signal_dbm)
                .max()
                .unwrap_or(-100);
            let base_load: u16 = items
                .iter()
                .map(|network| signal_load(network.signal_dbm))
                .sum();
            let overlap_load = if band == "2.4GHz" {
                networks
                    .iter()
                    .filter(|network| network.band == "2.4GHz" && network.channel != channel)
                    .filter(|network| network.channel.abs_diff(channel) <= 4)
                    .map(|network| signal_load(network.signal_dbm) / 2)
                    .sum()
            } else {
                0
            };

            ChannelCongestion {
                band,
                channel,
                network_count: items.len(),
                strongest_signal_dbm,
                load_score: base_load.saturating_add(overlap_load).min(100),
            }
        })
        .collect()
}

fn build_recommendations(
    networks: &[WifiNetwork],
    channels: &[ChannelCongestion],
) -> Vec<Recommendation> {
    let mut recommendations = Vec::new();

    if let Some(best) = networks
        .iter()
        .max_by_key(|network| connection_score(network, channels))
    {
        let score = connection_score(best, channels);
        let congestion = channel_load(&best.band, best.channel, channels);
        recommendations.push(Recommendation {
            kind: "connect".to_string(),
            title: format!("建议连接 {}", best.ssid),
            detail: format!(
                "{} 信号 {} dBm，{}，当前信道负载约 {}%。",
                best.band, best.signal_dbm, best.security, congestion
            ),
            target_ssid: Some(best.ssid.clone()),
            channel: Some(best.channel),
            score,
        });
    }

    if let Some(channel) = best_channel("2.4GHz", channels) {
        recommendations.push(Recommendation {
            kind: "channel".to_string(),
            title: format!("2.4GHz 建议切到信道 {channel}"),
            detail: "2.4GHz 优先使用 1/6/11，减少相邻信道重叠干扰。".to_string(),
            target_ssid: None,
            channel: Some(channel),
            score: 100 - i32::from(channel_load("2.4GHz", channel, channels)),
        });
    }

    if let Some(channel) = best_channel("5GHz", channels) {
        recommendations.push(Recommendation {
            kind: "channel".to_string(),
            title: format!("5GHz 建议切到信道 {channel}"),
            detail: "5GHz 可用信道更多，优先选择扫描中负载最低的非空闲冲突信道。".to_string(),
            target_ssid: None,
            channel: Some(channel),
            score: 100 - i32::from(channel_load("5GHz", channel, channels)),
        });
    }

    recommendations
}

fn best_channel(band: &str, channels: &[ChannelCongestion]) -> Option<u16> {
    let candidates: Vec<u16> = if band == "2.4GHz" {
        vec![1, 6, 11]
    } else {
        vec![36, 40, 44, 48, 149, 153, 157, 161]
    };

    candidates
        .into_iter()
        .min_by_key(|channel| channel_load(band, *channel, channels))
}

fn connection_score(network: &WifiNetwork, channels: &[ChannelCongestion]) -> i32 {
    let security_bonus = if network.security.to_lowercase().contains("open") {
        -20
    } else {
        8
    };
    let band_bonus = match network.band.as_str() {
        "6GHz" => 14,
        "5GHz" => 10,
        _ => 0,
    };
    let congestion_penalty = i32::from(channel_load(&network.band, network.channel, channels)) / 3;

    network.quality as i32 + security_bonus + band_bonus - congestion_penalty
}

fn channel_load(band: &str, channel: u16, channels: &[ChannelCongestion]) -> u16 {
    channels
        .iter()
        .find(|item| item.band == band && item.channel == channel)
        .map(|item| item.load_score)
        .unwrap_or(0)
}

fn make_network(
    ssid: String,
    bssid: String,
    signal_dbm: i32,
    channel: u16,
    security: String,
    quality: Option<u8>,
) -> WifiNetwork {
    let frequency_mhz = channel_to_frequency(channel);
    let band = band_from_frequency(frequency_mhz);

    WifiNetwork {
        ssid: if ssid.is_empty() {
            "<hidden>".to_string()
        } else {
            ssid
        },
        bssid,
        signal_dbm,
        quality: quality.unwrap_or_else(|| dbm_to_quality(signal_dbm)),
        channel,
        frequency_mhz,
        band,
        security: if security.is_empty() {
            "Unknown".to_string()
        } else {
            security
        },
        is_connected: false,
    }
}

fn mark_current_connection(networks: &mut [WifiNetwork]) {
    if networks.iter().any(|network| network.is_connected) {
        return;
    }

    let Some(current_ssid) = current_connected_ssid() else {
        return;
    };

    for network in networks {
        if network.ssid == current_ssid {
            network.is_connected = true;
        }
    }
}

#[cfg(target_os = "macos")]
fn current_connected_ssid() -> Option<String> {
    let device = macos_wifi_device()?;
    let raw = run_command("networksetup", &["-getairportnetwork", &device]).ok()?;
    parse_networksetup_current_ssid(&raw)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn current_connected_ssid() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn current_connected_ssid() -> Option<String> {
    let raw = run_command("netsh", &["wlan", "show", "interfaces"]).ok()?;
    parse_netsh_current_ssid(&raw)
}

#[cfg(target_os = "linux")]
fn current_connected_ssid() -> Option<String> {
    let raw = run_command("nmcli", &["-t", "-f", "ACTIVE,SSID", "dev", "wifi", "list"]).ok()?;
    parse_nmcli_current_ssid(&raw)
}

#[cfg(target_os = "macos")]
fn macos_wifi_device() -> Option<String> {
    let raw = run_command("networksetup", &["-listallhardwareports"]).ok()?;
    parse_macos_wifi_device(&raw)
}

#[cfg(target_os = "macos")]
fn parse_macos_wifi_device(raw: &str) -> Option<String> {
    let mut in_wifi_port = false;

    for line in raw.lines() {
        let trimmed = line.trim();

        if let Some(port) = trimmed.strip_prefix("Hardware Port:") {
            let port = port.trim();
            in_wifi_port = port == "Wi-Fi" || port == "AirPort";
            continue;
        }

        if in_wifi_port {
            if let Some(device) = trimmed.strip_prefix("Device:") {
                let device = device.trim();
                if !device.is_empty() {
                    return Some(device.to_string());
                }
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn parse_networksetup_current_ssid(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains("not associated") {
        return None;
    }

    trimmed
        .split_once(": ")
        .map(|(_, ssid)| ssid.trim().to_string())
        .filter(|ssid| !ssid.is_empty())
}

fn parse_netsh_current_ssid(raw: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.starts_with("SSID") && !trimmed.starts_with("BSSID") {
            value_after_colon(trimmed)
                .map(str::to_string)
                .filter(|ssid| !ssid.is_empty())
        } else {
            None
        }
    })
}

fn parse_nmcli_current_ssid(raw: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let parts = split_nmcli_line(line);
        if parts.len() >= 2 && parts[0] == "yes" {
            Some(parts[1].clone()).filter(|ssid| !ssid.is_empty())
        } else {
            None
        }
    })
}

trait WithFrequency {
    fn with_frequency(self, frequency_mhz: Option<u16>) -> Self;
}

impl WithFrequency for WifiNetwork {
    fn with_frequency(mut self, frequency_mhz: Option<u16>) -> Self {
        if let Some(frequency_mhz) = frequency_mhz {
            self.frequency_mhz = frequency_mhz;
            self.band = band_from_frequency(frequency_mhz);
            if self.channel == 0 {
                self.channel = frequency_to_channel(frequency_mhz);
            }
        }
        self
    }
}

fn split_nmcli_line(line: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut escaped = false;

    for ch in line.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == ':' {
            parts.push(current);
            current = String::new();
        } else {
            current.push(ch);
        }
    }

    parts.push(current);
    parts
}

fn value_after_colon(line: &str) -> Option<&str> {
    line.split_once(':').map(|(_, value)| value.trim())
}

fn parse_signal_dbm(value: &str) -> Option<i32> {
    value
        .split_whitespace()
        .find_map(|part| part.parse::<i32>().ok())
}

fn parse_channel(value: &str) -> Option<u16> {
    let digits: String = value.chars().take_while(|ch| ch.is_ascii_digit()).collect();
    digits.parse::<u16>().ok()
}

fn is_mac_address(value: &str) -> bool {
    let clean = value.trim();
    let parts: Vec<&str> = clean.split(':').collect();
    parts.len() == 6
        && parts
            .iter()
            .all(|part| part.len() == 2 && part.chars().all(|ch| ch.is_ascii_hexdigit()))
}

fn is_open_security(security: &str) -> bool {
    let normalized = security.to_ascii_lowercase();
    normalized == "--"
        || normalized.contains("open")
        || normalized.contains("none")
        || normalized.contains("无")
}

fn is_enterprise_security(security: &str) -> bool {
    let normalized = security.to_ascii_lowercase();
    normalized.contains("enterprise") || normalized.contains("802.1x")
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn synthetic_bssid(ssid: &str, channel: u16, salt: usize) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in ssid
        .bytes()
        .chain(channel.to_be_bytes())
        .chain((salt as u64).to_be_bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!(
        "02:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
        (hash >> 32) & 0xff,
        (hash >> 24) & 0xff,
        (hash >> 16) & 0xff,
        (hash >> 8) & 0xff,
        hash & 0xff
    )
}

fn channel_to_frequency(channel: u16) -> u16 {
    match channel {
        1..=13 => 2407 + channel * 5,
        14 => 2484,
        32..=177 => 5000 + channel * 5,
        1..=233 => 5950 + channel * 5,
        _ => 0,
    }
}

fn frequency_to_channel(frequency_mhz: u16) -> u16 {
    match frequency_mhz {
        2412..=2472 => (frequency_mhz - 2407) / 5,
        2484 => 14,
        5160..=5885 => (frequency_mhz - 5000) / 5,
        5955..=7115 => (frequency_mhz - 5950) / 5,
        _ => 0,
    }
}

fn band_from_frequency(frequency_mhz: u16) -> String {
    match frequency_mhz {
        2400..=2500 => "2.4GHz".to_string(),
        4900..=5925 => "5GHz".to_string(),
        5926..=7125 => "6GHz".to_string(),
        _ => "Unknown".to_string(),
    }
}

fn dbm_to_quality(dbm: i32) -> u8 {
    (((dbm + 100) * 2).clamp(0, 100)) as u8
}

fn quality_to_dbm(quality: u8) -> i32 {
    (i32::from(quality) / 2) - 100
}

fn signal_load(dbm: i32) -> u16 {
    dbm_to_quality(dbm).max(8) as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_airport_rows_with_spaces_in_ssid() {
        let raw = "                            SSID BSSID             RSSI CHANNEL HT CC SECURITY (auth/unicast/group)\n\
                   Office Main aa:bb:cc:dd:ee:ff -48  149     Y  US WPA2(PSK/AES/AES)\n\
                         IoT Net 11:22:33:44:55:66 -79  6       Y  US WPA(PSK/TKIP/TKIP)\n";

        let rows = parse_airport(raw);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].ssid, "Office Main");
        assert_eq!(rows[0].band, "5GHz");
        assert_eq!(rows[1].channel, 6);
    }

    #[test]
    fn parses_nmcli_escaped_bssid() {
        let raw = "Office:AA\\:BB\\:CC\\:DD\\:EE\\:FF:149:5745:94:WPA2\n";

        let rows = parse_nmcli(raw);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].bssid, "aa:bb:cc:dd:ee:ff");
        assert_eq!(rows[0].signal_dbm, -53);
    }

    #[test]
    fn parses_current_ssid_from_netsh_interfaces() {
        let raw = r#"Name                   : Wi-Fi
State                  : connected
SSID                   : Studio-5G
BSSID                  : aa:bb:cc:dd:ee:ff
"#;

        assert_eq!(parse_netsh_current_ssid(raw).as_deref(), Some("Studio-5G"));
    }

    #[test]
    fn parses_current_ssid_from_nmcli_active_list() {
        let raw = "no:Guest\\:Lobby\nyes:Studio\\:5G\n";

        assert_eq!(parse_nmcli_current_ssid(raw).as_deref(), Some("Studio:5G"));
    }

    #[test]
    fn escapes_xml_profile_values() {
        assert_eq!(
            xml_escape("A&B <Office> \"Main\" 'Key'"),
            "A&amp;B &lt;Office&gt; &quot;Main&quot; &apos;Key&apos;"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_system_profiler_wifi_sections_when_airport_scan_is_empty() {
        let raw = r#"Wi-Fi:

      Interfaces:
        en1:
          Status: Connected
          Current Network Information:
            ZhaoPin-Employee:
              PHY Mode: 802.11ac
              Channel: 52 (5GHz, 20MHz)
              Network Type: Infrastructure
              Security: WPA2 Enterprise
              Signal / Noise: -63 dBm / -101 dBm
          Other Local Wi-Fi Networks:
            ZhaoPin-Guest:
              PHY Mode: 802.11b/g/n
              Channel: 11 (2GHz, 20MHz)
              Network Type: Infrastructure
              Security: None
            ZhaoPin-Mgmt:
              PHY Mode: 802.11a/n/ac
              Channel: 36 (5GHz, 20MHz)
              Network Type: Infrastructure
              Security: WPA2 Enterprise
"#;

        let rows = parse_system_profiler_airport(raw);

        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].ssid, "ZhaoPin-Employee");
        assert_eq!(rows[0].signal_dbm, -63);
        assert_eq!(rows[0].band, "5GHz");
        assert!(rows[0].is_connected);
        assert_eq!(rows[1].ssid, "ZhaoPin-Guest");
        assert_eq!(rows[1].band, "2.4GHz");
        assert!(!rows[1].is_connected);
        assert!(is_mac_address(&rows[1].bssid));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_macos_wifi_device_from_networksetup_hardware_ports() {
        let raw = r#"Hardware Port: Ethernet
Device: en0
Ethernet Address: d0:11:e5:0b:ef:20

Hardware Port: Wi-Fi
Device: en1
Ethernet Address: d0:11:e5:03:28:84
"#;

        assert_eq!(parse_macos_wifi_device(raw).as_deref(), Some("en1"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_current_ssid_from_networksetup_output() {
        assert_eq!(
            parse_networksetup_current_ssid("Current Wi-Fi Network: Studio-5G\n").as_deref(),
            Some("Studio-5G")
        );
        assert_eq!(
            parse_networksetup_current_ssid("You are not associated with an AirPort network.\n"),
            None
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "uses the host WiFi adapter and can be slow"]
    fn live_macos_scan_returns_networks() {
        let result = scan().expect("live macOS scan should not fail");

        assert!(
            !result.networks.is_empty(),
            "expected at least one WiFi network from {}",
            result.source
        );
    }

    #[test]
    fn ranks_recommendations_by_signal_congestion_and_band() {
        let networks = vec![
            make_network(
                "2G".to_string(),
                "00:00:00:00:00:01".to_string(),
                -43,
                6,
                "WPA2".to_string(),
                None,
            ),
            make_network(
                "5G".to_string(),
                "00:00:00:00:00:02".to_string(),
                -55,
                149,
                "WPA2".to_string(),
                None,
            ),
        ];
        let channels = build_channel_stats(&networks);
        let recommendations = build_recommendations(&networks, &channels);

        assert!(!recommendations.is_empty());
        assert_eq!(recommendations[0].kind, "connect");
    }
}
