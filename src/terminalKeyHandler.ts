/**
 * Custom keyboard shortcut handler for xterm.js terminal instances.
 * Enables standard OS clipboard and navigation operations (Cmd+C, Cmd+V, Cmd+A, Cmd+K, etc.)
 */

export interface TerminalKeyHandlerContext {
  hasSelection: () => boolean;
  getSelection: () => string;
  paste: (text: string) => void;
  selectAll: () => void;
  clear: () => void;
  writeClipboard: (text: string) => Promise<void>;
  readClipboard: () => Promise<string>;
}

export const handleTerminalKeyEvent = (
  event: KeyboardEvent,
  context: TerminalKeyHandlerContext
): boolean => {
  // If IME is currently composing or processing (e.g. Chinese/Japanese/Korean input), let browser and xterm handle it naturally
  if (event.isComposing || event.keyCode === 229) {
    return true;
  }

  if (event.type !== 'keydown') {
    return true;
  }

  const isCmd = event.metaKey;
  const isCtrl = event.ctrlKey;
  const key = event.key.toLowerCase();

  // Copy: Cmd+C (macOS) or Ctrl+Shift+C (Linux/Windows) or Ctrl+C with active selection
  if ((isCmd && key === 'c') || (isCtrl && event.shiftKey && key === 'c')) {
    if (context.hasSelection()) {
      const selection = context.getSelection();
      if (selection) {
        event.preventDefault?.();
        event.stopPropagation?.();
        context.writeClipboard(selection).catch(console.error);
      }
      return false; // Intercepted and handled
    }
    // On macOS with Cmd+C and no selection, intercept to prevent transmitting unexpected character
    if (isCmd && !isCtrl) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return false;
    }
  }

  // Paste: Cmd+V (macOS), Ctrl+V (Windows/Linux), or Ctrl+Shift+V
  if ((isCmd && key === 'v') || (isCtrl && key === 'v')) {
    event.preventDefault?.();
    event.stopPropagation?.();
    context
      .readClipboard()
      .then((text) => {
        if (text) {
          context.paste(text);
        }
      })
      .catch(console.error);
    return false; // Intercepted and handled
  }

  // Select All: Cmd+A (macOS)
  if (isCmd && key === 'a' && !event.shiftKey && !event.altKey) {
    event.preventDefault?.();
    event.stopPropagation?.();
    context.selectAll();
    return false;
  }

  // Clear Terminal: Cmd+K (macOS)
  if (isCmd && key === 'k' && !event.shiftKey && !event.altKey) {
    event.preventDefault?.();
    event.stopPropagation?.();
    context.clear();
    return false;
  }

  return true;
};
