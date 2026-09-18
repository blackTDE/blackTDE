use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
struct TenantTokenResponse {
    code: i32,
    msg: String,
    tenant_access_token: Option<String>,
    expire: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct LarkApiResponse {
    code: i32,
    msg: String,
    data: Option<LarkMessageData>,
}

#[derive(Debug, Deserialize)]
struct LarkMessageData {
    message_id: Option<String>,
}

/// Soft cap for one Lark/Feishu bot bubble. The API allows 150KB, but long
/// chat messages are hard to read on mobile. Feishu also allows at most 20 edits.
pub const LARK_MESSAGE_MAX_CHARS: usize = 4000;
pub const LARK_MESSAGE_MAX_EDITS: u32 = 20;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LarkLiveMessage {
    pub message_id: String,
    pub text: String,
    pub edit_count: u32,
}

#[derive(Debug, PartialEq, Eq)]
pub enum LarkOutbound {
    Edit { message_id: String, text: String },
    Send { text: String },
}

pub fn append_lark_text(existing: &str, incoming: &str) -> String {
    if existing.is_empty() {
        return incoming.to_string();
    }
    if incoming.is_empty() {
        return existing.to_string();
    }
    if existing.ends_with('\n') || incoming.starts_with('\n') {
        format!("{existing}{incoming}")
    } else {
        format!("{existing}\n{incoming}")
    }
}

pub fn format_lark_stream_message(title: &str, content: &str) -> String {
    format!("🖥️ [{}]\n{}", title, content)
}

pub fn next_lark_outbound(
    live: Option<&LarkLiveMessage>,
    incoming_chunk: &str,
    title: &str,
    max_chars: usize,
    max_edits: u32,
) -> LarkOutbound {
    match live {
        Some(live) => {
            let combined = append_lark_text(&live.text, incoming_chunk);
            let over_len = combined.chars().count() > max_chars;
            let over_edits = live.edit_count >= max_edits;
            if !over_len && !over_edits {
                LarkOutbound::Edit {
                    message_id: live.message_id.clone(),
                    text: combined,
                }
            } else {
                LarkOutbound::Send {
                    text: format_lark_stream_message(title, incoming_chunk),
                }
            }
        }
        None => LarkOutbound::Send {
            text: format_lark_stream_message(title, incoming_chunk),
        },
    }
}

#[derive(Clone)]
struct CachedToken {
    token: String,
    fetched_at: Instant,
    expires_in_secs: u64,
}

static CACHED_TOKENS: Mutex<Option<HashMap<String, CachedToken>>> = Mutex::new(None);

pub fn clean_base_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "https://open.feishu.cn".to_string()
    } else if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("https://{}", trimmed)
    } else {
        trimmed.to_string()
    }
}

pub async fn get_tenant_access_token(
    base_url: &str,
    app_id: &str,
    app_secret: &str,
) -> Result<String, String> {
    let clean_id = app_id.trim();
    let clean_secret = app_secret.trim();
    let endpoint = clean_base_url(base_url);

    if clean_id.is_empty() || clean_secret.is_empty() {
        return Err("Lark/Feishu app_id or app_secret is empty".to_string());
    }

    let cache_key = format!("{}:{}", endpoint, clean_id);

    // Check memory cache
    if let Ok(guard) = CACHED_TOKENS.lock() {
        if let Some(ref map) = *guard {
            if let Some(cached) = map.get(&cache_key) {
                if cached.fetched_at.elapsed().as_secs() + 60 < cached.expires_in_secs {
                    return Ok(cached.token.clone());
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let url = format!("{}/open-apis/auth/v3/tenant_access_token/internal", endpoint);
    let body = serde_json::json!({
        "app_id": clean_id,
        "app_secret": clean_secret
    });

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark/Feishu auth request failed ({}): {}", url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Lark/Feishu auth HTTP {}: {}", status, err_text));
    }

    let data: TenantTokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lark/Feishu auth response: {}", e))?;

    if data.code != 0 {
        let mut hint = "";
        if data.code == 10014 || data.code == 10003 || data.code == 99991663 || data.code == 1000040346 {
            if endpoint.contains("feishu.cn") {
                hint = " (Hint: If your bot is registered on international Lark, set Base URL to https://open.larksuite.com)";
            } else if endpoint.contains("larksuite.com") {
                hint = " (Hint: If your bot is registered on China Feishu, set Base URL to https://open.feishu.cn)";
            }
        }
        return Err(format!("Lark/Feishu auth error code {}: {}{}", data.code, data.msg, hint));
    }

    let token = data
        .tenant_access_token
        .ok_or_else(|| "Missing tenant_access_token in response".to_string())?;
    let expire = data.expire.unwrap_or(7200);

    if let Ok(mut guard) = CACHED_TOKENS.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(
            cache_key,
            CachedToken {
                token: token.clone(),
                fetched_at: Instant::now(),
                expires_in_secs: expire,
            },
        );
    }

    Ok(token)
}

fn text_content_json(text: &str) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({ "text": text })).map_err(|e| e.to_string())
}

async fn lark_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

async fn parse_lark_api_response(
    res: reqwest::Response,
    action: &str,
) -> Result<LarkApiResponse, String> {
    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Lark/Feishu {action} HTTP {status}: {err_text}"));
    }

    let data: LarkApiResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lark/Feishu {action} response: {e}"))?;

    if data.code != 0 {
        return Err(format!(
            "Lark/Feishu {action} error {}: {}",
            data.code, data.msg
        ));
    }

    Ok(data)
}

pub async fn send_lark_message(
    base_url: &str,
    app_id: &str,
    app_secret: &str,
    chat_id: &str,
    text: &str,
) -> Result<String, String> {
    let token = get_tenant_access_token(base_url, app_id, app_secret).await?;
    let endpoint = clean_base_url(base_url);
    let clean_chat_id = chat_id.trim();
    let client = lark_http_client().await?;

    // Determine receive_id_type: 'open_id' for ou_, 'union_id' for on_, 'chat_id' for oc_ or general
    let id_type = if clean_chat_id.starts_with("ou_") {
        "open_id"
    } else if clean_chat_id.starts_with("on_") {
        "union_id"
    } else {
        "chat_id"
    };

    let url = format!(
        "{}/open-apis/im/v1/messages?receive_id_type={}",
        endpoint, id_type
    );

    let body = serde_json::json!({
        "receive_id": clean_chat_id,
        "msg_type": "text",
        "content": text_content_json(text)?
    });

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark/Feishu send message request error: {}", e))?;

    let data = parse_lark_api_response(res, "send message").await?;
    Ok(data
        .data
        .and_then(|item| item.message_id)
        .unwrap_or_default())
}

pub async fn update_lark_message(
    base_url: &str,
    app_id: &str,
    app_secret: &str,
    message_id: &str,
    text: &str,
) -> Result<(), String> {
    let token = get_tenant_access_token(base_url, app_id, app_secret).await?;
    let endpoint = clean_base_url(base_url);
    let clean_id = message_id.trim();
    if clean_id.is_empty() {
        return Err("Lark/Feishu message_id is empty".to_string());
    }
    let client = lark_http_client().await?;

    let url = format!("{}/open-apis/im/v1/messages/{}", endpoint, clean_id);
    let body = serde_json::json!({
        "msg_type": "text",
        "content": text_content_json(text)?
    });

    let res = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark/Feishu update message request error: {}", e))?;

    parse_lark_api_response(res, "update message").await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_base_url() {
        assert_eq!(clean_base_url(""), "https://open.feishu.cn");
        assert_eq!(clean_base_url("   "), "https://open.feishu.cn");
        assert_eq!(clean_base_url("open.larksuite.com"), "https://open.larksuite.com");
        assert_eq!(clean_base_url("https://open.larksuite.com/"), "https://open.larksuite.com");
        assert_eq!(clean_base_url("http://custom-proxy.internal:8080/"), "http://custom-proxy.internal:8080");
    }

    fn live(text: &str, edits: u32) -> LarkLiveMessage {
        LarkLiveMessage {
            message_id: "om_test".into(),
            text: text.into(),
            edit_count: edits,
        }
    }

    #[test]
    fn first_chunk_sends_a_new_message_with_header() {
        assert_eq!(
            next_lark_outbound(None, "hello", "claude", 4000, 20),
            LarkOutbound::Send {
                text: "🖥️ [claude]\nhello".into()
            }
        );
    }

    #[test]
    fn short_followup_edits_the_existing_message() {
        let existing = live("🖥️ [claude]\nhello", 0);
        assert_eq!(
            next_lark_outbound(Some(&existing), "world", "claude", 4000, 20),
            LarkOutbound::Edit {
                message_id: "om_test".into(),
                text: "🖥️ [claude]\nhello\nworld".into()
            }
        );
    }

    #[test]
    fn overflow_length_starts_a_new_message() {
        let existing = live("🖥️ [claude]\nabc", 0);
        assert_eq!(
            next_lark_outbound(Some(&existing), "xyz", "claude", 12, 20),
            LarkOutbound::Send {
                text: "🖥️ [claude]\nxyz".into()
            }
        );
    }

    #[test]
    fn max_edits_starts_a_new_message() {
        let existing = live("🖥️ [claude]\nhello", 20);
        assert_eq!(
            next_lark_outbound(Some(&existing), "more", "claude", 4000, 20),
            LarkOutbound::Send {
                text: "🖥️ [claude]\nmore".into()
            }
        );
    }

    #[test]
    fn length_uses_unicode_characters() {
        let existing = live("你好", 0);
        let action = next_lark_outbound(Some(&existing), "世界", "claude", 4, 20);
        assert!(matches!(action, LarkOutbound::Send { .. }));
        let action = next_lark_outbound(Some(&existing), "啊", "claude", 5, 20);
        assert_eq!(
            action,
            LarkOutbound::Edit {
                message_id: "om_test".into(),
                text: "你好\n啊".into()
            }
        );
    }
}
