use crate::Backend;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    time::{timeout, Duration},
};
pub struct Engine {
    pub ready: AtomicBool,
    sequence: AtomicU64,
    generation: AtomicU64,
    startup: Mutex<()>,
    writer: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    pub resumed: Mutex<HashSet<String>>,
}
impl Engine {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            ready: AtomicBool::new(false),
            sequence: AtomicU64::new(0),
            generation: AtomicU64::new(0),
            startup: Mutex::new(()),
            writer: Mutex::new(None),
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            resumed: Mutex::new(HashSet::new()),
        })
    }
    pub async fn connect(self: &Arc<Self>, backend: Arc<Backend>) -> Result<(), String> {
        let configured = backend.snapshot()["settings"]["enginePath"]
            .as_str()
            .unwrap_or("")
            .to_owned();
        let notify = backend.clone();
        self.connect_transport(
            &configured,
            Arc::new(move |message| notify.notification(message)),
            Arc::new(move || backend.disconnected()),
        )
        .await
    }
    pub async fn connect_transport(
        self: &Arc<Self>,
        configured: &str,
        notification: Arc<dyn Fn(Value) + Send + Sync>,
        disconnected: Arc<dyn Fn() + Send + Sync>,
    ) -> Result<(), String> {
        let _guard = self.startup.lock().await;
        if self.ready.load(Ordering::SeqCst) {
            return Ok(());
        }
        let binary = find_binary(configured)?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut command = Command::new(&binary);
        command
            .args(["app-server", "--listen", "stdio://"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|e| {
            format!("Could not start Codex: {e}. Choose a Codex executable in Settings → Account.")
        })?;
        *self.writer.lock().await = child.stdin.take();
        let stdout = child
            .stdout
            .take()
            .ok_or("Codex did not provide an output stream.")?;
        *self.child.lock().await = Some(child);
        let engine = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if engine.generation.load(Ordering::SeqCst) != generation {
                    return;
                }
                if let Ok(message) = serde_json::from_str::<Value>(&line) {
                    if message["method"].is_string() {
                        notification(message);
                    } else if let Some(id) = message["id"].as_u64() {
                        if let Some(sender) = engine.pending.lock().await.remove(&id) {
                            let result = if message["error"].is_object() {
                                Err(message["error"]["message"]
                                    .as_str()
                                    .unwrap_or("Codex request failed.")
                                    .to_owned())
                            } else {
                                Ok(message["result"].clone())
                            };
                            let _ = sender.send(result);
                        }
                    }
                }
            }
            if engine.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            engine.ready.store(false, Ordering::SeqCst);
            engine.resumed.lock().await.clear();
            for (_, sender) in engine.pending.lock().await.drain() {
                let _ = sender.send(Err(
                    "Codex disconnected. Reconnect in Settings → Account.".into()
                ));
            }
            disconnected();
        });
        self.call("initialize",json!({"clientInfo":{"name":"claudex_desktop","title":"ClaudeGPT","version":"0.1.0"},"capabilities":{"experimentalApi":true}})).await?;
        self.send(json!({"method":"initialized","params":{}}))
            .await?;
        self.ready.store(true, Ordering::SeqCst);
        Ok(())
    }
    pub async fn send(&self, value: Value) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        let writer = writer
            .as_mut()
            .ok_or("Codex is disconnected. Reconnect in Settings → Account.")?;
        writer
            .write_all(format!("{value}\n").as_bytes())
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .send(json!({"id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(Duration::from_secs(45), receiver).await {
            Ok(Ok(result)) => result,
            _ => {
                self.pending.lock().await.remove(&id);
                Err(format!(
                    "Codex took too long to respond to {method}. Try reconnecting."
                ))
            }
        }
    }
    pub async fn stop(&self) {
        self.ready.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.resumed.lock().await.clear();
        for (_, sender) in self.pending.lock().await.drain() {
            let _ = sender.send(Err("Codex connection was restarted.".into()));
        }
        self.writer.lock().await.take();
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.kill().await;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Uses the installed Codex account and a small amount of inference allowance"]
    async fn live_rust_transport_streams_and_resumes() {
        let engine = Engine::new();
        let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
        engine
            .connect_transport(
                "",
                Arc::new(move |m| {
                    let _ = sender.send(m);
                }),
                Arc::new(|| {}),
            )
            .await
            .unwrap();
        let catalog = engine
            .call("model/list", json!({"limit":100}))
            .await
            .unwrap();
        let model = catalog["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["isDefault"] == true)
            .or(catalog["data"].as_array().unwrap().first())
            .unwrap()["model"]
            .clone();
        let thread=engine.call("thread/start",json!({"model":model,"cwd":std::env::temp_dir(),"sandbox":"read-only","approvalPolicy":"on-request"})).await.unwrap()["thread"]["id"].clone();
        engine.call("turn/start",json!({"threadId":thread,"model":model,"effort":"low","input":[{"type":"text","text":"Reply with exactly: ClaudeGPT Rust transport works. Do not use tools."}]})).await.unwrap();
        let mut text = String::new();
        let completed = timeout(Duration::from_secs(90), async {
            while let Some(message) = receiver.recv().await {
                match message["method"].as_str().unwrap_or("") {
                    "item/agentMessage/delta" => {
                        text.push_str(message["params"]["delta"].as_str().unwrap_or(""))
                    }
                    "turn/completed" => {
                        assert_eq!(message["params"]["turn"]["status"], "completed");
                        break;
                    }
                    _ => {}
                }
            }
        })
        .await;
        assert!(completed.is_ok());
        assert_eq!(text, "ClaudeGPT Rust transport works.");
        engine
            .call(
                "thread/resume",
                json!({"threadId":thread,"excludeTurns":true}),
            )
            .await
            .unwrap();
        engine
            .call("thread/archive", json!({"threadId":thread}))
            .await
            .unwrap();
        engine.stop().await;
    }
}
pub fn find_binary(configured: &str) -> Result<PathBuf, String> {
    if !configured.trim().is_empty() {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok(path);
        }
        return Err("The configured Codex executable was not found.".into());
    }
    if let Some(value) = std::env::var_os("CLAUDEX_CODEX_BIN") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Ok(path);
        }
    }
    #[cfg(target_os = "macos")]
    for file in [
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
    ] {
        let path = PathBuf::from(file);
        if path.is_file() {
            return Ok(path);
        }
    }
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    for folder in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let path = folder.join(name);
        if path.is_file() {
            return Ok(path);
        }
    }
    #[cfg(windows)]
    {
        fn search(root: &std::path::Path, depth: u8) -> Option<PathBuf> {
            if depth == 0 {
                return None;
            }
            let entries = std::fs::read_dir(root).ok()?;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.file_name().and_then(|s| s.to_str()) == Some("codex.exe") {
                    return Some(path);
                }
                if path.is_dir() {
                    if let Some(found) = search(&path, depth - 1) {
                        return Some(found);
                    }
                }
            }
            None
        }
        if let Some(appdata) = dirs::config_dir() {
            if let Some(found) = search(&appdata.join("npm/node_modules/@openai"), 8) {
                return Ok(found);
            }
        }
    }
    Err("Codex was not found. Install the Codex CLI, then choose its executable in Settings → Account.".into())
}
