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
struct LarkSendMessageResponse {
    code: i32,
    msg: String,
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

pub async fn send_lark_message(
    base_url: &str,
    app_id: &str,
    app_secret: &str,
    chat_id: &str,
    text: &str,
) -> Result<(), String> {
    let token = get_tenant_access_token(base_url, app_id, app_secret).await?;
    let endpoint = clean_base_url(base_url);
    let clean_chat_id = chat_id.trim();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

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

    // Lark message content must be a JSON string of {"text": text}
    let content_json = serde_json::to_string(&serde_json::json!({ "text": text }))
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "receive_id": clean_chat_id,
        "msg_type": "text",
        "content": content_json
    });

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark/Feishu send message request error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Lark/Feishu send message HTTP {}: {}", status, err_text));
    }

    let data: LarkSendMessageResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lark/Feishu send response: {}", e))?;

    if data.code != 0 {
        return Err(format!("Lark/Feishu send error {}: {}", data.code, data.msg));
    }

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
}
