use serde::Deserialize;
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

static CACHED_TOKEN: Mutex<Option<CachedToken>> = Mutex::new(None);

pub async fn get_tenant_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    let clean_id = app_id.trim();
    let clean_secret = app_secret.trim();

    if clean_id.is_empty() || clean_secret.is_empty() {
        return Err("Lark app_id or app_secret is empty".to_string());
    }

    // Check memory cache
    if let Ok(guard) = CACHED_TOKEN.lock() {
        if let Some(ref cached) = *guard {
            if cached.fetched_at.elapsed().as_secs() + 60 < cached.expires_in_secs {
                return Ok(cached.token.clone());
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    let body = serde_json::json!({
        "app_id": clean_id,
        "app_secret": clean_secret
    });

    let res = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark auth request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Lark auth HTTP {}: {}", status, err_text));
    }

    let data: TenantTokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lark auth response: {}", e))?;

    if data.code != 0 {
        return Err(format!("Lark auth error code {}: {}", data.code, data.msg));
    }

    let token = data
        .tenant_access_token
        .ok_or_else(|| "Missing tenant_access_token in response".to_string())?;
    let expire = data.expire.unwrap_or(7200);

    if let Ok(mut guard) = CACHED_TOKEN.lock() {
        *guard = Some(CachedToken {
            token: token.clone(),
            fetched_at: Instant::now(),
            expires_in_secs: expire,
        });
    }

    Ok(token)
}

pub async fn send_lark_message(
    app_id: &str,
    app_secret: &str,
    chat_id: &str,
    text: &str,
) -> Result<(), String> {
    let token = get_tenant_access_token(app_id, app_secret).await?;
    let clean_chat_id = chat_id.trim();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // Determine receive_id_type: if starts with 'oc_' or 'ou_' or standard chat_id
    let id_type = if clean_chat_id.starts_with("ou_") {
        "open_id"
    } else {
        "chat_id"
    };

    let url = format!(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type={}",
        id_type
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
        .map_err(|e| format!("Lark send message request error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Lark send message HTTP {}: {}", status, err_text));
    }

    let data: LarkSendMessageResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lark send response: {}", e))?;

    if data.code != 0 {
        return Err(format!("Lark send error {}: {}", data.code, data.msg));
    }

    Ok(())
}
