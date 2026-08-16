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

pub fn extract_conversation_id(output: &str) -> Option<String> {
    let mut latest = None;
    for separator in [
        "--conversation=",
        "--conversation ",
        "Created conversation ",
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

#[cfg(test)]
mod tests {
    use super::extract_conversation_id;

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
    }
}
