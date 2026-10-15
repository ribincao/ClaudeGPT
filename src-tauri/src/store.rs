use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn defaults() -> Value {
    let home = dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    json!({"settings":{"theme":"dark","font":"serif","textSize":"medium","width":"medium","reducedMotion":false,"displayName":"you","enterToSend":true,"model":"","effort":"medium","workspace":home,"approvalPolicy":"on-request","customInstructions":"","enginePath":""},"projects":[],"chats":[],"workspaces":[home]})
}
pub fn load(dir: &Path) -> Value {
    let _ = fs::create_dir_all(dir);
    let file = dir.join("state.json");
    let mut state = defaults();
    if let Ok(bytes) = fs::read(&file) {
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(saved) if saved["chats"].is_array() && saved["settings"].is_object() => {
                for (key, value) in saved["settings"].as_object().unwrap() {
                    state["settings"][key] = value.clone();
                }
                state["chats"] = saved["chats"].clone();
                if saved["projects"].is_array() {
                    state["projects"] = saved["projects"].clone();
                }
                state["workspaces"] = saved["workspaces"].clone();
            }
            _ => {
                let _ = fs::copy(file, dir.join(format!("state.backup-{}.json", now())));
            }
        }
    }
    for chat in state["chats"].as_array_mut().unwrap() {
        if chat["status"] == "running" {
            chat["status"] = json!("interrupted");
        }
        chat["activeTurnId"] = Value::Null;
    }
    state
}
pub fn save(dir: &Path, state: &Value) -> Result<(), String> {
    let persistent = json!({"settings":state["settings"],"chats":state["chats"],"workspaces":state["workspaces"],"projects":state["projects"]});
    let tmp = dir.join("state.tmp");
    fs::write(
        &tmp,
        serde_json::to_vec_pretty(&persistent).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if dir.join("state.json").exists() {
        fs::copy(dir.join("state.json"), dir.join("state.previous.json"))
            .map_err(|e| e.to_string())?;
        fs::remove_file(dir.join("state.json")).map_err(|e| e.to_string())?;
    }
    fs::rename(tmp, dir.join("state.json")).map_err(|e| e.to_string())
}
pub fn directory(raw: &str) -> Result<PathBuf, String> {
    let path = if raw == "~" || raw.starts_with("~/") || raw.starts_with("~\\") {
        dirs::home_dir()
            .ok_or("Cannot locate your home folder.")?
            .join(raw.get(2..).unwrap_or(""))
    } else {
        PathBuf::from(raw)
    };
    let resolved = fs::canonicalize(path)
        .map_err(|_| "That folder does not exist. Check the path and try again.")?;
    if !resolved.is_dir() {
        return Err("Choose a folder, not a file.".into());
    }
    Ok(resolved)
}
pub fn scoped(workspace: &str, file: &str) -> Result<PathBuf, String> {
    let root = directory(workspace)?;
    let resolved =
        fs::canonicalize(root.join(file)).map_err(|_| "This file could not be found.")?;
    if !resolved.starts_with(&root) {
        return Err("This file is outside the selected workspace.".into());
    }
    Ok(resolved)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_recovers_after_restart() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let mut state = defaults();
        state["chats"] = json!([{"id":"chat","status":"running","activeTurnId":"turn","items":[{"text":"Saved"}]}]);
        save(
            &{
                fs::create_dir_all(&dir).unwrap();
                dir.clone()
            },
            &state,
        )
        .unwrap();
        let recovered = load(&dir);
        assert_eq!(recovered["chats"][0]["status"], "interrupted");
        assert_eq!(recovered["chats"][0]["items"][0]["text"], "Saved");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn traversal_is_rejected() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        assert!(scoped(dir.to_str().unwrap(), "..").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
