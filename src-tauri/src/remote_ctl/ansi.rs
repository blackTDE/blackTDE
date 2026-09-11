/// Strips ANSI escape codes, simulates carriage return overwrites,
/// and filters out interactive TUI noise (status bars, prompt echoes, separator spam).
pub fn clean_terminal_output(raw: &str) -> String {
    let mut lines: Vec<Vec<char>> = vec![Vec::new()];
    let mut line_idx = 0;
    let mut cursor_col = 0;

    let mut chars = raw.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Check escape sequence
            match chars.next() {
                Some('[') => {
                    // CSI sequence: parse params and final byte (0x40..=0x7E)
                    let mut csi_buf = String::new();
                    while let Some(&next_c) = chars.peek() {
                        chars.next();
                        csi_buf.push(next_c);
                        if (next_c as u32) >= 0x40 && (next_c as u32) <= 0x7E {
                            break;
                        }
                    }

                    // Handle common CSI cursor operations
                    if csi_buf == "2K" {
                        // Clear entire line
                        lines[line_idx].clear();
                        cursor_col = 0;
                    } else if csi_buf == "K" || csi_buf == "0K" {
                        // Clear from cursor to end of line
                        lines[line_idx].truncate(cursor_col);
                    } else if csi_buf == "1K" {
                        // Clear from start to cursor
                        for i in 0..cursor_col.min(lines[line_idx].len()) {
                            lines[line_idx][i] = ' ';
                        }
                    } else if csi_buf == "A" || csi_buf == "1A" {
                        // Cursor up
                        if line_idx > 0 {
                            line_idx -= 1;
                            cursor_col = cursor_col.min(lines[line_idx].len());
                        }
                    }
                }
                Some(']') => {
                    // OSC sequence: parse until BEL (\x07) or ST (\x1b\\)
                    while let Some(osc_c) = chars.next() {
                        if osc_c == '\x07' {
                            break;
                        }
                        if osc_c == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('(') | Some(')') => {
                    chars.next();
                }
                _ => {}
            }
        } else if c == '\r' {
            // Carriage return:
            if chars.peek() == Some(&'\n') {
                // If followed immediately by \n, let \n advance to new line
                continue;
            }
            // Isolated \r: reset current line for in-place redraw / overwrite
            lines[line_idx].clear();
            cursor_col = 0;
        } else if c == '\n' {
            // Advance to next line
            line_idx += 1;
            if line_idx >= lines.len() {
                lines.push(Vec::new());
            }
            cursor_col = 0;
        } else if c == '\x08' {
            // Backspace
            if cursor_col > 0 {
                cursor_col -= 1;
            }
        } else if c == '\t' {
            // Tab -> 4 spaces
            for _ in 0..4 {
                while lines[line_idx].len() < cursor_col {
                    lines[line_idx].push(' ');
                }
                if cursor_col < lines[line_idx].len() {
                    lines[line_idx][cursor_col] = ' ';
                } else {
                    lines[line_idx].push(' ');
                }
                cursor_col += 1;
            }
        } else if c >= ' ' {
            while lines[line_idx].len() < cursor_col {
                lines[line_idx].push(' ');
            }
            if cursor_col < lines[line_idx].len() {
                lines[line_idx][cursor_col] = c;
            } else {
                lines[line_idx].push(c);
            }
            cursor_col += 1;
        }
    }

    // Second pass: Filter TUI artifacts, status footers, decorative lines
    let mut cleaned_lines: Vec<String> = Vec::new();
    let mut last_was_empty = false;

    for raw_line_chars in lines {
        let line_str: String = raw_line_chars.into_iter().collect();
        let trimmed = line_str.trim();

        if trimmed.is_empty() {
            if !last_was_empty && !cleaned_lines.is_empty() {
                cleaned_lines.push(String::new());
                last_was_empty = true;
            }
            continue;
        }

        // 1. Filter pure decorative divider lines (e.g. _______, ───────, =======)
        if is_decorative_divider(trimmed) {
            continue;
        }

        // 2. Filter TUI status footers (e.g. "Gemini 3.8 Flash · medium", "Claude 3.7 · thinking")
        if is_tui_status_footer(trimmed) {
            continue;
        }

        // 3. Filter CLI startup banner noise (e.g. user email + Google AI Pro banner)
        if is_startup_banner_noise(trimmed) {
            continue;
        }

        // 4. Avoid immediate duplicate lines
        if let Some(last) = cleaned_lines.last() {
            if last == trimmed {
                continue;
            }
        }

        cleaned_lines.push(trimmed.to_string());
        last_was_empty = false;
    }

    // Trim trailing empty lines
    while let Some(last) = cleaned_lines.last() {
        if last.is_empty() {
            cleaned_lines.pop();
        } else {
            break;
        }
    }

    cleaned_lines.join("\n")
}

/// Checks if a line consists purely of decorative divider characters
fn is_decorative_divider(text: &str) -> bool {
    let chars: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
    if chars.len() < 3 {
        return false;
    }
    chars.iter().all(|c| matches!(c, '_' | '-' | '─' | '━' | '=' | '~' | '═' | '┄' | '┅' | '┈' | '┉'))
}

/// Checks if a line is an interactive CLI status footer
fn is_tui_status_footer(text: &str) -> bool {
    let lower = text.to_lowercase();

    // Check for common status line patterns: "Gemini ... · medium", "Claude ... · ..."
    if (lower.contains("· medium")
        || lower.contains("· flash")
        || lower.contains("· auto")
        || lower.contains("· thinking")
        || lower.contains("· pro")
        || lower.contains("· sonnet")
        || lower.contains("· opus")
        || lower.contains("· haiku"))
        && (lower.contains("gemini") || lower.contains("claude") || lower.contains("antigravity"))
    {
        return true;
    }

    // Common interactive prompt hints
    if lower.contains("? for shortcuts")
        || lower.contains("ctrl+c to cancel")
        || lower.contains("esc to cancel")
        || lower == "● idle"
        || lower.starts_with("● idle ·")
    {
        return true;
    }

    false
}

/// Checks if a line is an interactive CLI banner header noise
fn is_startup_banner_noise(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.contains("(google ai pro)") || lower.contains("(google ai ultra)") {
        return true;
    }
    if lower.starts_with("gemini ") && lower.contains("antigravity cli") {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strips_ansi_colors() {
        let input = "\x1b[31mError:\x1b[0m File \x1b[1;34mnot found\x1b[0m";
        let output = clean_terminal_output(input);
        assert_eq!(output, "Error: File not found");
    }

    #[test]
    fn test_strips_cursor_moves_and_osc() {
        let input = "\x1b]0;Terminal Title\x07\x1b[2J\x1b[HHello World!\x1b[1B";
        let output = clean_terminal_output(input);
        assert_eq!(output, "Hello World!");
    }

    #[test]
    fn test_collapses_blank_lines() {
        let input = "Line 1\r\n\r\n\r\n\r\nLine 2";
        let output = clean_terminal_output(input);
        assert_eq!(output, "Line 1\n\nLine 2");
    }

    #[test]
    fn test_carriage_return_overwrites() {
        let input = "Frame 1\rFrame 2\rDone!\n";
        let output = clean_terminal_output(input);
        assert_eq!(output, "Done!");
    }

    #[test]
    fn test_filters_decorative_dividers_and_status_footer() {
        let input = "__________________________________________________\n\
                     __________________________________________________\n\
                     Hello, this is a response from AI.\n\
                     ──────────────────────────────────────────────────\n\
                     Gemini 3.8 Flash · medium\n";
        let output = clean_terminal_output(input);
        assert_eq!(output, "Hello, this is a response from AI.");
    }
}
