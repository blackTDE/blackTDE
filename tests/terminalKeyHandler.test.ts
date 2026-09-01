import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTerminalKeyEvent, type TerminalKeyHandlerContext } from '../src/terminalKeyHandler.ts';

const createMockContext = () => {
  let clipboard = '';
  let pasted = '';
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
    writeClipboard: async (text: string) => {
      clipboard = text;
    },
    readClipboard: async () => 'clipboard content',
  };

  return {
    context,
    getClipboard: () => clipboard,
    getPasted: () => pasted,
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
