/// Strips ANSI escape codes and terminal artifacts from raw PTY output
pub fn clean_terminal_output(raw: &str) -> String {
    let mut result = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Check next character
            match chars.next() {
                Some('[') => {
                    // CSI sequence: parse until terminating byte (letters 0x40-0x7E)
                    while let Some(&next_c) = chars.peek() {
                        chars.next();
                        if (next_c as u32) >= 0x40 && (next_c as u32) <= 0x7E {
                            break;
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
                    // Character set specification
                    chars.next();
                }
                _ => {}
            }
        } else if c == '\r' {
            // Carriage return: ignore unless followed by something else
            if chars.peek() != Some(&'\n') {
                // If isolated \r, convert to newline or space
                result.push('\n');
            }
        } else if c == '\x08' {
            // Backspace: remove previous char if any
            result.pop();
        } else if c == '\t' {
            result.push_str("    ");
        } else if c >= ' ' || c == '\n' {
            result.push(c);
        }
    }

    // Clean up excessive blank lines (more than 2 consecutive newlines)
    let mut cleaned = String::new();
    let mut consecutive_newlines = 0;
    for ch in result.chars() {
        if ch == '\n' {
            consecutive_newlines += 1;
            if consecutive_newlines <= 2 {
                cleaned.push(ch);
            }
        } else {
            consecutive_newlines = 0;
            cleaned.push(ch);
        }
    }

    cleaned.trim().to_string()
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
}
