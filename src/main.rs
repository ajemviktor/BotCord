#![windows_subsystem = "windows"]

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc, RwLock};

struct SessionData {
    token: String,
    bot_info: Value,
    gateway_cancel: tokio::sync::watch::Sender<bool>,
    presence_tx: mpsc::UnboundedSender<Value>,
}

#[derive(Clone)]
struct AppState {
    sessions: Arc<RwLock<HashMap<String, SessionData>>>,
    http_client: reqwest::Client,
    event_tx: broadcast::Sender<String>,
}

impl AppState {
    async fn get_token(&self, session_id: Option<&str>) -> Option<String> {
        let sessions = self.sessions.read().await;
        if let Some(id) = session_id {
            sessions.get(id).map(|s| s.token.clone())
        } else {
            sessions.values().next().map(|s| s.token.clone())
        }
    }
}

#[derive(Deserialize)]
struct LoginRequest {
    token: String,
}

#[derive(Deserialize)]
struct PresenceRequest {
    status: Option<String>,
    activity_name: Option<String>,
    activity_type: Option<u64>,
}

#[derive(Deserialize)]
struct SendMessageRequest {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    embeds: Option<Vec<Value>>,
}

const INDEX_HTML: &str = include_str!("../web/index.html");
const STYLE_CSS: &str = include_str!("../web/style.css");
const APP_JS: &str = include_str!("../web/app.js");
const ICON_ICO: &[u8] = include_bytes!("../assets/botcord.ico");
const ICON_PNG: &[u8] = include_bytes!("../assets/botcord.png");

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (event_tx, _) = broadcast::channel(100);

    let state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        http_client: reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?,
        event_tx,
    };

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/style.css", get(serve_style))
        .route("/app.js", get(serve_js))
        .route("/favicon.ico", get(serve_favicon))
        .route("/botcord.png", get(serve_icon_png))
        .route("/icon.png", get(serve_icon_png))
        .route("/api/login", post(handle_login))
        .route("/api/logout", post(handle_logout))
        .route("/api/sessions", get(handle_list_sessions))
        .route("/api/sessions/:session_id/presence", post(handle_update_presence))
        .route("/api/sessions/:session_id/logout", post(handle_logout_session))
        .route("/api/sessions/:session_id/guilds", get(handle_get_guilds_session))
        .route("/api/sessions/:session_id/guilds/:guild_id/channels", get(handle_get_channels_session))
        .route("/api/sessions/:session_id/guilds/:guild_id/members", get(handle_get_members_session))
        .route("/api/sessions/:session_id/channels/:channel_id/messages", get(handle_get_messages_session).post(handle_send_message_session))
        .route("/api/guilds", get(handle_get_guilds))
        .route("/api/guilds/:guild_id/channels", get(handle_get_channels))
        .route("/api/guilds/:guild_id/members", get(handle_get_members))
        .route("/api/channels/:channel_id/messages", get(handle_get_messages).post(handle_send_message))
        .route("/api/exit", post(handle_exit))
        .route("/api/events", get(handle_ws_events))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let url = format!("http://127.0.0.1:{}", addr.port());

    // Launch native window using Edge/Chrome App mode or platform fallback
    spawn_desktop_window(&url);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}

fn spawn_desktop_window(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let browser_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        ];

        let user_data_dir = std::env::var("LOCALAPPDATA")
            .unwrap_or_else(|_| r"C:\Users\trasz\AppData\Local".to_string())
            + r"\BotCord\edge_profile";

        for path in browser_paths {
            if std::path::Path::new(path).exists() {
                let res = Command::new(path)
                    .args([
                        format!("--app={}", url),
                        format!("--user-data-dir={}", user_data_dir),
                        "--window-size=1280,820".to_string(),
                        "--title=BotCord".to_string(),
                    ])
                    .spawn();

                if res.is_ok() {
                    return;
                }
            }
        }

        let _ = Command::new("cmd")
            .args(["/c", "start", url])
            .spawn();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let linux_browsers = [
            "chromium-browser",
            "chromium",
            "google-chrome-stable",
            "google-chrome",
            "microsoft-edge-stable",
            "microsoft-edge",
            "brave-browser",
        ];

        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let user_data_dir = format!("{}/.config/BotCord/browser_profile", home);

        for bin in linux_browsers {
            let res = Command::new(bin)
                .args([
                    format!("--app={}", url),
                    format!("--user-data-dir={}", user_data_dir),
                    "--window-size=1280,820".to_string(),
                    "--class=botcord".to_string(),
                ])
                .spawn();

            if res.is_ok() {
                return;
            }
        }

        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

// Static Assets
async fn serve_index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

async fn serve_style() -> Response {
    ([(header::CONTENT_TYPE, "text/css; charset=utf-8")], STYLE_CSS).into_response()
}

async fn serve_js() -> Response {
    ([(header::CONTENT_TYPE, "application/javascript; charset=utf-8")], APP_JS).into_response()
}

async fn serve_favicon() -> Response {
    ([(header::CONTENT_TYPE, "image/x-icon")], ICON_ICO).into_response()
}

async fn serve_icon_png() -> Response {
    ([(header::CONTENT_TYPE, "image/png")], ICON_PNG).into_response()
}

// Authentication
async fn handle_login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = payload.token.trim().to_string();
    if token.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Empty token"}))));
    }

    let auth_header = format!("Bot {}", token);

    let resp = state
        .http_client
        .get("https://discord.com/api/v10/users/@me")
        .header(header::AUTHORIZATION, &auth_header)
        .header(header::USER_AGENT, "BotCord (https://github.com/botcord, 0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if !resp.status().is_success() {
        let err_body: Value = resp.json().await.unwrap_or(json!({"error": "Unauthorized"}));
        return Err((StatusCode::UNAUTHORIZED, Json(err_body)));
    }

    let user_info: Value = resp.json().await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()})))
    })?;

    let session_id = user_info
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .to_string();

    // Cancel existing session with same id if any
    if let Some(old) = state.sessions.write().await.remove(&session_id) {
        let _ = old.gateway_cancel.send(true);
    }

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let (presence_tx, presence_rx) = mpsc::unbounded_channel();

    state.sessions.write().await.insert(
        session_id.clone(),
        SessionData {
            token: token.clone(),
            bot_info: user_info.clone(),
            gateway_cancel: cancel_tx,
            presence_tx,
        },
    );

    let event_tx_clone = state.event_tx.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        run_gateway_loop(sid, token, event_tx_clone, cancel_rx, presence_rx).await;
    });

    Ok(Json(json!({
        "success": true,
        "session_id": session_id,
        "bot": user_info
    })))
}

async fn handle_logout(State(state): State<AppState>) -> Json<Value> {
    let mut sessions = state.sessions.write().await;
    for (_, s) in sessions.drain() {
        let _ = s.gateway_cancel.send(true);
    }
    Json(json!({"success": true}))
}

async fn handle_logout_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Json<Value> {
    if let Some(session) = state.sessions.write().await.remove(&session_id) {
        let _ = session.gateway_cancel.send(true);
    }
    Json(json!({"success": true}))
}

async fn handle_list_sessions(State(state): State<AppState>) -> Json<Value> {
    let sessions = state.sessions.read().await;
    let list: Vec<Value> = sessions
        .iter()
        .map(|(id, data)| {
            json!({
                "session_id": id,
                "bot": data.bot_info
            })
        })
        .collect();
    Json(json!({ "sessions": list }))
}

async fn handle_update_presence(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(payload): Json<PresenceRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let sessions = state.sessions.read().await;
    let session = sessions.get(&session_id).ok_or((
        StatusCode::NOT_FOUND,
        Json(json!({"error": "Session not found"})),
    ))?;

    let mut activities = vec![];
    if let Some(name) = payload.activity_name {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            activities.push(json!({
                "name": trimmed,
                "type": payload.activity_type.unwrap_or(0),
            }));
        }
    }

    let status = payload.status.unwrap_or_else(|| "online".to_string());
    let op3 = json!({
        "op": 3,
        "d": {
            "since": null,
            "activities": activities,
            "status": status,
            "afk": false
        }
    });

    let _ = session.presence_tx.send(op3);
    Ok(Json(json!({ "success": true })))
}

// Session-aware Guilds
async fn handle_get_guilds_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(Some(&session_id))
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Session not found"}))))?;

    let resp = state
        .http_client
        .get("https://discord.com/api/v10/users/@me/guilds")
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let guilds: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "guilds": guilds })))
}

// Session-aware Channels
async fn handle_get_channels_session(
    State(state): State<AppState>,
    Path((session_id, guild_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(Some(&session_id))
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Session not found"}))))?;

    let url = format!("https://discord.com/api/v10/guilds/{}/channels", guild_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let channels: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "channels": channels })))
}

// Session-aware Members
async fn handle_get_members_session(
    State(state): State<AppState>,
    Path((session_id, guild_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(Some(&session_id))
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Session not found"}))))?;

    let url = format!("https://discord.com/api/v10/guilds/{}/members?limit=100", guild_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let members: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "members": members })))
}

// Session-aware Messages
async fn handle_get_messages_session(
    State(state): State<AppState>,
    Path((session_id, channel_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(Some(&session_id))
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Session not found"}))))?;

    let url = format!("https://discord.com/api/v10/channels/{}/messages?limit=50", channel_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let messages: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "messages": messages })))
}

// Session-aware Send Message
async fn handle_send_message_session(
    State(state): State<AppState>,
    Path((session_id, channel_id)): Path<(String, String)>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(Some(&session_id))
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Session not found"}))))?;

    let mut body = json!({});
    if let Some(content) = payload.content {
        body["content"] = json!(content);
    }
    if let Some(embeds) = payload.embeds {
        body["embeds"] = json!(embeds);
    }

    let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
    let resp = state
        .http_client
        .post(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .json(&body)
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if !resp.status().is_success() {
        let err_body: Value = resp.json().await.unwrap_or(json!({"error": "Failed to send message"}));
        return Err((StatusCode::BAD_REQUEST, Json(err_body)));
    }

    let sent_msg: Value = resp.json().await.unwrap_or(json!({}));
    Ok(Json(json!({ "message": sent_msg })))
}

// Fallback Guilds
async fn handle_get_guilds(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(None)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))))?;

    let resp = state
        .http_client
        .get("https://discord.com/api/v10/users/@me/guilds")
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let guilds: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "guilds": guilds })))
}

// Fallback Channels
async fn handle_get_channels(
    State(state): State<AppState>,
    Path(guild_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(None)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))))?;

    let url = format!("https://discord.com/api/v10/guilds/{}/channels", guild_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let channels: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "channels": channels })))
}

// Fallback Messages
async fn handle_get_messages(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(None)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))))?;

    let url = format!("https://discord.com/api/v10/channels/{}/messages?limit=50", channel_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let messages: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "messages": messages })))
}

// Fallback Members
async fn handle_get_members(
    State(state): State<AppState>,
    Path(guild_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(None)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))))?;

    let url = format!("https://discord.com/api/v10/guilds/{}/members?limit=100", guild_id);
    let resp = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let members: Value = resp.json().await.unwrap_or(json!([]));
    Ok(Json(json!({ "members": members })))
}

async fn handle_exit() -> Json<Value> {
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        std::process::exit(0);
    });
    Json(json!({"success": true}))
}

// Fallback Send Message
async fn handle_send_message(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = state
        .get_token(None)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))))?;

    let mut body = json!({});
    if let Some(content) = payload.content {
        body["content"] = json!(content);
    }
    if let Some(embeds) = payload.embeds {
        body["embeds"] = json!(embeds);
    }

    let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
    let resp = state
        .http_client
        .post(&url)
        .header(header::AUTHORIZATION, format!("Bot {}", token))
        .header(header::USER_AGENT, "BotCord (0.1.0)")
        .json(&body)
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    if !resp.status().is_success() {
        let err_body: Value = resp.json().await.unwrap_or(json!({"error": "Failed to send message"}));
        return Err((StatusCode::BAD_REQUEST, Json(err_body)));
    }

    let sent_msg: Value = resp.json().await.unwrap_or(json!({}));
    Ok(Json(json!({ "message": sent_msg })))
}

// Local WebSocket for real-time Gateway events to UI
async fn handle_ws_events(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rx = state.event_tx.subscribe();
    ws.on_upgrade(move |socket| handle_ws_client(socket, rx))
}

async fn handle_ws_client(mut socket: WebSocket, mut rx: broadcast::Receiver<String>) {
    while let Ok(msg_text) = rx.recv().await {
        if socket.send(Message::Text(msg_text.into())).await.is_err() {
            break;
        }
    }
}

// Discord Gateway WebSocket Client
async fn run_gateway_loop(
    session_id: String,
    token: String,
    event_tx: broadcast::Sender<String>,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    mut presence_rx: mpsc::UnboundedReceiver<Value>,
) {
    let gateway_url = "wss://gateway.discord.gg/?v=10&encoding=json";

    let (ws_stream, _) = match tokio_tungstenite::connect_async(gateway_url).await {
        Ok(res) => res,
        Err(e) => {
            eprintln!("Gateway connection failed for {}: {}", session_id, e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let mut heartbeat_interval_ms: Option<u64> = None;
    let mut seq: Option<i64> = None;

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    break;
                }
            }
            Some(presence_msg) = presence_rx.recv() => {
                let _ = write.send(tokio_tungstenite::tungstenite::Message::Text(presence_msg.to_string().into())).await;
            }
            msg = read.next() => {
                match msg {
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                        if let Ok(val) = serde_json::from_str::<Value>(&text) {
                            if let Some(s) = val.get("s").and_then(|v| v.as_i64()) {
                                seq = Some(s);
                            }

                            let op = val.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);

                            // Opcode 10: Hello -> start heartbeat & identify
                            if op == 10 {
                                if let Some(interval) = val.get("d").and_then(|d| d.get("heartbeat_interval")).and_then(|h| h.as_u64()) {
                                    heartbeat_interval_ms = Some(interval);

                                    // Send Identify (Opcode 2)
                                    // Intents: Guilds (1) | GuildMembers (2) | GuildMessages (512) | MessageContent (32768) = 33283
                                    let identify = json!({
                                        "op": 2,
                                        "d": {
                                            "token": token,
                                            "intents": 33283,
                                            "properties": {
                                                "os": "windows",
                                                "browser": "BotCord",
                                                "device": "BotCord"
                                            }
                                        }
                                    });

                                    let _ = write.send(tokio_tungstenite::tungstenite::Message::Text(identify.to_string().into())).await;
                                }
                            }

                            // Opcode 0: Dispatch
                            if op == 0 {
                                if let Some(event_type) = val.get("t").and_then(|t| t.as_str()) {
                                    if event_type == "MESSAGE_CREATE" {
                                        if let Some(data) = val.get("d") {
                                            let broadcast_payload = json!({
                                                "session_id": session_id,
                                                "type": "MESSAGE_CREATE",
                                                "data": data
                                            });
                                            let _ = event_tx.send(broadcast_payload.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(p))) => {
                        let _ = write.send(tokio_tungstenite::tungstenite::Message::Pong(p)).await;
                    }
                    Some(Err(_)) | None => {
                        break;
                    }
                    _ => {}
                }
            }
            _ = async {
                if let Some(ms) = heartbeat_interval_ms {
                    tokio::time::sleep(Duration::from_millis(ms)).await;
                } else {
                    futures_util::future::pending::<()>().await;
                }
            } => {
                // Send Heartbeat (Opcode 1)
                let hb = json!({
                    "op": 1,
                    "d": seq
                });
                let _ = write.send(tokio_tungstenite::tungstenite::Message::Text(hb.to_string().into())).await;
            }
        }
    }
}

