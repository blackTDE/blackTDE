use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SkillItem {
    pub id: String,
    pub name: String,
    pub agent_type: String, // "gemini", "claude", "codex", "aider", "vault", "custom"
    pub scope: String,      // "global", "workspace", "plugin", "vault"
    pub path: String,       // Absolute directory path
    pub plugin_name: Option<String>,
    pub description: Option<String>,
    pub has_skill_md: bool,
    pub file_count: usize,
    pub size_bytes: u64,
}

pub fn get_vault_dir() -> Option<PathBuf> {
    let home_str = std::env::var("HOME").ok()?;
    let vault = PathBuf::from(home_str).join(".tde/skills_vault");
    let _ = fs::create_dir_all(&vault);
    Some(vault)
}

pub fn get_agent_skills_dir(agent_type: &str, scope: &str, workspace_path: Option<&str>) -> Option<PathBuf> {
    if scope == "vault" {
        return get_vault_dir();
    }
    if scope == "workspace" {
        let ws = workspace_path?;
        let ws_path = Path::new(ws);
        let folder = match agent_type {
            "claude" => ".claude/skills",
            "codex" => ".codex/skills",
            "aider" => ".aider/skills",
            _ => ".gemini/skills",
        };
        Some(ws_path.join(folder))
    } else {
        let home_str = std::env::var("HOME").ok()?;
        let home = PathBuf::from(home_str);
        let folder = match agent_type {
            "claude" => ".claude/skills",
            "codex" => ".codex/skills",
            "aider" => ".aider/skills",
            _ => ".gemini/skills",
        };
        Some(home.join(folder))
    }
}

pub fn parse_skill_info(
    dir_path: &Path,
    agent_type: &str,
    scope: &str,
    plugin_name: Option<&str>,
) -> Option<SkillItem> {
    if !dir_path.is_dir() {
        return None;
    }
    let dir_name = dir_path.file_name()?.to_str()?.to_string();
    if dir_name.starts_with('.') {
        return None;
    }

    let skill_md_path = dir_path.join("SKILL.md");
    let has_skill_md = skill_md_path.exists();
    let mut description: Option<String> = None;
    let mut skill_name = dir_name.clone();

    if has_skill_md {
        if let Ok(content) = fs::read_to_string(&skill_md_path) {
            for line in content.lines() {
                let line_trim = line.trim();
                if line_trim.starts_with("name:") {
                    skill_name = line_trim
                        .trim_start_matches("name:")
                        .trim()
                        .trim_matches('"')
                        .to_string();
                } else if line_trim.starts_with("description:") {
                    description = Some(
                        line_trim
                            .trim_start_matches("description:")
                            .trim()
                            .trim_matches('"')
                            .to_string(),
                    );
                }
            }
            if description.is_none() {
                let non_empty: Vec<&str> = content
                    .lines()
                    .filter(|l| {
                        !l.trim().is_empty()
                            && !l.trim().starts_with('#')
                            && !l.trim().starts_with("---")
                    })
                    .collect();
                if let Some(first) = non_empty.first() {
                    description = Some(first.trim().to_string());
                }
            }
        }
    } else if scope != "plugin" {
        // If not a plugin and lacks SKILL.md, skip
        return None;
    }

    let (file_count, size_bytes) = count_files_and_size(dir_path);

    Some(SkillItem {
        id: format!("{}:{}:{}", agent_type, scope, dir_name),
        name: skill_name,
        agent_type: agent_type.to_string(),
        scope: scope.to_string(),
        path: dir_path.to_string_lossy().to_string(),
        plugin_name: plugin_name.map(|s| s.to_string()),
        description,
        has_skill_md,
        file_count,
        size_bytes,
    })
}

fn count_files_and_size(dir: &Path) -> (usize, u64) {
    let mut files = 0;
    let mut bytes = 0;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                files += 1;
                if let Ok(meta) = entry.metadata() {
                    bytes += meta.len();
                }
            } else if path.is_dir() {
                let (sub_files, sub_bytes) = count_files_and_size(&path);
                files += sub_files;
                bytes += sub_bytes;
            }
        }
    }

    (files, bytes)
}

#[tauri::command]
pub async fn list_agent_skills(workspace_path: Option<String>) -> Result<Vec<SkillItem>, String> {
    let mut items = Vec::new();
    let home_opt = std::env::var("HOME").ok().map(PathBuf::from);

    // 1. Scan Global and Workspace skills per agent
    let agents = ["gemini", "claude", "codex", "aider"];
    let scopes = ["global", "workspace"];

    for agent in agents {
        for scope in scopes {
            if scope == "workspace" && workspace_path.is_none() {
                continue;
            }
            if let Some(dir) = get_agent_skills_dir(agent, scope, workspace_path.as_deref()) {
                if dir.exists() && dir.is_dir() {
                    if let Ok(entries) = fs::read_dir(&dir) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let p = entry.path();
                            if p.is_dir() {
                                if let Some(item) = parse_skill_info(&p, agent, scope, None) {
                                    items.push(item);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Scan Plugin skills
    if let Some(ref home) = home_opt {
        let plugin_roots = vec![
            ("gemini", home.join(".gemini/config/plugins")),
            ("claude", home.join(".claude/plugins")),
            ("claude", home.join(".config/claude/plugins")),
            ("codex", home.join(".codex/plugins")),
            ("codex", home.join(".config/codex/plugins")),
        ];

        for (agent_type, plugin_root) in plugin_roots {
            if plugin_root.exists() && plugin_root.is_dir() {
                if let Ok(plugins) = fs::read_dir(&plugin_root) {
                    for plugin_entry in plugins.filter_map(|e| e.ok()) {
                        let plugin_dir = plugin_entry.path();
                        if !plugin_dir.is_dir() {
                            continue;
                        }
                        let plugin_name = plugin_dir
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("unknown")
                            .to_string();

                        // Check inside <plugin_dir>/skills/
                        let skills_sub = plugin_dir.join("skills");
                        if skills_sub.exists() && skills_sub.is_dir() {
                            if let Ok(entries) = fs::read_dir(&skills_sub) {
                                for entry in entries.filter_map(|e| e.ok()) {
                                    let p = entry.path();
                                    if p.is_dir() {
                                        if let Some(item) =
                                            parse_skill_info(&p, agent_type, "plugin", Some(&plugin_name))
                                        {
                                            items.push(item);
                                        }
                                    }
                                }
                            }
                        }

                        // Also check if plugin_dir itself is a skill (contains SKILL.md)
                        if plugin_dir.join("SKILL.md").exists() {
                            if let Some(item) =
                                parse_skill_info(&plugin_dir, agent_type, "plugin", Some(&plugin_name))
                            {
                                if !items.iter().any(|i| i.path == item.path) {
                                    items.push(item);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Scan Vault skills (~/.tde/skills_vault)
    if let Some(vault_dir) = get_vault_dir() {
        if vault_dir.exists() && vault_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&vault_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let p = entry.path();
                    if p.is_dir() {
                        if let Some(item) = parse_skill_info(&p, "vault", "vault", None) {
                            items.push(item);
                        }
                    }
                }
            }
        }
    }

    Ok(items)
}

pub fn move_to_vault_dir(src: &Path, vault_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(vault_dir).map_err(|e| e.to_string())?;

    let folder_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid source folder name".to_string())?;

    let mut dest = vault_dir.join(folder_name);
    if dest.exists() {
        let ts = system_time_now();
        dest = vault_dir.join(format!("{}_{}", folder_name, ts));
    }

    fs::rename(src, &dest).or_else(|_| {
        copy_dir_recursive(src, &dest)?;
        fs::remove_dir_all(src).map_err(|e| e.to_string())
    })?;

    Ok(dest)
}

fn system_time_now() -> u64 {
    use std::time::SystemTime;
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[tauri::command]
pub async fn copy_skill(
    source_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let src = Path::new(&source_path);
    if !src.exists() || !src.is_dir() {
        return Err("Source skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    copy_dir_recursive(src, &dest)?;

    parse_skill_info(&dest, &target_agent, &scope, None)
        .ok_or_else(|| "Failed to parse copied skill metadata".into())
}

#[tauri::command]
pub async fn move_skill(
    source_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let src = Path::new(&source_path);
    if !src.exists() || !src.is_dir() {
        return Err("Source skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    fs::rename(src, &dest).or_else(|_| {
        copy_dir_recursive(src, &dest)?;
        fs::remove_dir_all(src).map_err(|e| e.to_string())
    })?;

    parse_skill_info(&dest, &target_agent, &scope, None)
        .ok_or_else(|| "Failed to parse moved skill metadata".into())
}

#[tauri::command]
pub async fn delete_skill(path: String, permanent: Option<bool>) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Skill directory does not exist".into());
    }

    if permanent.unwrap_or(false) {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        let vault_dir = get_vault_dir().ok_or_else(|| "Vault directory resolution failed".to_string())?;
        move_to_vault_dir(p, &vault_dir)?;
        Ok(())
    }
}

#[tauri::command]
pub async fn install_from_vault(
    vault_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
    move_from_vault: Option<bool>,
) -> Result<SkillItem, String> {
    let src = Path::new(&vault_path);
    if !src.exists() || !src.is_dir() {
        return Err("Vault skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    if move_from_vault.unwrap_or(false) {
        fs::rename(src, &dest).or_else(|_| {
            copy_dir_recursive(src, &dest)?;
            fs::remove_dir_all(src).map_err(|e| e.to_string())
        })?;
    } else {
        copy_dir_recursive(src, &dest)?;
    }

    parse_skill_info(&dest, &target_agent, &scope, None)
        .ok_or_else(|| "Failed to parse installed skill metadata".into())
}

#[tauri::command]
pub async fn create_skill(
    agent_type: String,
    scope: String,
    workspace_path: Option<String>,
    name: String,
    description: String,
) -> Result<SkillItem, String> {
    let target_parent = get_agent_skills_dir(&agent_type, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    let safe_dir_name = name.to_lowercase().replace(' ', "-").replace(|c: char| !c.is_alphanumeric() && c != '-', "");
    let skill_dir = target_parent.join(&safe_dir_name);

    if skill_dir.exists() {
        return Err(format!("Skill directory '{}' already exists", safe_dir_name));
    }

    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;

    let skill_md_content = format!(
        "---\nname: {}\ndescription: {}\n---\n\n# {}\n\n{}",
        name, description, name, description
    );

    fs::write(skill_dir.join("SKILL.md"), skill_md_content).map_err(|e| e.to_string())?;

    parse_skill_info(&skill_dir, &agent_type, &scope, None)
        .ok_or_else(|| "Failed to parse created skill metadata".into())
}

#[tauri::command]
pub async fn clone_skill(
    git_url: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let repo_name = git_url
        .trim_end_matches('/')
        .split('/')
        .last()
        .unwrap_or("cloned-skill")
        .trim_end_matches(".git");

    let folder_name = new_name.unwrap_or_else(|| repo_name.to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill directory '{}' already exists", folder_name));
    }

    let output = std::process::Command::new("git")
        .args(["clone", &git_url, dest.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git clone failed: {}", err_msg));
    }

    parse_skill_info(&dest, &target_agent, &scope, None)
        .ok_or_else(|| "Failed to parse cloned skill metadata".into())
}

#[tauri::command]
pub async fn read_skill_file(skill_path: String, relative_file: String) -> Result<String, String> {
    let p = Path::new(&skill_path).join(&relative_file);
    if !p.exists() || !p.is_file() {
        return Err("File does not exist in skill directory".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_skill_file(skill_path: String, relative_file: String, content: String) -> Result<(), String> {
    let p = Path::new(&skill_path).join(&relative_file);
    fs::write(p, content).map_err(|e| e.to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_parse_skill() {
        let temp_base = std::env::temp_dir().join(format!("tde-skill-test-{}", uuid::Uuid::new_v4()));
        let skill_dir = temp_base.join("my-test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: My Custom Skill\ndescription: Test description\n---\n",
        )
        .unwrap();

        let parsed = parse_skill_info(&skill_dir, "gemini", "global", None).unwrap();
        assert_eq!(parsed.name, "My Custom Skill");
        assert_eq!(parsed.description.unwrap(), "Test description");
        assert_eq!(parsed.has_skill_md, true);

        fs::remove_dir_all(temp_base).unwrap();
    }

    #[test]
    fn test_vault_soft_delete_and_install() {
        let temp_home = std::env::temp_dir().join(format!("tde-vault-test-{}", uuid::Uuid::new_v4()));
        let agent_skill = temp_home.join(".claude/skills/custom-reviewer");
        fs::create_dir_all(&agent_skill).unwrap();
        fs::write(agent_skill.join("SKILL.md"), "---\nname: Custom Reviewer\n---\n").unwrap();

        let vault_dir = temp_home.join(".tde/skills_vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let dest = move_to_vault_dir(&agent_skill, &vault_dir).unwrap();
        assert!(!agent_skill.exists());
        assert!(dest.exists());

        fs::remove_dir_all(temp_home).unwrap();
    }
}
