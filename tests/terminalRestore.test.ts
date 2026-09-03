import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoredTerminalViewportLine,
  terminalScrollOffset,
  restoreTerminal,
} from '../src/terminalRestore.ts';

test('keeps the same scrollback distance from the bottom after terminal resize', () => {
  const offset = terminalScrollOffset(240, 190);
  assert.equal(offset, 50);
  assert.equal(restoredTerminalViewportLine(310, offset), 260);
  assert.equal(restoredTerminalViewportLine(20, 50), 0);
});

const createActions = (active: boolean | Error) => {
  const events: string[] = [];
  return {
    events,
    actions: {
      lookupActive: async () => {
        events.push('lookup');
        if (active instanceof Error) throw active;
        return active;
      },
      reset: () => { events.push('reset'); },
      resume: async () => { events.push('resume'); },
      fitAndResize: () => { events.push('fit'); },
      setReady: () => { events.push('ready'); },
      onLookupError: () => { events.push('error'); },
    },
  };
};

test('keeps an active terminal screen without replaying raw PTY history', async () => {
  const { actions, events } = createActions(true);

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'fit', 'ready']);
});

test('resumes a terminated terminal after measuring it', async () => {
  const { actions, events } = createActions(false);

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'reset', 'fit', 'resume', 'fit', 'ready']);
});

test('replays local shell history after reset and before resume', async () => {
  const { actions, events } = createActions(false);
  Object.assign(actions, {
    replayHistory: async () => { events.push('history'); },
  });

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'reset', 'fit', 'history', 'resume', 'fit', 'ready']);
});

test('does not replay raw PTY history when active lookup fails', async () => {
  const { actions, events } = createActions(new Error('lookup failed'));

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'error', 'fit', 'ready']);
});

test('waits for resize completion before marking ready', async () => {
  const { actions, events } = createActions(true);
  let finishResize: (() => void) | undefined;
  actions.fitAndResize = () => new Promise<void>((resolve) => {
    events.push('fit');
    finishResize = resolve;
  });

  const restoring = restoreTerminal(actions);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(events.includes('ready'), false);
  assert.ok(finishResize);
  finishResize();
  await restoring;
  assert.deepEqual(events, ['lookup', 'fit', 'ready']);
});

test('identifies spurious terminal device attribute and version query responses', async () => {
  const { isSpuriousTerminalQueryResponse } = await import('../src/terminalRestore.ts');

  // Primary Device Attributes (DA1)
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[?1;2c'), true);
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[?62;1;2;4;6;7;8;9;15;18;21;22;28c'), true);

  // Secondary Device Attributes (DA2)
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[>0;276;0c'), true);
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[>1;10;0c'), true);

  // XTVERSION (Terminal name and version)
  assert.equal(isSpuriousTerminalQueryResponse('\x1bP>|xterm.js(6.1.0-beta.288)\x1b\\'), true);
  assert.equal(isSpuriousTerminalQueryResponse('xterm.js(6.1.0-beta.288)'), true);

  // Regular input / arrows / control keys must NOT be filtered
  assert.equal(isSpuriousTerminalQueryResponse('ls -la\n'), false);
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[A'), false); // Up arrow
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[B'), false); // Down arrow
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[C'), false); // Right arrow
  assert.equal(isSpuriousTerminalQueryResponse('\x1b[D'), false); // Left arrow
  assert.equal(isSpuriousTerminalQueryResponse('\x03'), false);   // Ctrl+C
  assert.equal(isSpuriousTerminalQueryResponse('1;2c'), false);   // normal text without escape prefix
});
