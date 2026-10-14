mod engine;
mod history;
mod routes;
mod store;
use engine::Engine;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::Ordering, Arc, Mutex},
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

pub struct Backend {
    pub app: tauri::AppHandle,
    pub directory: PathBuf,
    pub state: Mutex<Value>,
    pub engine: Arc<Engine>,
    pub approvals: Mutex<HashMap<String, Value>>,
}
impl Backend {
    pub fn snapshot(&self) -> Value {
        let mut state = self.state.lock().unwrap().clone();
        state["connected"] = json!(self.engine.ready.load(Ordering::SeqCst));
        state["approvals"] = json!(self
            .approvals
            .lock()
            .unwrap()
            .values()
            .map(|a| {
                let mut a = a.clone();
                a["id"] = json!(a["id"].to_string().trim_matches('"'));
                a
            })
            .collect::<Vec<_>>());
        state
    }
    pub fn emit(&self, value: Value) {
        let _ = self.app.emit("claudex-event", value);
    }
    pub fn persist(&self) {
        let state = self.state.lock().unwrap();
        if let Err(error) = store::save(&self.directory, &state) {
            drop(state);
            self.state.lock().unwrap()["engineError"] =
                json!(format!("Local data could not be saved: {error}"));
        }
    }
    pub fn broadcast(&self) {
        self.emit(json!({"type":"state","state":self.snapshot()}));
    }
    pub fn chat(&self, id: &str) -> Result<Value, String> {
        self.state.lock().unwrap()["chats"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .cloned()
            .ok_or("This conversation could not be found.".into())
    }
    pub fn edit_chat<F>(&self, id: &str, edit: F) -> Result<Value, String>
    where
        F: FnOnce(&mut Value),
    {
        let mut state = self.state.lock().unwrap();
        let chat = state["chats"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|c| c["id"] == id)
            .ok_or("This conversation could not be found.")?;
        edit(chat);
        Ok(chat.clone())
    }
    pub async fn refresh(self: &Arc<Self>) -> Result<Value, String> {
        if let Err(error) = self.engine.connect(self.clone()).await {
            self.state.lock().unwrap()["engineError"] = json!(error);
            self.broadcast();
            return Err(error);
        }
        let account = self.engine.call("account/read", json!({})).await?;
        let models = self.engine.call("model/list", json!({"limit":100})).await?;
        {
            let mut state = self.state.lock().unwrap();
            state["account"] = account["account"].clone();
            state["models"] = models["data"].clone();
            state["engineError"] = Value::Null;
            let selected = state["settings"]["model"].clone();
            if !models["data"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .any(|m| m["model"] == selected || m["id"] == selected)
            {
                if let Some(model) = models["data"]
                    .as_array()
                    .and_then(|a| a.iter().find(|m| m["isDefault"] == true).or(a.first()))
                {
                    state["settings"]["model"] = model["model"].clone();
                }
            }
        }
        history::sync(self).await?;
        self.persist();
        self.broadcast();
        Ok(self.snapshot())
    }
    pub fn disconnected(&self) {
        {
            let mut state = self.state.lock().unwrap();
            state["engineError"] = json!("Codex disconnected. Reconnect in Settings → Account.");
            for chat in state["chats"].as_array_mut().unwrap() {
                if chat["status"] == "running" {
                    chat["status"] = json!("interrupted");
                    chat["activeTurnId"] = Value::Null;
                }
            }
        }
        self.approvals.lock().unwrap().clear();
        self.persist();
        self.broadcast();
    }
    pub fn notification(self: &Arc<Self>, message: Value) {
        let method = message["method"].as_str().unwrap_or("");
        let p = &message["params"];
        if !message["id"].is_null() {
            if [
                "item/commandExecution/requestApproval",
                "item/fileChange/requestApproval",
                "item/tool/requestUserInput",
                "item/permissions/requestApproval",
                "mcpServer/elicitation/request",
            ]
            .contains(&method)
            {
                self.approvals.lock().unwrap().insert(
                    message["id"].to_string().trim_matches('"').to_owned(),
                    message,
                );
                self.broadcast();
            } else {
                let engine = self.engine.clone();
                tauri::async_runtime::spawn(async move {
                    let _=engine.send(json!({"id":message["id"],"error":{"code":-32601,"message":"This request is not supported by ClaudeX."}})).await;
                });
            }
            return;
        }
        if method == "account/updated" || method == "account/login/completed" {
            if method == "account/login/completed" {
                let mut event = p.clone();
                event["type"] = json!("login");
                self.emit(event);
            }
            let backend = self.clone();
            tauri::async_runtime::spawn(async move {
                let _ = backend.refresh().await;
            });
            return;
        }
        let mut state = self.state.lock().unwrap();
        let Some(chat) = state["chats"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|c| c["threadId"] == p["threadId"] && !p["threadId"].is_null())
        else {
            return;
        };
        match method {
            "turn/started" => {
                chat["status"] = json!("running");
                chat["activeTurnId"] = p["turn"]["id"].clone();
                chat["error"] = Value::Null;
            }
            "item/started" | "item/completed" => {
                let mut item = p["item"].clone();
                item["turnId"] = p["turnId"].clone();
                let items = chat["items"].as_array_mut().unwrap();
                let mut index = items.iter().position(|i| i["id"] == item["id"]);
                if item["type"] == "userMessage" {
                    if index.is_none() {
                        index = items.iter().position(|i| i["clientPending"] == true);
                    }
                    if let Some(index) = index {
                        item["content"] = items[index]["content"].clone();
                        item["attachments"] = items[index]["attachments"].clone();
                        item["clientPending"] = json!(false);
                    }
                }
                if let Some(index) = index {
                    items[index] = item;
                } else {
                    items.push(item);
                }
            }
            "item/agentMessage/delta" => {
                let id = chat["id"].clone();
                let items = chat["items"].as_array_mut().unwrap();
                if !items.iter().any(|i| i["id"] == p["itemId"]) {
                    items.push(json!({"id":p["itemId"],"type":"agentMessage","text":"","turnId":p["turnId"]}));
                }
                let item = items.iter_mut().find(|i| i["id"] == p["itemId"]).unwrap();
                item["text"] = json!(format!(
                    "{}{}",
                    item["text"].as_str().unwrap_or(""),
                    p["delta"].as_str().unwrap_or("")
                ));
                drop(state);
                self.emit(json!({"type":"delta","chatId":id,"itemId":p["itemId"],"delta":p["delta"],"turnId":p["turnId"]}));
                return;
            }
            "item/commandExecution/outputDelta" => {
                if let Some(item) = chat["items"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .find(|i| i["id"] == p["itemId"])
                {
                    item["aggregatedOutput"] = json!(format!(
                        "{}{}",
                        item["aggregatedOutput"].as_str().unwrap_or(""),
                        p["delta"].as_str().unwrap_or("")
                    ));
                }
            }
            "thread/tokenUsage/updated" => chat["tokenUsage"] = p["tokenUsage"].clone(),
            "turn/plan/updated" => chat["plan"] = p["plan"].clone(),
            "error" => chat["error"] = json!(friendly_error(&p["error"]["message"])),
            "turn/completed" => {
                chat["status"] = p["turn"]["status"].clone();
                chat["activeTurnId"] = Value::Null;
                if !p["turn"]["error"].is_null() {
                    chat["error"] = json!(friendly_error(&p["turn"]["error"]["message"]));
                }
                self.approvals
                    .lock()
                    .unwrap()
                    .retain(|_, a| a["params"]["threadId"] != p["threadId"]);
                drop(state);
                self.persist();
                self.broadcast();
                return;
            }
            _ => return,
        }
        let updated = chat.clone();
        drop(state);
        self.emit(json!({"type":"chat","chat":updated}));
    }
}
pub fn friendly_error(value: &Value) -> String {
    let text = value
        .as_str()
        .unwrap_or("Codex encountered an error. Please try again.");
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|e| e["error"]["message"].as_str().map(str::to_owned))
        .unwrap_or(text.to_owned())
}
#[tauri::command]
async fn request(
    state: tauri::State<'_, Arc<Backend>>,
    path: String,
    method: String,
    body: Value,
) -> Result<Value, String> {
    routes::request(state.inner().clone(), &path, &method, body).await
}
#[tauri::command]
async fn save_text(app: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
    let target = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&name)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(target) = target {
        std::fs::write(target.into_path().map_err(|e| e.to_string())?, content)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn set_page_zoom(window: tauri::WebviewWindow, factor: f64) -> Result<(), String> {
    if !factor.is_finite() || !(0.5..=2.0).contains(&factor) {
        return Err("Zoom must be between 50% and 200%.".into());
    }
    window.set_zoom(factor).map_err(|error| error.to_string())
}
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .register_uri_scheme_protocol("claudex", |context, request| {
            let id = request.uri().path().trim_start_matches('/');
            let backend = context.app_handle().state::<Arc<Backend>>();
            let response = routes::image(&backend, id)
                .map(|(bytes, mime)| {
                    tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap()
                })
                .unwrap_or_else(|_| {
                    tauri::http::Response::builder()
                        .status(404)
                        .body(vec![])
                        .unwrap()
                });
            response
        })
        .invoke_handler(tauri::generate_handler![request, save_text, set_page_zoom])
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let mut state = store::load(&directory);
            state["account"] = Value::Null;
            state["models"] = json!([]);
            state["engineError"] = Value::Null;
            let backend = Arc::new(Backend {
                app: app.handle().clone(),
                directory,
                state: Mutex::new(state),
                engine: Engine::new(),
                approvals: Mutex::new(HashMap::new()),
            });
            app.manage(backend.clone());
            let initialize = backend.clone();
            tauri::async_runtime::spawn(async move {
                let _ = initialize.refresh().await;
            });
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    backend.persist();
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to start ClaudeX");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            let backend = app.state::<Arc<Backend>>();
            backend.persist();
            tauri::async_runtime::block_on(backend.engine.stop());
        }
    });
}
