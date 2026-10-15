use crate::{engine::Engine, Backend};
use serde_json::{json, Value};
use std::sync::Arc;

pub async fn list(engine: &Engine) -> Result<Vec<(Value, bool)>, String> {
    let mut threads = Vec::new();
    for archived in [false, true] {
        let mut cursor = Value::Null;
        loop {
            let page = engine.call("thread/list", json!({"limit":100,"cursor":cursor,"archived":archived,"sortKey":"updated_at","sourceKinds":["cli","vscode","appServer","unknown"]})).await?;
            for thread in page["data"]
                .as_array()
                .ok_or("Codex returned an invalid thread list.")?
            {
                threads.push((thread.clone(), archived));
            }
            let next = page["nextCursor"].clone();
            if next.is_null() {
                break;
            }
            if next == cursor {
                return Err("Codex returned a repeated history cursor.".into());
            }
            cursor = next;
        }
    }
    Ok(threads)
}

pub fn merge(state: &mut Value, threads: Vec<(Value, bool)>) {
    let known: std::collections::HashSet<String> = threads
        .iter()
        .filter_map(|(t, _)| t["id"].as_str().map(str::to_owned))
        .collect();
    state["chats"].as_array_mut().unwrap().retain(|chat| {
        chat["codexHistory"] != true
            || chat["status"] == "running"
            || chat["threadId"]
                .as_str()
                .is_some_and(|id| known.contains(id))
    });
    for (thread, archived) in threads {
        let id = thread["id"].clone();
        if !id.is_string() {
            continue;
        }
        let title = thread["name"]
            .as_str()
            .filter(|s| !s.is_empty())
            .or(thread["preview"].as_str().filter(|s| !s.is_empty()))
            .unwrap_or("Codex conversation");
        if thread["cwd"].is_string() {
            let workspaces = state["workspaces"].as_array_mut().unwrap();
            if !workspaces.contains(&thread["cwd"]) {
                workspaces.push(thread["cwd"].clone());
            }
        }
        let chats = state["chats"].as_array_mut().unwrap();
        if let Some(chat) = chats.iter_mut().find(|c| c["threadId"] == id) {
            if chat["status"] != "running" {
                chat["title"] = json!(title);
                chat["archived"] = json!(archived);
                chat["codexProjectId"] = thread["projectId"].clone();
                chat["recencyAt"] = json!(
                    thread["recencyAt"]
                        .as_i64()
                        .unwrap_or(thread["updatedAt"].as_i64().unwrap_or(0))
                        * 1000
                );
                chat["updatedAt"] = json!(thread["updatedAt"].as_i64().unwrap_or(0) * 1000);
            }
        } else {
            chats.push(json!({"id":id,"threadId":id,"title":title,"workspace":thread["cwd"],"mode":"work","items":[],"createdAt":thread["createdAt"].as_i64().unwrap_or(0)*1000,"updatedAt":thread["updatedAt"].as_i64().unwrap_or(0)*1000,"status":"idle","activeTurnId":null,"pinned":false,"archived":archived,"codexHistory":true,"codexProjectId":thread["projectId"],"recencyAt":thread["recencyAt"].as_i64().unwrap_or(thread["updatedAt"].as_i64().unwrap_or(0))*1000,"model":thread["model"],"effort":thread["reasoningEffort"]}));
        }
    }
}

pub async fn sync(backend: &Arc<Backend>) -> Result<(), String> {
    let threads = list(&backend.engine).await?;
    let project_list = projects(&backend.engine).await;
    let metadata = desktop_metadata();
    {
        let mut state = backend.state.lock().unwrap();
        merge(&mut state, threads);
        match project_list {
            Ok(projects) => {
                apply_projects(&mut state, projects, &metadata);
                state["historyWarning"] = Value::Null;
            }
            Err(error) => {
                state["historyWarning"] = json!(format!("Project grouping unavailable: {error}"));
            }
        }
    }
    backend.persist();
    backend.broadcast();
    Ok(())
}

pub async fn items(engine: &Engine, id: &str) -> Result<Vec<Value>, String> {
    let read = engine
        .call("thread/read", json!({"threadId":id,"includeTurns":false}))
        .await?;
    let mut turns = Vec::new();
    if read["thread"]["historyMode"] == "paginated" {
        turns.clear();
        let mut cursor = Value::Null;
        loop {
            let page = engine.call("thread/turns/list", json!({"threadId":id,"cursor":cursor,"limit":100,"sortDirection":"asc","itemsView":"full"})).await?;
            turns.extend(page["data"].as_array().cloned().unwrap_or_default());
            let next = page["nextCursor"].clone();
            if next.is_null() {
                break;
            }
            if next == cursor {
                return Err("Codex returned a repeated turn cursor.".into());
            }
            cursor = next;
        }
    } else {
        let full = engine
            .call("thread/read", json!({"threadId":id,"includeTurns":true}))
            .await?;
        turns = full["thread"]["turns"]
            .as_array()
            .cloned()
            .unwrap_or_default();
    }
    Ok(turns
        .iter()
        .flat_map(|turn| {
            turn["items"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|mut item| {
                    item["turnId"] = turn["id"].clone();
                    item
                })
                .collect::<Vec<_>>()
        })
        .collect())
}

pub async fn hydrate(backend: &Arc<Backend>, id: &str) -> Result<Value, String> {
    let chat = backend.chat(id)?;
    if chat["threadId"].is_string() && chat["status"] != "running" {
        let mut items = items(&backend.engine, chat["threadId"].as_str().unwrap()).await?;
        // Preserve local attachment references when replacing the render cache.
        for item in &mut items {
            if let Some(old) = chat["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|i| i["id"] == item["id"])
            {
                if old["attachments"].is_array() {
                    item["attachments"] = old["attachments"].clone();
                }
            }
        }
        backend.edit_chat(id, |chat| {
            if chat["status"] != "running" {
                chat["items"] = json!(items);
            }
        })?;
        backend.persist();
        backend.broadcast();
    }
    backend.chat(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merge_preserves_live_turns_and_matches_original_ids() {
        let mut state = crate::store::defaults();
        state["chats"] = json!([{"id":"local","threadId":"existing","title":"Live","status":"running","items":[{"id":"item"}],"pinned":true}]);
        merge(
            &mut state,
            vec![
                (
                    json!({"id":"existing","name":"Changed","updatedAt":2}),
                    false,
                ),
                (
                    json!({"id":"original","name":"Saved title","cwd":"/tmp","createdAt":1,"updatedAt":2}),
                    true,
                ),
            ],
        );
        assert_eq!(state["chats"][0]["title"], "Live");
        assert_eq!(state["chats"][0]["items"].as_array().unwrap().len(), 1);
        assert_eq!(state["chats"][1]["threadId"], "original");
        assert_eq!(state["chats"][1]["updatedAt"], 2000);
        assert_eq!(state["chats"][1]["archived"], true);
        merge(
            &mut state,
            vec![(
                json!({"id":"original","name":"Renamed","updatedAt":3}),
                false,
            )],
        );
        assert_eq!(state["chats"].as_array().unwrap().len(), 2);
        assert_eq!(state["chats"][1]["title"], "Renamed");
    }
    #[test]
    fn project_migration_preserves_assignment_order_and_recents() {
        let mut state = crate::store::defaults();
        state["chats"] = json!([
            {"threadId":"moved","workspace":"/other","codexProjectId":null},
            {"threadId":"loose","workspace":"/work","codexProjectId":null},
            {"threadId":"nested","workspace":"/work/tests","codexProjectId":null},
            {"threadId":"native","workspace":"/other","codexProjectId":"canonical"}
        ]);
        let metadata = json!({"project-order":["legacy"],"app-server-project-id-by-legacy-project-id-by-host":{"local:test":{"legacy":"canonical"}},"thread-project-assignments":{"moved":{"projectKind":"local","projectId":"legacy"}},"projectless-thread-ids":["loose"]});
        apply_projects(
            &mut state,
            vec![
                json!({"id":"second","roots":[]}),
                json!({"id":"canonical","roots":[{"path":"/work"}]}),
            ],
            &metadata,
        );
        assert_eq!(state["projects"][0]["id"], "canonical");
        assert_eq!(state["chats"][0]["projectId"], "canonical");
        assert!(state["chats"][1]["projectId"].is_null());
        assert!(state["chats"][2]["projectId"].is_null());
        assert_eq!(state["chats"][3]["projectId"], "canonical");
    }
    #[tokio::test]
    #[ignore = "Reads local Codex history without inference or modifying threads"]
    async fn live_existing_history_is_readable() {
        let engine = Engine::new();
        engine
            .connect_transport("", Arc::new(|_| {}), Arc::new(|| {}))
            .await
            .unwrap();
        let threads = list(&engine).await.unwrap();
        assert!(
            !threads.is_empty(),
            "No saved Codex history available to verify"
        );
        let project_list = projects(&engine).await.unwrap();
        let metadata = desktop_metadata();
        let mut state = crate::store::defaults();
        merge(&mut state, threads.clone());
        apply_projects(&mut state, project_list.clone(), &metadata);
        assert_eq!(
            state["projects"].as_array().unwrap().len(),
            project_list.len()
        );
        if let Some(assignments) = metadata["thread-project-assignments"].as_object() {
            for chat in state["chats"].as_array().unwrap() {
                let assignment = &assignments
                    .get(chat["threadId"].as_str().unwrap_or(""))
                    .cloned()
                    .unwrap_or(Value::Null);
                if assignment["projectKind"] == "local" {
                    assert!(chat["projectId"].is_string(), "Desktop assignment lost");
                }
            }
        }
        let mut readable = false;
        for (thread, _) in threads.iter().take(10) {
            if let Ok(history) = items(&engine, thread["id"].as_str().unwrap()).await {
                if !history.is_empty() {
                    readable = true;
                    break;
                }
            }
        }
        engine.stop().await;
        assert!(readable, "No saved thread transcript could be read");
    }
}

// Desktop project assignments can lag behind the app-server migration.
// Read only the local presentation metadata; never edit Codex's own files.
fn desktop_metadata() -> Value {
    let home = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|p| p.join(".codex")));
    home.and_then(|p| std::fs::read(p.join(".codex-global-state.json")).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null)
}

pub fn apply_projects(state: &mut Value, mut projects: Vec<Value>, metadata: &Value) {
    let mut mappings = std::collections::HashMap::new();
    if let Some(hosts) = metadata["app-server-project-id-by-legacy-project-id-by-host"].as_object()
    {
        for (host, mapping) in hosts {
            if host.starts_with("local:") {
                if let Some(mapping) = mapping.as_object() {
                    for (legacy, canonical) in mapping {
                        mappings.insert(legacy.clone(), canonical.clone());
                    }
                }
            }
        }
    }
    let order = metadata["project-order"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    projects.sort_by_key(|p| {
        order
            .iter()
            .position(|id| {
                id == &p["id"] || mappings.get(id.as_str().unwrap_or("")) == Some(&p["id"])
            })
            .unwrap_or(usize::MAX)
    });
    for chat in state["chats"].as_array_mut().unwrap() {
        let thread = chat["threadId"].as_str().unwrap_or("");
        let assigned = &metadata["thread-project-assignments"][thread];
        let explicit_projectless = metadata["projectless-thread-ids"]
            .as_array()
            .is_some_and(|ids| ids.contains(&json!(thread)));
        let mut project = chat["codexProjectId"].clone();
        if project.is_null() && assigned["projectKind"] == "local" {
            let legacy = assigned["projectId"].as_str().unwrap_or("");
            project = mappings.get(legacy).cloned().unwrap_or(json!(legacy));
        }
        if project.is_null() && !explicit_projectless {
            project = projects
                .iter()
                .find(|p| {
                    p["roots"].as_array().is_some_and(|roots| {
                        roots.iter().any(|root| root["path"] == chat["workspace"])
                    })
                })
                .map(|p| p["id"].clone())
                .unwrap_or(Value::Null);
        }
        chat["projectId"] = project;
    }
    state["projects"] = json!(projects);
}

async fn projects(engine: &Engine) -> Result<Vec<Value>, String> {
    let mut data = Vec::new();
    let mut cursor = Value::Null;
    loop {
        let page = engine
            .call("project/list", json!({"cursor":cursor,"limit":100}))
            .await?;
        data.extend(page["data"].as_array().cloned().unwrap_or_default());
        let next = page["nextCursor"].clone();
        if next.is_null() {
            break;
        }
        if next == cursor {
            return Err("Codex returned a repeated project cursor.".into());
        }
        cursor = next;
    }
    Ok(data)
}
