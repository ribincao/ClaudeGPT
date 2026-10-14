use crate::{engine::Engine, Backend};
use serde_json::{json, Value};
use std::sync::Arc;

pub async fn list(engine: &Engine) -> Result<Vec<(Value, bool)>, String> {
    let mut threads = Vec::new();
    for archived in [false, true] {
        let mut cursor = Value::Null;
        loop {
            let page = engine.call("thread/list", json!({"limit":100,"cursor":cursor,"archived":archived,"sortKey":"updated_at","sourceKinds":["cli","vscode","appServer","exec","unknown"]})).await?;
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
                chat["updatedAt"] = json!(thread["updatedAt"].as_i64().unwrap_or(0) * 1000);
            }
        } else {
            chats.push(json!({"id":id,"threadId":id,"title":title,"workspace":thread["cwd"],"mode":"work","items":[],"createdAt":thread["createdAt"].as_i64().unwrap_or(0)*1000,"updatedAt":thread["updatedAt"].as_i64().unwrap_or(0)*1000,"status":"idle","activeTurnId":null,"pinned":false,"archived":archived,"codexHistory":true,"model":thread["model"],"effort":thread["reasoningEffort"]}));
        }
    }
}

pub async fn sync(backend: &Arc<Backend>) -> Result<(), String> {
    let threads = list(&backend.engine).await?;
    merge(&mut backend.state.lock().unwrap(), threads);
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
