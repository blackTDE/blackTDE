use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FileReadResult {
    pub content: String,
    pub total_bytes: u64,
    pub truncated: bool,
    pub is_binary: bool,
}

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

fn is_cjk_char(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}' | // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' | // CJK Unified Ideographs Extension A
        '\u{20000}'..='\u{2A6DF}' | // CJK Extension B
        '\u{F900}'..='\u{FAFF}' | // CJK Compatibility Ideographs
        '\u{3000}'..='\u{303F}' | // CJK Symbols and Punctuation (《》【】、，。 etc)
        '\u{FF00}'..='\u{FFEF}'   // Halfwidth and Fullwidth Forms (！：；？ etc)
    )
}

fn decode_text_buffer(buffer: &[u8]) -> (String, bool) {
    if buffer.is_empty() {
        return (String::new(), false);
    }

    // 1. Check for explicit BOMs first (UTF-8, UTF-16LE, UTF-16BE)
    if let Some((enc, bom_len)) = encoding_rs::Encoding::for_bom(buffer) {
        let (cow, _had_errors) = enc.decode_without_bom_handling(&buffer[bom_len..]);
        return (cow.into_owned(), false);
    }

    // 2. Fast-path: If it is 100% valid UTF-8, return it directly
    if let Ok(s) = std::str::from_utf8(buffer) {
        return (s.to_string(), false);
    }

    // Check if buffer is valid UTF-8 up to the last 1-4 bytes (truncated boundary)
    if let Err(e) = std::str::from_utf8(buffer) {
        if e.valid_up_to() > 0 && buffer.len() - e.valid_up_to() <= 4 && e.error_len().is_none() {
            return (String::from_utf8_lossy(buffer).to_string(), false);
        }
    }

    // 3. Detect UTF-16 without BOM
    let sample_len = buffer.len().min(4096);
    let sample = &buffer[..sample_len];
    let even_nulls = sample.iter().step_by(2).filter(|&&b| b == 0).count();
    let odd_nulls = sample.iter().skip(1).step_by(2).filter(|&&b| b == 0).count();
    let total_nulls = sample.iter().filter(|&&b| b == 0).count();

    if sample_len >= 8 && odd_nulls > sample_len / 6 && odd_nulls > even_nulls * 3 {
        let (cow, _had_errors) = encoding_rs::UTF_16LE.decode_without_bom_handling(buffer);
        return (cow.into_owned(), false);
    }
    if sample_len >= 8 && even_nulls > sample_len / 6 && even_nulls > odd_nulls * 3 {
        let (cow, _had_errors) = encoding_rs::UTF_16BE.decode_without_bom_handling(buffer);
        return (cow.into_owned(), false);
    }

    // 4. Binary check: Significant null bytes in non-UTF16 text indicates binary content
    if total_nulls > 0 && total_nulls > sample_len / 50 {
        return (String::new(), true);
    }

    // 5. Try GB18030 (National standard Chinese encoding covering GBK and GB2312)
    let (gbk_cow, _) = encoding_rs::GB18030.decode_without_bom_handling(buffer);
    let gbk_replacements = gbk_cow.chars().filter(|&c| c == '\u{FFFD}').count();
    let gbk_cjk = gbk_cow.chars().filter(|&c| is_cjk_char(c)).count();

    // If GB18030 decodes Chinese characters with very low replacement rate, it is clearly GBK/GB18030 Chinese
    if gbk_cjk > 0 && gbk_replacements <= (buffer.len() / 500).max(4) {
        return (gbk_cow.into_owned(), false);
    }

    // 6. Try Big5 (Traditional Chinese)
    let (big5_cow, _) = encoding_rs::BIG5.decode_without_bom_handling(buffer);
    let big5_replacements = big5_cow.chars().filter(|&c| c == '\u{FFFD}').count();
    let big5_cjk = big5_cow.chars().filter(|&c| is_cjk_char(c)).count();

    if big5_cjk > 0 && big5_replacements <= (buffer.len() / 500).max(4) {
        return (big5_cow.into_owned(), false);
    }

    // 7. If GB18030 had 0 replacements even without CJK characters (e.g. pure ASCII subset in GBK)
    if gbk_replacements == 0 {
        return (gbk_cow.into_owned(), false);
    }

    // 8. Fall back to lossy UTF-8
    (String::from_utf8_lossy(buffer).to_string(), false)
}

const DEFAULT_MAX_FILE_BYTES: u64 = 4 * 1024 * 1024; // 4 MB chunk limit for large file previews

#[tauri::command]
pub fn read_file_content(path: String, max_bytes: Option<u64>) -> Result<FileReadResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Path is not a regular file: {}", path));
    }

    let metadata = fs::metadata(p).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let total_bytes = metadata.len();
    let limit = max_bytes.unwrap_or(DEFAULT_MAX_FILE_BYTES);

    let mut file = fs::File::open(p).map_err(|e| format!("Failed to open file: {}", e))?;

    let bytes_to_read = if limit > 0 && total_bytes > limit {
        limit
    } else {
        total_bytes
    };

    let mut buffer = vec![0u8; bytes_to_read as usize];
    file.read_exact(&mut buffer).map_err(|e| format!("Failed to read file content: {}", e))?;

    let (content, is_binary) = decode_text_buffer(&buffer);

    Ok(FileReadResult {
        content,
        total_bytes,
        truncated: total_bytes > bytes_to_read,
        is_binary,
    })
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

#[cfg(unix)]
fn is_same_file(p1: &Path, p2: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    if let (Ok(m1), Ok(m2)) = (fs::metadata(p1), fs::metadata(p2)) {
        return m1.dev() == m2.dev() && m1.ino() == m2.ino();
    }
    false
}

#[cfg(not(unix))]
fn is_same_file(p1: &Path, p2: &Path) -> bool {
    if let (Ok(c1), Ok(c2)) = (p1.canonicalize(), p2.canonicalize()) {
        return c1 == c2;
    }
    false
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

    let is_case_change = is_same_file(source, &target);
    if target.exists() && !is_case_change {
        return Err("A file or directory with that name already exists".into());
    }

    if is_case_change {
        let temp_target = parent.join(format!("{}.tde_tmp_rename_{}", name, uuid::Uuid::new_v4()));
        fs::rename(source, &temp_target).map_err(|e| e.to_string())?;
        fs::rename(&temp_target, &target).map_err(|e| e.to_string())?;
    } else {
        fs::rename(source, &target).map_err(|e| e.to_string())?;
    }

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
    fn decodes_gb18030_chinese_text_accurately() {
        let original = "《凡人修仙传》（校对版全本+番外） 作者：忘语\n====================================================\n第一章 山边小村\n二愣子躺在干草堆上";
        let (gbk_bytes, _, _) = encoding_rs::GB18030.encode(original);
        let (decoded, is_binary) = super::decode_text_buffer(&gbk_bytes);
        assert!(!is_binary);
        assert_eq!(decoded, original);
    }

    #[test]
    fn decodes_truncated_gb18030_text_without_falling_back_to_garbled_utf8() {
        let original = "《凡人修仙传》 第一章 山边小村";
        let (gbk_bytes, _, _) = encoding_rs::GB18030.encode(original);
        // Truncate the last byte in middle of 2-byte Chinese character
        let truncated_bytes = &gbk_bytes[..gbk_bytes.len() - 1];
        let (decoded, is_binary) = super::decode_text_buffer(truncated_bytes);
        assert!(!is_binary);
        assert!(decoded.contains("《凡人修仙传》 第一章 山边"));
    }

    #[test]
    fn decodes_utf16_and_utf8_chinese_text_correctly() {
        let utf8_orig = "UTF-8 中文测试内容 123";
        let (decoded_utf8, _) = super::decode_text_buffer(utf8_orig.as_bytes());
        assert_eq!(decoded_utf8, utf8_orig);

        let (utf16_bytes, _, _) = encoding_rs::UTF_16LE.encode("UTF-16LE 中文测试");
        let (decoded_utf16, _) = super::decode_text_buffer(&utf16_bytes);
        assert_eq!(decoded_utf16, "UTF-16LE 中文测试");
    }

    #[test]
    fn renames_file_with_case_only_change_successfully() {
        let temp_dir = std::env::temp_dir().join(format!("black-tde-rename-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let upper_file = temp_dir.join("MY_DOC.TXT");
        fs::write(&upper_file, "content").unwrap();

        // Rename from uppercase to lowercase
        let result = rename_path(upper_file.to_string_lossy().to_string(), "my_doc.txt".into());
        assert!(result.is_ok(), "Expected rename to succeed but got: {:?}", result.err());
        let new_path = std::path::PathBuf::from(result.unwrap());
        assert_eq!(new_path.file_name().unwrap(), "my_doc.txt");
        assert!(new_path.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

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
