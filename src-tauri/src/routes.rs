use crate::{friendly_error, store, Backend};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Arc};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;
fn string<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
fn uuid(id: &str) -> Result<(), String> {
    Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| "Invalid identifier.".into())
}
fn upload_metadata(backend: &Backend, id: &str) -> Result<Value, String> {
    uuid(id)?;
    serde_json::from_slice(
        &fs::read(
            backend
                .directory
                .join("uploads")
                .join(format!("{id}.meta.json")),
        )
        .map_err(|_| "Attachment not found.")?,
    )
    .map_err(|e| e.to_string())
}
pub fn image(backend: &Backend, id: &str) -> Result<(Vec<u8>, String), String> {
    let meta = upload_metadata(backend, id)?;
    let mime = string(&meta, "type");
    if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime) {
        return Err("Image preview unavailable.".into());
    }
    Ok((
        fs::read(string(&meta, "path")).map_err(|e| e.to_string())?,
        mime.to_owned(),
    ))
}
fn known_workspace(backend: &Backend, workspace: &str) -> Result<PathBuf, String> {
    let root = store::directory(workspace)?;
    let state = backend.snapshot();
    if !state["workspaces"]
        .as_array()
        .unwrap()
        .iter()
        .any(|w| store::directory(w.as_str().unwrap_or("")).ok().as_ref() == Some(&root))
        && !state["chats"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| store::directory(string(c, "workspace")).ok().as_ref() == Some(&root))
    {
        return Err("Add this workspace first.".into());
    }
    Ok(root)
}
fn add_workspace(backend: &Backend, path: PathBuf) -> Value {
    let value = json!(path);
    {
        let mut state = backend.state.lock().unwrap();
        let workspaces = state["workspaces"].as_array_mut().unwrap();
        if !workspaces.contains(&value) {
            workspaces.push(value.clone());
        }
        state["settings"]["workspace"] = value.clone();
    }
    backend.persist();
    backend.broadcast();
    json!({"path":value})
}
pub async fn request(
    backend: Arc<Backend>,
    path: &str,
    method: &str,
    body: Value,
) -> Result<Value, String> {
    let url = url::Url::parse(&format!("http://claudex{path}")).map_err(|e| e.to_string())?;
    let query = url
        .query_pairs()
        .into_owned()
        .collect::<std::collections::HashMap<_, _>>();
    let parts = url.path().trim_matches('/').split('/').collect::<Vec<_>>();
    let s = backend.snapshot()["settings"].clone();
    match (method, parts.as_slice()) {
        ("GET", ["state"]) => Ok(backend.snapshot()),
        ("POST", ["reconnect"]) => backend.refresh().await,
        ("POST", ["login"]) => {
            backend.engine.connect(backend.clone()).await?;
            backend
                .engine
                .call("account/login/start", json!({"type":"chatgpt"}))
                .await
        }
        ("POST", ["login", "cancel"]) => backend.engine.call("account/login/cancel", body).await,
        ("POST", ["settings"]) => {
            let allowed = [
                ("theme", vec!["dark", "light", "system"]),
                ("font", vec!["serif", "sans"]),
                ("textSize", vec!["small", "medium", "large"]),
                ("width", vec!["narrow", "medium", "wide"]),
                ("approvalPolicy", vec!["on-request", "untrusted"]),
                (
                    "effort",
                    vec![
                        "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
                    ],
                ),
            ];
            for (key, values) in allowed {
                if let Some(value) = body.get(key) {
                    if !values.contains(&value.as_str().unwrap_or("")) {
                        return Err(format!("Invalid {key}."));
                    }
                }
            }
            let mut values = body.as_object().ok_or("Invalid settings.")?.clone();
            if let Some(path) = values.get("workspace") {
                values.insert(
                    "workspace".into(),
                    json!(store::directory(
                        path.as_str().ok_or("Invalid folder path.")?
                    )?),
                );
            }
            if let Some(model) = values.get("model") {
                let snapshot = backend.snapshot();
                if !snapshot["models"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .any(|m| m["model"] == *model || m["id"] == *model)
                {
                    return Err(
                        "This model is no longer available. Choose a model from the selector."
                            .into(),
                    );
                }
            }
            {
                let mut state = backend.state.lock().unwrap();
                for (key, value) in values {
                    if let Some(existing) = state["settings"].get(&key) {
                        if existing.is_string() != value.is_string()
                            || existing.is_boolean() != value.is_boolean()
                        {
                            return Err(format!("Invalid {key}."));
                        }
                        state["settings"][&key] = value;
                    }
                }
            }
            backend.persist();
            backend.broadcast();
            Ok(backend.snapshot()["settings"].clone())
        }
        ("POST", ["workspaces"]) => Ok(add_workspace(
            &backend,
            store::directory(string(&body, "path"))?,
        )),
        ("POST", ["workspaces", "choose"]) => {
            let app = backend.app.clone();
            let picked = tauri::async_runtime::spawn_blocking(move || {
                app.dialog().file().blocking_pick_folder()
            })
            .await
            .map_err(|e| e.to_string())?;
            match picked {
                Some(folder) => Ok(add_workspace(
                    &backend,
                    store::directory(
                        folder
                            .into_path()
                            .map_err(|e| e.to_string())?
                            .to_str()
                            .ok_or("Invalid folder path.")?,
                    )?,
                )),
                None => Ok(json!({"canceled":true})),
            }
        }
        ("POST", ["engine", "choose"]) => {
            let app = backend.app.clone();
            let picked = tauri::async_runtime::spawn_blocking(move || {
                app.dialog().file().blocking_pick_file()
            })
            .await
            .map_err(|e| e.to_string())?;
            match picked {
                Some(file) => Ok(json!({"path":file.into_path().map_err(|e|e.to_string())?})),
                None => Ok(json!({"canceled":true})),
            }
        }
        ("POST", ["engine", "restart"]) => {
            backend.disconnected();
            backend.engine.stop().await;
            backend.engine.resumed.lock().await.clear();
            backend.refresh().await
        }
        ("POST", ["chats"]) => {
            let workspace = store::directory(
                body["workspace"]
                    .as_str()
                    .unwrap_or(string(&s, "workspace")),
            )?;
            let chat = json!({"id":Uuid::new_v4().to_string(),"title":"New conversation","workspace":workspace,"mode":if body["mode"]=="work"{"work"}else{"chat"},"items":[],"createdAt":store::now(),"updatedAt":store::now(),"status":"idle","threadId":null,"activeTurnId":null,"pinned":false,"archived":false});
            backend.state.lock().unwrap()["chats"]
                .as_array_mut()
                .unwrap()
                .insert(0, chat.clone());
            backend.persist();
            backend.broadcast();
            Ok(chat)
        }
        ("PATCH", ["chats", id]) => {
            let result = backend.edit_chat(id, |chat| {
                if let Some(title) = body["title"].as_str() {
                    if !title.trim().is_empty() {
                        chat["title"] = json!(title.trim().chars().take(120).collect::<String>());
                    }
                }
                for key in ["pinned", "archived"] {
                    if body[key].is_boolean() {
                        chat[key] = body[key].clone();
                    }
                }
            })?;
            backend.persist();
            backend.broadcast();
            Ok(result)
        }
        ("DELETE", ["chats", id]) => {
            if backend.chat(id)?["status"] == "running" {
                return Err("Stop the response before deleting this conversation.".into());
            }
            backend.state.lock().unwrap()["chats"]
                .as_array_mut()
                .unwrap()
                .retain(|c| c["id"] != *id);
            backend.persist();
            backend.broadcast();
            Ok(json!({"ok":true}))
        }
        ("POST", ["chats", id, "message"]) => send_message(backend, id, body).await,
        ("POST", ["chats", id, "stop"]) => {
            let chat = backend.chat(id)?;
            let turn = chat["activeTurnId"].clone();
            if !turn.is_null() {
                for attempt in 0..25 {
                    if backend.chat(id)?["status"] != "running" {
                        break;
                    }
                    match backend
                        .engine
                        .call(
                            "turn/interrupt",
                            json!({"threadId":chat["threadId"],"turnId":turn}),
                        )
                        .await
                    {
                        Ok(_) => break,
                        Err(error) if error.contains("no active turn") && attempt < 24 => {
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await
                        }
                        Err(error) => return Err(error),
                    }
                }
            }
            Ok(json!({"ok":true}))
        }
        ("POST", ["approvals", id]) => {
            let approval = backend
                .approvals
                .lock()
                .unwrap()
                .get(*id)
                .cloned()
                .ok_or("This request has already been handled.")?;
            let decision = string(&body, "decision");
            if !["accept", "decline", "cancel"].contains(&decision) {
                return Err("Choose Allow, Deny, or Cancel.".into());
            }
            let result = match string(&approval, "method") {
                "item/tool/requestUserInput" => {
                    let mut answers = serde_json::Map::new();
                    for q in approval["params"]["questions"]
                        .as_array()
                        .unwrap_or(&vec![])
                    {
                        let key = string(q, "id");
                        answers.insert(
                            key.to_owned(),
                            json!({"answers":[body["answers"][key].as_str().unwrap_or("")]}),
                        );
                    }
                    json!({"answers":answers})
                }
                "item/permissions/requestApproval" => {
                    json!({"permissions":if decision=="accept"{approval["params"]["permissions"].clone()}else{json!({})},"scope":"turn"})
                }
                "mcpServer/elicitation/request" => {
                    json!({"action":"decline","content":null,"_meta":null})
                }
                _ => json!({"decision":decision}),
            };
            backend
                .engine
                .send(json!({"id":approval["id"],"result":result}))
                .await?;
            backend.approvals.lock().unwrap().remove(*id);
            backend.broadcast();
            Ok(json!({"ok":true}))
        }
        ("GET", ["skills"]) => {
            backend.engine.connect(backend.clone()).await?;
            let workspace = query
                .get("workspace")
                .map(String::as_str)
                .unwrap_or(string(&s, "workspace"));
            let directory = store::directory(workspace)?;
            backend
                .engine
                .call("skills/list", json!({"cwds":[directory]}))
                .await
        }
        ("GET", ["usage"]) => {
            backend.engine.connect(backend.clone()).await?;
            backend
                .engine
                .call("account/rateLimits/read", json!({}))
                .await
        }
        ("GET", ["files"]) => {
            let workspace = query
                .get("workspace")
                .map(String::as_str)
                .unwrap_or(string(&s, "workspace"));
            let root = known_workspace(&backend, workspace)?;
            let dir = store::scoped(
                workspace,
                query.get("path").map(String::as_str).unwrap_or(""),
            )?;
            let mut files = vec![];
            for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let kind = entry.file_type().map_err(|e| e.to_string())?;
                if [
                    ".git",
                    ".data",
                    "node_modules",
                    "dist",
                    "target",
                    ".DS_Store",
                ]
                .contains(&name.as_str())
                    || kind.is_symlink()
                {
                    continue;
                }
                files.push(json!({"name":name,"path":entry.path().strip_prefix(&root).map_err(|e|e.to_string())?.to_string_lossy().replace('\\',"/"),"directory":kind.is_dir()}));
            }
            files.sort_by(|a, b| {
                b["directory"]
                    .as_bool()
                    .cmp(&a["directory"].as_bool())
                    .then(string(a, "name").cmp(string(b, "name")))
            });
            Ok(
                json!({"path":dir.strip_prefix(root).map_err(|e|e.to_string())?.to_string_lossy().replace('\\',"/"),"files":files}),
            )
        }
        ("GET", ["file"]) => {
            let workspace = query
                .get("workspace")
                .map(String::as_str)
                .unwrap_or(string(&s, "workspace"));
            known_workspace(&backend, workspace)?;
            let file = store::scoped(
                workspace,
                query.get("path").map(String::as_str).unwrap_or(""),
            )?;
            let meta = fs::metadata(&file).map_err(|e| e.to_string())?;
            if !meta.is_file() || meta.len() > 512000 {
                return Err("Select a text file under 500 KB to preview.".into());
            }
            let content = fs::read_to_string(&file).map_err(|_| {
                "This is a binary file. Text previews are available for source files and documents."
            })?;
            Ok(
                json!({"content":content,"name":file.file_name().unwrap().to_string_lossy(),"size":meta.len()}),
            )
        }
        ("POST", ["uploads"]) => {
            let name = PathBuf::from(string(&body, "name"))
                .file_name()
                .ok_or("Invalid attachment name.")?
                .to_string_lossy()
                .chars()
                .take(180)
                .collect::<String>();
            let mime = string(&body, "type");
            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime)
                && !mime.starts_with("text/")
                && ![
                    "txt", "md", "csv", "json", "js", "ts", "tsx", "jsx", "py", "html", "css",
                    "yaml", "yml", "toml", "xml", "sql", "sh", "log",
                ]
                .contains(&ext.as_str())
            {
                return Err("Attach an image, text document, or source file. PDF and Word files are not supported yet.".into());
            }
            let bytes = STANDARD
                .decode(string(&body, "data"))
                .map_err(|_| "Invalid attachment data.")?;
            if bytes.len() > 10 * 1024 * 1024 {
                return Err("Each attachment must be under 10 MB.".into());
            }
            let id = Uuid::new_v4().to_string();
            let dir = backend.directory.join("uploads");
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = dir.join(format!("{id}.{ext}"));
            fs::write(&path, bytes).map_err(|e| e.to_string())?;
            let meta = json!({"id":id,"name":name,"type":mime,"path":path});
            fs::write(dir.join(format!("{id}.meta.json")), meta.to_string())
                .map_err(|e| e.to_string())?;
            Ok(json!({"id":id,"name":name,"type":mime}))
        }
        ("GET", ["export"]) => {
            let state = backend.snapshot();
            Ok(
                json!({"settings":state["settings"],"chats":state["chats"],"workspaces":state["workspaces"]}),
            )
        }
        ("POST", ["clear"]) => {
            if backend.snapshot()["chats"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["status"] == "running")
            {
                return Err("Stop active responses before clearing conversations.".into());
            }
            backend.state.lock().unwrap()["chats"] = json!([]);
            backend.persist();
            backend.broadcast();
            Ok(json!({"ok":true}))
        }
        _ => Err(format!("Unsupported request: {method} {path}")),
    }
}
async fn send_message(backend: Arc<Backend>, id: &str, body: Value) -> Result<Value, String> {
    let chat = backend.chat(id)?;
    if chat["status"] == "running" {
        return Err("Wait for the response or press Stop before sending another message.".into());
    }
    let text = string(&body, "text").trim();
    let attachments = body["attachments"].as_array().cloned().unwrap_or_default();
    if text.is_empty() && attachments.is_empty() {
        return Err("Write a message or attach a file first.".into());
    }
    if text.len() > 200000 {
        return Err("This message is too long. Attach a text file instead.".into());
    }
    backend.engine.connect(backend.clone()).await?;
    let snapshot = backend.snapshot();
    let settings = &snapshot["settings"];
    let model_id = body["model"].as_str().unwrap_or(string(settings, "model"));
    let model = snapshot["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .find(|m| m["model"] == model_id || m["id"] == model_id)
        .cloned()
        .ok_or("Choose an available model in Settings → Codex.")?;
    let requested = body["effort"]
        .as_str()
        .unwrap_or(string(settings, "effort"));
    let effort = if model["supportedReasoningEfforts"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .any(|e| e["reasoningEffort"] == requested)
    {
        json!(requested)
    } else {
        model["defaultReasoningEffort"].clone()
    };
    let workspace = store::directory(string(&chat, "workspace"))?;
    let mut input = vec![
        json!({"type":"text","text":if text.is_empty(){"Please review the attached files."}else{text}}),
    ];
    let mut displayed = vec![];
    for file in attachments.iter().take(8) {
        let meta = upload_metadata(&backend, string(file, "id"))?;
        displayed.push(json!({"id":meta["id"],"name":meta["name"],"type":meta["type"]}));
        if string(&meta, "type").starts_with("image/") {
            input.push(json!({"type":"localImage","path":meta["path"]}));
        } else {
            let content = fs::read_to_string(string(&meta, "path"))
                .map_err(|_| "This attachment is not a text file.")?;
            input.push(json!({"type":"text","text":format!("Attached file: {}\n\n{content}",string(&meta,"name"))}));
        }
    }
    if body["skill"].is_object() {
        let result = backend
            .engine
            .call("skills/list", json!({"cwds":[workspace]}))
            .await?;
        let skill = result["data"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .flat_map(|d| d["skills"].as_array().cloned().unwrap_or_default())
            .find(|s| s["path"] == body["skill"]["path"] && s["enabled"] != false)
            .ok_or("This skill is no longer available.")?;
        input.push(json!({"type":"skill","name":skill["name"],"path":skill["path"]}));
    }
    let mut config = json!({"model":model_id,"cwd":workspace,"sandbox":if chat["mode"]=="work"{"workspace-write"}else{"read-only"},"approvalPolicy":settings["approvalPolicy"],"approvalsReviewer":"user","developerInstructions":format!("You are the assistant in ClaudeX, a personal local Codex client. Keep explanations clear and concise. Use Markdown when helpful.\n\n{}",string(settings,"customInstructions"))});
    let thread = if chat["threadId"].is_null() {
        let r = backend.engine.call("thread/start", config.clone()).await?;
        let thread = r["thread"]["id"]
            .as_str()
            .ok_or("Codex did not return a thread ID.")?
            .to_owned();
        backend.edit_chat(id, |c| c["threadId"] = json!(thread))?;
        backend.engine.resumed.lock().await.insert(thread.clone());
        thread
    } else {
        let thread = string(&chat, "threadId").to_owned();
        let resumed = backend.engine.resumed.lock().await.contains(&thread);
        if !resumed {
            config["threadId"] = json!(thread);
            config["excludeTurns"] = json!(true);
            backend.engine.call("thread/resume", config).await?;
            backend.engine.resumed.lock().await.insert(thread.clone());
        }
        thread
    };
    let updated=backend.edit_chat(id,|c|{c["items"].as_array_mut().unwrap().push(json!({"id":Uuid::new_v4().to_string(),"type":"userMessage","clientPending":true,"content":[{"type":"text","text":text}],"attachments":displayed}));c["status"]=json!("running");c["error"]=Value::Null;c["updatedAt"]=json!(store::now());c["model"]=json!(model_id);c["effort"]=effort.clone();if c["title"]=="New conversation"{c["title"]=json!(text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(60).collect::<String>());}})?;
    backend.persist();
    backend.emit(json!({"type":"chat","chat":updated}));
    let sandbox = if chat["mode"] == "work" {
        json!({"type":"workspaceWrite","writableRoots":[workspace],"networkAccess":false})
    } else {
        json!({"type":"readOnly","networkAccess":true})
    };
    match backend.engine.call("turn/start",json!({"threadId":thread,"input":input,"model":model_id,"effort":effort,"approvalPolicy":settings["approvalPolicy"],"approvalsReviewer":"user","sandboxPolicy":sandbox})).await{
        Ok(result)=>{let updated=backend.edit_chat(id,|c|{if c["status"]=="running"{c["activeTurnId"]=result["turn"]["id"].clone();}})?;backend.emit(json!({"type":"chat","chat":updated}));Ok(json!({"ok":true,"turnId":result["turn"]["id"]}))},
        Err(error)=>{backend.edit_chat(id,|c|{c["status"]=json!("failed");c["error"]=json!(friendly_error(&json!(error)));c["activeTurnId"]=Value::Null;})?;backend.persist();backend.broadcast();Err(error)}
    }
}
