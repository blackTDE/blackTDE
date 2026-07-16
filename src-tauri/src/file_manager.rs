use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: u64,
}

fn valid_child_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("Invalid file name".into());
    }
    Ok(name)
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err("Path is not a directory".into());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry_res in read_dir {
        if let Ok(entry) = entry_res {
            let name = entry.file_name().to_string_lossy().to_string();
            // Filter out node_modules, target, git metadata, and other heavy directories
            if name == ".git" || name == "node_modules" || name == "target" || name == ".DS_Store" {
                continue;
            }
            let entry_path = entry.path().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .unwrap_or_default()
                .as_secs();
            entries.push(FileEntry {
                name,
                path: entry_path,
                is_dir,
                size: metadata.len(),
                modified_at,
            });
        }
    }

    // Sort directory structures: directories first, then alphabetically
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn create_file(parent_path: String, name: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    if !parent.is_dir() {
        return Err("Parent path is not a directory".into());
    }
    let target = parent.join(valid_child_name(&name)?);
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_directory(parent_path: String, name: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    if !parent.is_dir() {
        return Err("Parent path is not a directory".into());
    }
    let target = parent.join(valid_child_name(&name)?);
    fs::create_dir(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.parent().is_none() || target.parent() == Some(target) {
        return Err("Refusing to delete a filesystem root".into());
    }
    let metadata = fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn rename_path(path: String, new_name: String) -> Result<String, String> {
    let name = valid_child_name(&new_name)?;

    let source = Path::new(&path);
    let parent = source
        .parent()
        .filter(|parent| *parent != source)
        .ok_or("Invalid source path")?;
    let target = parent.join(name);
    if target.exists() {
        return Err("A file or directory with that name already exists".into());
    }

    fs::rename(source, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(b64)
}

#[derive(serde::Serialize)]
pub struct SearchMatch {
    pub line_number: usize,
    pub line_content: String,
}

#[derive(serde::Serialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub matches_content: Vec<SearchMatch>,
    pub matches_filename: bool,
}

#[derive(serde::Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub truncated: bool,
}

const MAX_SEARCH_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_MATCHES: usize = 2_000;
const MAX_SEARCH_RESULTS: usize = 500;
static SEARCH_GENERATION: AtomicU64 = AtomicU64::new(0);

struct SearchState {
    matches: usize,
    truncated: bool,
    cancelled: bool,
}

fn should_skip_search_entry(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | ".DS_Store"
            | "dist"
            | "build"
            | "build-dist"
            | "coverage"
            | ".next"
    )
}

fn text_matches(text: &str, query: &str, match_case: bool, whole_word: bool) -> bool {
    if match_case {
        if whole_word {
            text.split(|c: char| !c.is_alphanumeric() && c != '_')
                .any(|word| word == query)
        } else {
            text.contains(query)
        }
    } else {
        let text = text.to_lowercase();
        let query = query.to_lowercase();
        if whole_word {
            text.split(|c: char| !c.is_alphanumeric() && c != '_')
                .any(|word| word == query)
        } else {
            text.contains(&query)
        }
    }
}

fn search_file(
    path: &Path,
    query: &str,
    match_case: bool,
    whole_word: bool,
    search_id: u64,
    state: &mut SearchState,
    results: &mut Vec<SearchResult>,
) {
    if state.truncated || SEARCH_GENERATION.load(Ordering::Relaxed) != search_id {
        state.cancelled = true;
        return;
    }

    let Ok(metadata) = path.symlink_metadata() else {
        return;
    };
    if !metadata.is_file() || metadata.len() > MAX_SEARCH_FILE_SIZE {
        return;
    }

    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let matches_filename = text_matches(&name, query, match_case, whole_word);
    let mut matches_content = Vec::new();

    if let Ok(content) = fs::read_to_string(path) {
        for (idx, line) in content.lines().enumerate() {
            if SEARCH_GENERATION.load(Ordering::Relaxed) != search_id {
                state.cancelled = true;
                return;
            }
            if text_matches(line, query, match_case, whole_word) {
                if state.matches == MAX_SEARCH_MATCHES {
                    state.truncated = true;
                    break;
                }
                state.matches += 1;
                matches_content.push(SearchMatch {
                    line_number: idx + 1,
                    line_content: line.trim().to_string(),
                });
            }
        }
    }

    if matches_filename || !matches_content.is_empty() {
        if results.len() == MAX_SEARCH_RESULTS {
            state.truncated = true;
        } else {
            results.push(SearchResult {
                path: path.to_string_lossy().to_string(),
                name,
                matches_content,
                matches_filename,
            });
        }
    }
}

fn recursive_search(
    dir: &Path,
    query: &str,
    match_case: bool,
    whole_word: bool,
    search_id: u64,
    state: &mut SearchState,
    results: &mut Vec<SearchResult>,
) -> Result<(), std::io::Error> {
    if state.truncated || state.cancelled || !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        if SEARCH_GENERATION.load(Ordering::Relaxed) != search_id {
            state.cancelled = true;
            break;
        }
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();

        if should_skip_search_entry(&name) {
            continue;
        }

        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            recursive_search(
                &path, query, match_case, whole_word, search_id, state, results,
            )?;
        } else if file_type.is_file() {
            search_file(
                &path, query, match_case, whole_word, search_id, state, results,
            );
        }
        if state.truncated || state.cancelled {
            break;
        }
    }
    Ok(())
}

fn git_files(root: &Path) -> Option<Vec<std::path::PathBuf>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()
        .ok()?;
    output.status.success().then(|| {
        output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
            .map(|path| root.join(String::from_utf8_lossy(path).as_ref()))
            .collect()
    })
}

#[tauri::command]
pub async fn search_project(
    root_path: String,
    query: String,
    match_case: bool,
    whole_word: bool,
) -> Result<SearchResponse, String> {
    let search_id = SEARCH_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&root_path);
        if !root.is_dir() {
            return Err("Project path is not a directory".into());
        }

        let query_trimmed = query.trim();
        if query_trimmed.is_empty() {
            return Ok(SearchResponse {
                results: Vec::new(),
                truncated: false,
            });
        }

        let mut results = Vec::new();
        let mut state = SearchState {
            matches: 0,
            truncated: false,
            cancelled: false,
        };
        if let Some(paths) = git_files(root) {
            for path in paths {
                search_file(
                    &path,
                    query_trimmed,
                    match_case,
                    whole_word,
                    search_id,
                    &mut state,
                    &mut results,
                );
                if state.truncated || state.cancelled {
                    break;
                }
            }
        } else {
            recursive_search(
                root,
                query_trimmed,
                match_case,
                whole_word,
                search_id,
                &mut state,
                &mut results,
            )
            .map_err(|e| e.to_string())?;
        }

        // Sort results alphabetically by file name
        results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(SearchResponse {
            results,
            truncated: state.truncated,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn replace_in_project(
    root_path: String,
    query: String,
    replace_str: String,
) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&root_path);
        if !root.is_dir() {
            return Err("Project path is not a directory".into());
        }

        let query_trimmed = query.trim();
        if query_trimmed.is_empty() {
            return Ok(0);
        }

        let mut files_modified = 0;

        fn recursive_replace(
            dir: &Path,
            query: &str,
            replace_str: &str,
            files_modified: &mut usize,
        ) -> Result<(), std::io::Error> {
            if !dir.is_dir() {
                return Ok(());
            }

            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().to_string();

                if name == ".git"
                    || name == "node_modules"
                    || name == "target"
                    || name == ".DS_Store"
                    || name == "dist"
                    || name == "build"
                {
                    continue;
                }

                let path = entry.path();
                if path.is_dir() {
                    recursive_replace(&path, query, replace_str, files_modified)?;
                } else {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if content.contains(query) {
                            let new_content = content.replace(query, replace_str);
                            fs::write(&path, new_content)?;
                            *files_modified += 1;
                        }
                    }
                }
            }
            Ok(())
        }

        recursive_replace(root, query_trimmed, &replace_str, &mut files_modified)
            .map_err(|e| e.to_string())?;

        Ok(files_modified)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        recursive_search, rename_path, SearchState, MAX_SEARCH_MATCHES, SEARCH_GENERATION,
    };
    use std::fs;
    use std::sync::atomic::Ordering;

    #[test]
    fn rejects_path_separator_in_new_name() {
        assert!(rename_path("/tmp/file".into(), "../renamed".into()).is_err());
    }

    #[test]
    fn bounds_search_and_skips_generated_and_symlinked_directories() {
        let root = std::env::temp_dir().join(format!("black-tde-search-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("build-dist")).unwrap();
        fs::write(
            root.join("src/app.ts"),
            "needle\n".repeat(MAX_SEARCH_MATCHES + 1),
        )
        .unwrap();
        fs::write(root.join("build-dist/generated.js"), "ignored needle").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let search_id = SEARCH_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
        let mut state = SearchState {
            matches: 0,
            truncated: false,
            cancelled: false,
        };
        let mut results = Vec::new();
        recursive_search(
            &root,
            "needle",
            false,
            false,
            search_id,
            &mut state,
            &mut results,
        )
        .unwrap();

        assert!(state.truncated);
        assert_eq!(state.matches, MAX_SEARCH_MATCHES);
        assert_eq!(results.len(), 1);
        assert!(results[0].path.ends_with("src/app.ts"));
        fs::remove_dir_all(root).unwrap();
    }
}
