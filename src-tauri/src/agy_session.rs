use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn log_path(app_handle: &tauri::AppHandle, session_id: &str) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("agy-logs");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let safe_id: String = session_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    Ok(dir.join(format!("{safe_id}.log")))
}

pub fn is_valid_conversation(home: &Path, conversation_id: &str) -> bool {
    let trimmed = conversation_id.trim();
    if uuid::Uuid::parse_str(trimmed).is_err() {
        return false;
    }
    let cli_dir = home.join(".gemini/antigravity-cli");
    let conv_db = cli_dir.join("conversations").join(format!("{trimmed}.db"));
    let brain_dir = cli_dir.join("brain").join(trimmed);
    conv_db.exists() || brain_dir.exists()
}

pub fn extract_conversation_id(output: &str) -> Option<String> {
    let mut latest = None;
    for separator in [
        "--conversation=",
        "--conversation ",
        "Created conversation ",
        "for conversation ",
        "Resuming conversation ",
        "Streaming conversation ",
        "found conversation ",
        "to conversation ",
    ] {
        for (index, _) in output.match_indices(separator) {
            let tail = &output[index + separator.len()..];
            let candidate: String = tail
                .trim_start()
                .chars()
                .take_while(|character| character.is_ascii_alphanumeric() || *character == '-')
                .collect();
            if uuid::Uuid::parse_str(&candidate).is_ok() {
                if latest
                    .as_ref()
                    .map_or(true, |(latest_index, _)| index > *latest_index)
                {
                    latest = Some((index, candidate));
                }
            }
        }
    }
    latest.map(|(_, id)| id)
}

pub fn read_conversation_id(path: &Path) -> Option<String> {
    BufReader::new(fs::File::open(path).ok()?)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| extract_conversation_id(&line))
        .last()
}

#[derive(serde::Deserialize)]
struct HistoryEntry {
    workspace: Option<String>,
    #[serde(rename = "conversationId")]
    conversation_id: Option<String>,
    timestamp: Option<u64>,
}

fn paths_match(a: &str, b: &str) -> bool {
    let clean_a = a.trim_end_matches('/');
    let clean_b = b.trim_end_matches('/');
    if clean_a == clean_b {
        return true;
    }
    if let (Ok(can_a), Ok(can_b)) = (fs::canonicalize(clean_a), fs::canonicalize(clean_b)) {
        return can_a == can_b;
    }
    false
}

pub fn resolve_latest_conversation_for_workspace(home: &Path, cwd: &str) -> Option<String> {
    let history_path = home.join(".gemini/antigravity-cli/history.jsonl");
    let file = fs::File::open(history_path).ok()?;
    let reader = BufReader::new(file);

    let mut latest: Option<(u64, String)> = None;

    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let entry: HistoryEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let Some(ws) = entry.workspace else { continue };
        let Some(cid) = entry.conversation_id else { continue };

        if paths_match(&ws, cwd) && is_valid_conversation(home, &cid) {
            let ts = entry.timestamp.unwrap_or(0);
            if latest.as_ref().map_or(true, |(latest_ts, _)| ts >= *latest_ts) {
                latest = Some((ts, cid));
            }
        }
    }

    latest.map(|(_, id)| id)
}

pub async fn heal_agy_sessions(pool: &sqlx::SqlitePool, home: &Path) {
    let rows = match sqlx::query("SELECT id, remote_session_id, cwd FROM sessions WHERE agent_type = 'agy'")
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to fetch agy sessions for healing: {e}");
            return;
        }
    };

    use sqlx::Row;
    for row in rows {
        let id: String = row.get("id");
        let rid: Option<String> = row.get("remote_session_id");
        let cwd: String = row.get("cwd");

        let is_valid = rid
            .as_deref()
            .map_or(false, |id| is_valid_conversation(home, id));

        if !is_valid {
            let real_id = resolve_latest_conversation_for_workspace(home, &cwd);
            let _ = sqlx::query("UPDATE sessions SET remote_session_id = $1 WHERE id = $2")
                .bind(&real_id)
                .bind(&id)
                .execute(pool)
                .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_id_from_agy_output_and_log() {
        let id = "8facf928-14fa-4df5-937f-cb2602815158";
        assert_eq!(
            extract_conversation_id(&format!(
                "Resume with -c (or command below):\r\nagy --conversation={id}\r\n"
            )),
            Some(id.into())
        );
        assert_eq!(
            extract_conversation_id(&format!(
                "Created conversation 11111111-1111-4111-8111-111111111111\nERROR: logging before google.Init: server.go:1074] Created conversation {id}"
            )),
            Some(id.into())
        );
        assert_eq!(
            extract_conversation_id(&format!(
                "I0903 13:21:28.598045 520 manager.go:883] Full redraw completed (rerenderAll) for conversation {id} (epoch 0, items 1)"
            )),
            Some(id.into())
        );
        assert_eq!(
            extract_conversation_id(&format!(
                "I0902 09:42:13.808127 1 common.go:385] Resuming conversation {id}"
            )),
            Some(id.into())
        );
    }

    #[test]
    fn validates_and_resolves_workspace_conversation() {
        let temp_dir = std::env::temp_dir().join(format!("tde-agy-test-{}", uuid::Uuid::new_v4()));
        let gemini_dir = temp_dir.join(".gemini/antigravity-cli");
        let convs_dir = gemini_dir.join("conversations");
        fs::create_dir_all(&convs_dir).unwrap();

        let valid_id = "a8688a9e-3434-4213-b274-d1ac3cd824e4";
        let invalid_id = "e0a11ad6-c0f1-4c8e-91f7-b4b8787296f7";

        fs::write(convs_dir.join(format!("{valid_id}.db")), b"").unwrap();

        assert_eq!(is_valid_conversation(&temp_dir, valid_id), true);
        assert_eq!(is_valid_conversation(&temp_dir, invalid_id), false);
        assert_eq!(is_valid_conversation(&temp_dir, "invalid-uuid"), false);

        let history_file = gemini_dir.join("history.jsonl");
        let history_data = format!(
            "{{\"workspace\":\"/repo/story\",\"conversationId\":\"{}\",\"timestamp\":100}}\n{{\"workspace\":\"/repo/story\",\"conversationId\":\"{}\",\"timestamp\":200}}\n",
            invalid_id, valid_id
        );
        fs::write(&history_file, history_data).unwrap();

        let resolved = resolve_latest_conversation_for_workspace(&temp_dir, "/repo/story");
        assert_eq!(resolved, Some(valid_id.to_string()));

        let missing = resolve_latest_conversation_for_workspace(&temp_dir, "/repo/unknown");
        assert_eq!(missing, None);

        let _ = fs::remove_dir_all(temp_dir);
    }
}
