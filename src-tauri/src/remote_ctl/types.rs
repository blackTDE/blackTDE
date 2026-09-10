use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BotPlatform {
    Telegram,
    Lark,
}

impl std::fmt::Display for BotPlatform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BotPlatform::Telegram => write!(f, "telegram"),
            BotPlatform::Lark => write!(f, "lark"),
        }
    }
}

impl std::str::FromStr for BotPlatform {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "telegram" | "tg" => Ok(BotPlatform::Telegram),
            "lark" | "feishu" => Ok(BotPlatform::Lark),
            _ => Err(format!("Unsupported bot platform: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TelegramCredentials {
    pub bot_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LarkCredentials {
    pub app_id: String,
    pub app_secret: String,
    pub verification_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteBotConfig {
    pub platform: String,
    pub credentials: String, // JSON payload
    pub enabled: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemotePairing {
    pub id: String,
    pub platform: String,
    pub chat_id: String,
    pub user_name: Option<String>,
    pub pair_code: String,
    pub status: String, // "pending", "paired", "revoked"
    pub bound_workspace_id: Option<String>,
    pub bound_session_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMessageLog {
    pub id: i64,
    pub platform: String,
    pub chat_id: String,
    pub direction: String, // "incoming", "outgoing"
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotRuntimeStatus {
    pub platform: String,
    pub running: bool,
    pub error: Option<String>,
    pub last_poll_time: Option<String>,
}
