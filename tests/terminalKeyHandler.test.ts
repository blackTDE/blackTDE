import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTerminalKeyEvent, type TerminalKeyHandlerContext } from '../src/terminalKeyHandler.ts';

const createMockContext = () => {
  let clipboard = '';
  let pasted = '';
  let writtenInput = '';
  let selected = false;
  let cleared = false;
  let currentSelection = 'selected text';

  const context: TerminalKeyHandlerContext = {
    hasSelection: () => Boolean(currentSelection),
    getSelection: () => currentSelection,
    paste: (text: string) => {
      pasted = text;
    },
    selectAll: () => {
      selected = true;
    },
    clear: () => {
      cleared = true;
    },
    writeInput: (data: string) => {
      writtenInput = data;
    },
    writeClipboard: async (text: string) => {
      clipboard = text;
    },
    readClipboard: async () => 'clipboard content',
  };

  return {
    context,
    getClipboard: () => clipboard,
    getPasted: () => pasted,
    getWrittenInput: () => writtenInput,
    isSelected: () => selected,
    isCleared: () => cleared,
    setSelection: (text: string) => {
      currentSelection = text;
    },
  };
};

test('handles Cmd+C to copy when terminal has selection', async () => {
  const mock = createMockContext();
  const event = {
    type: 'keydown',
    key: 'c',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  const result = handleTerminalKeyEvent(event, mock.context);
  assert.equal(result, false);
  assert.equal(mock.getClipboard(), 'selected text');
});

test('handles Cmd+V to paste from clipboard and prevents default event bubbling', async () => {
  const mock = createMockContext();
  let defaultPrevented = false;
  let propagationStopped = false;
  const event = {
    type: 'keydown',
    key: 'v',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    stopPropagation: () => {
      propagationStopped = true;
    },
  } as unknown as KeyboardEvent;

  const result = handleTerminalKeyEvent(event, mock.context);
  assert.equal(result, false);
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
  // Wait microtask for async clipboard resolution
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(mock.getPasted(), 'clipboard content');
});

test('handles Ctrl+V to paste from clipboard on Windows/Linux', async () => {
  const mock = createMockContext();
  let defaultPrevented = false;
  const event = {
    type: 'keydown',
    key: 'v',
    metaKey: false,
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    stopPropagation: () => {},
  } as unknown as KeyboardEvent;

  const result = handleTerminalKeyEvent(event, mock.context);
  assert.equal(result, false);
  assert.equal(defaultPrevented, true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(mock.getPasted(), 'clipboard content');
});

test('handles Cmd+A to select all and Cmd+K to clear', () => {
  const mock = createMockContext();
  const selectAllEvent = {
    type: 'keydown',
    key: 'a',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  const clearEvent = {
    type: 'keydown',
    key: 'k',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(selectAllEvent, mock.context), false);
  assert.equal(mock.isSelected(), true);

  assert.equal(handleTerminalKeyEvent(clearEvent, mock.context), false);
  assert.equal(mock.isCleared(), true);
});

test('passes regular keys through to terminal', () => {
  const mock = createMockContext();
  const normalKeyEvent = {
    type: 'keydown',
    key: 'x',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(normalKeyEvent, mock.context), true);
});

test('passes IME composing and Chinese punctuation keys through to browser/xterm', () => {
  const mock = createMockContext();
  const imeComposingEvent = {
    type: 'keydown',
    key: 'Process',
    keyCode: 229,
    isComposing: true,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(imeComposingEvent, mock.context), true);

  const chinesePunctuationEvent = {
    type: 'keydown',
    key: '，',
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(chinesePunctuationEvent, mock.context), true);
});

test('handles Shift+Enter keydown to send newline without submitting prompt', () => {
  const mock = createMockContext();
  let defaultPrevented = false;
  let propagationStopped = false;

  const shiftEnterDown = {
    type: 'keydown',
    key: 'Enter',
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    stopPropagation: () => {
      propagationStopped = true;
    },
  } as unknown as KeyboardEvent;

  const result = handleTerminalKeyEvent(shiftEnterDown, mock.context);
  assert.equal(result, false);
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(mock.getWrittenInput(), '\n');
});

test('intercepts Shift+Enter keyup event to prevent xterm from triggering Enter submit', () => {
  const mock = createMockContext();
  let defaultPrevented = false;
  let propagationStopped = false;

  const shiftEnterUp = {
    type: 'keyup',
    key: 'Enter',
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    stopPropagation: () => {
      propagationStopped = true;
    },
  } as unknown as KeyboardEvent;

  const result = handleTerminalKeyEvent(shiftEnterUp, mock.context);
  assert.equal(result, false);
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
  // Keyup should NOT send an extra newline
  assert.equal(mock.getWrittenInput(), '');
});

test('allows regular Enter without Shift to pass through to xterm for prompt submit', () => {
  const mock = createMockContext();
  const enterEvent = {
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(enterEvent, mock.context), true);
  assert.equal(mock.getWrittenInput(), '');
});

test('allows Shift+Enter during IME composing to pass through to IME', () => {
  const mock = createMockContext();
  const imeShiftEnter = {
    type: 'keydown',
    key: 'Enter',
    shiftKey: true,
    isComposing: true,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  } as unknown as KeyboardEvent;

  assert.equal(handleTerminalKeyEvent(imeShiftEnter, mock.context), true);
  assert.equal(mock.getWrittenInput(), '');
});
