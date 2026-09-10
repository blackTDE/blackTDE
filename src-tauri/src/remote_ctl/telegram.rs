use serde::{Deserialize, Serialize};
use tokio::time::Duration;

#[derive(Debug, Deserialize)]
pub struct TelegramResponse<T> {
    pub ok: bool,
    pub result: Option<T>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TelegramUpdate {
    pub update_id: i64,
    pub message: Option<TelegramMessage>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct TelegramMessage {
    pub message_id: i64,
    pub from: Option<TelegramUser>,
    pub chat: TelegramChat,
    pub text: Option<String>,
    pub date: i64,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct TelegramUser {
    pub id: i64,
    pub is_bot: bool,
    pub first_name: String,
    pub username: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct TelegramChat {
    pub id: i64,
    pub r#type: String,
    pub title: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Serialize)]
struct SendMessagePayload<'a> {
    chat_id: &'a str,
    text: &'a str,
    disable_web_page_preview: bool,
}

pub async fn send_telegram_message(
    bot_token: &str,
    chat_id: &str,
    text: &str,
) -> Result<(), String> {
    let clean_token = bot_token.trim();
    if clean_token.is_empty() {
        return Err("Telegram bot token is empty".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create http client: {}", e))?;

    let url = format!("https://api.telegram.org/bot{}/sendMessage", clean_token);

    // Telegram maximum message length is 4096 characters.
    // Chunk long output safely if needed.
    const CHUNK_SIZE: usize = 3800;
    let text_chars: Vec<char> = text.chars().collect();

    for chunk in text_chars.chunks(CHUNK_SIZE) {
        let chunk_str: String = chunk.iter().collect();
        let payload = SendMessagePayload {
            chat_id,
            text: &chunk_str,
            disable_web_page_preview: true,
        };

        let res = client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Telegram API request error: {}", e))?;

        if !res.status().is_success() {
            let err_body = res.text().await.unwrap_or_default();
            return Err(format!("Telegram send failed: {}", err_body));
        }
    }

    Ok(())
}

pub async fn get_telegram_updates(
    bot_token: &str,
    offset: i64,
    timeout_secs: u64,
) -> Result<Vec<TelegramUpdate>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs + 10))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let url = format!(
        "https://api.telegram.org/bot{}/getUpdates?offset={}&timeout={}",
        bot_token.trim(),
        offset,
        timeout_secs
    );

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to poll Telegram updates: {}", e))?;

    if !res.status().is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("Telegram getUpdates failed: {}", err_body));
    }

    let data: TelegramResponse<Vec<TelegramUpdate>> = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Telegram updates: {}", e))?;

    if !data.ok {
        return Err(data.description.unwrap_or_else(|| "Unknown telegram error".into()));
    }

    Ok(data.result.unwrap_or_default())
}
