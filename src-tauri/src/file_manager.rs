use std::fs;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
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
            entries.push(FileEntry { name, path: entry_path, is_dir });
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

fn recursive_search(
    dir: &Path,
    query_lower: &str,
    results: &mut Vec<SearchResult>,
) -> Result<(), std::io::Error> {
    if !dir.is_dir() {
        return Ok(());
    }
    
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        
        // Skip common large folders and hidden files
        if name == ".git" || name == "node_modules" || name == "target" || name == ".DS_Store" || name == "dist" || name == "build" {
            continue;
        }
        
        let path = entry.path();
        if path.is_dir() {
            recursive_search(&path, query_lower, results)?;
        } else {
            let matches_filename = name.to_lowercase().contains(query_lower);
            let mut matches_content = Vec::new();
            
            if let Ok(content) = fs::read_to_string(&path) {
                for (idx, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(query_lower) {
                        matches_content.push(SearchMatch {
                            line_number: idx + 1,
                            line_content: line.trim().to_string(),
                        });
                    }
                }
            }
            
            if matches_filename || !matches_content.is_empty() {
                results.push(SearchResult {
                    path: path.to_string_lossy().to_string(),
                    name,
                    matches_content,
                    matches_filename,
                });
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn search_project(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err("Project path is not a directory".into());
    }
    
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return Ok(Vec::new());
    }
    
    let query_lower = query_trimmed.to_lowercase();
    let mut results = Vec::new();
    recursive_search(root, &query_lower, &mut results).map_err(|e| e.to_string())?;
    
    // Sort results alphabetically by file name
    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(results)
}
