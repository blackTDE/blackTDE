use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Frame {
    #[serde(rename = "hello")]
    Hello { role: String, token: String },
    #[serde(rename = "hello_ok")]
    HelloOk {
        role: String,
        #[serde(rename = "desktopOnline")]
        desktop_online: bool,
    },
    #[serde(rename = "hello_err")]
    HelloErr { error: String },
    #[serde(rename = "rpc_req")]
    RpcReq {
        id: String,
        method: String,
        #[serde(default = "default_rpc_params")]
        params: Value,
    },
    #[serde(rename = "rpc_res")]
    RpcRes { id: String, result: Value },
    #[serde(rename = "rpc_err")]
    RpcErr {
        id: String,
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
    #[serde(rename = "stream")]
    Stream {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "dataB64")]
        data_b64: String,
    },
    #[serde(rename = "presence")]
    Presence {
        #[serde(rename = "desktopOnline")]
        desktop_online: bool,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "revoke")]
    Revoke,
}

fn default_rpc_params() -> Value {
    Value::Object(serde_json::Map::new())
}

pub fn build_pairing_url(relay_url: &str, room_id: &str, token: &str) -> String {
    let base = relay_url.trim().trim_end_matches('/');
    format!("{}/r/{}#t={}", base, room_id, token)
}

pub fn to_ws_url(relay_url: &str, room_id: &str) -> Result<String, String> {
    let base = relay_url.trim().trim_end_matches('/');
    let ws = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{}", rest)
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{}", rest)
    } else if base.starts_with("wss://") || base.starts_with("ws://") {
        base.to_string()
    } else {
        return Err("Relay URL must start with http:// or https://".into());
    };
    Ok(format!("{}/ws/{}", ws.trim_end_matches('/'), room_id))
}

pub fn control_bytes(key: &str) -> Result<Vec<u8>, String> {
    match key {
        "ctrl-c" => Ok(vec![0x03]),
        "ctrl-d" => Ok(vec![0x04]),
        "ctrl-z" => Ok(vec![0x1a]),
        "ctrl-l" => Ok(vec![0x0c]),
        "ctrl-a" => Ok(vec![0x01]),
        "ctrl-e" => Ok(vec![0x05]),
        "ctrl-u" => Ok(vec![0x15]),
        "ctrl-w" => Ok(vec![0x17]),
        "tab" => Ok(vec![0x09]),
        "esc" => Ok(vec![0x1b]),
        "enter" => Ok(vec![0x0d]),
        "backspace" => Ok(vec![0x7f]),
        "up" => Ok(vec![0x1b, 0x5b, 0x41]),
        "down" => Ok(vec![0x1b, 0x5b, 0x42]),
        "right" => Ok(vec![0x1b, 0x5b, 0x43]),
        "left" => Ok(vec![0x1b, 0x5b, 0x44]),
        "home" => Ok(vec![0x1b, 0x5b, 0x48]),
        "end" => Ok(vec![0x1b, 0x5b, 0x46]),
        "y" => Ok(vec![b'y', 0x0d]),
        "n" => Ok(vec![b'n', 0x0d]),
        other => Err(format!("Unsupported control key: {other}")),
    }
}

pub fn append_prompt_submit(text: &str) -> Vec<u8> {
    let mut bytes = text.as_bytes().to_vec();
    if !bytes.ends_with(&[b'\r']) && !bytes.ends_with(&[b'\n']) {
        bytes.push(b'\r');
    }
    bytes
}

pub fn is_path_allowed(path: &str, workspace_roots: &[String]) -> bool {
    let candidate = normalize_logical_path(path);
    if candidate.is_empty() {
        return false;
    }
    workspace_roots.iter().any(|root| {
        let prefix = normalize_logical_path(root);
        !prefix.is_empty() && (candidate == prefix || candidate.starts_with(&(prefix.clone() + "/")))
    })
}

pub fn resolve_allowed_path(path: &str, workspace_roots: &[String]) -> Result<PathBuf, String> {
    if !is_path_allowed(path, workspace_roots) {
        return Err("Path is outside a TDE workspace".into());
    }
    let candidate = Path::new(path);
    if candidate.exists() {
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("Invalid path: {e}"))?;
        let allowed = workspace_roots.iter().any(|root| {
            Path::new(root)
                .canonicalize()
                .map(|prefix| canonical.starts_with(prefix))
                .unwrap_or(false)
        });
        if !allowed {
            return Err("Path is outside a TDE workspace".into());
        }
        return Ok(canonical);
    }
    Ok(candidate.to_path_buf())
}

fn normalize_logical_path(path: &str) -> String {
    let trimmed = path.trim().replace('\\', "/");
    let mut parts = Vec::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            parts.pop();
            continue;
        }
        parts.push(part);
    }
    if trimmed.starts_with('/') {
        format!("/{}", parts.join("/"))
    } else {
        parts.join("/")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_pairing_and_ws_urls() {
        assert_eq!(
            build_pairing_url("https://tde-relay.example.workers.dev/", "room-1", "abc"),
            "https://tde-relay.example.workers.dev/r/room-1#t=abc"
        );
        assert_eq!(
            to_ws_url("http://127.0.0.1:8787", "room-1").unwrap(),
            "ws://127.0.0.1:8787/ws/room-1"
        );
    }

    #[test]
    fn maps_control_keys() {
        assert_eq!(control_bytes("ctrl-c").unwrap(), vec![0x03]);
        assert_eq!(control_bytes("left").unwrap(), vec![0x1b, 0x5b, 0x44]);
        assert_eq!(control_bytes("right").unwrap(), vec![0x1b, 0x5b, 0x43]);
        assert_eq!(control_bytes("y").unwrap(), vec![b'y', 0x0d]);
        assert!(control_bytes("boom").is_err());
    }

    #[test]
    fn rejects_workspace_escape() {
        let roots = vec!["/Users/ray/proj".to_string()];
        assert!(is_path_allowed("/Users/ray/proj/src/main.rs", &roots));
        assert!(!is_path_allowed("/Users/ray/proj/../secret", &roots));
        assert!(!is_path_allowed("/etc/passwd", &roots));
    }

    #[test]
    fn appends_carriage_return_once() {
        assert_eq!(append_prompt_submit("hello"), b"hello\r");
        assert_eq!(append_prompt_submit("hello\r"), b"hello\r");
    }

    #[test]
    fn deserializes_browser_rpc_req_frames() {
        let frame: Frame = serde_json::from_str(
            r#"{"type":"rpc_req","id":"1","method":"write_input","params":{"sessionId":"s","text":"hi"}}"#,
        )
        .unwrap();
        match frame {
            Frame::RpcReq { id, method, params } => {
                assert_eq!(id, "1");
                assert_eq!(method, "write_input");
                assert_eq!(params["sessionId"], "s");
                assert_eq!(params["text"], "hi");
            }
            other => panic!("unexpected {other:?}"),
        }

        let listed: Frame = serde_json::from_str(r#"{"type":"rpc_req","id":"2","method":"list_workspaces"}"#).unwrap();
        match listed {
            Frame::RpcReq { method, params, .. } => {
                assert_eq!(method, "list_workspaces");
                assert!(params.as_object().unwrap().is_empty());
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
