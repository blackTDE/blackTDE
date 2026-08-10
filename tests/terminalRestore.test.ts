import test from 'node:test';
import assert from 'node:assert/strict';
import { modifiedEnterSequence, restoreTerminal } from '../src/terminalRestore.ts';

test('encodes Shift+Enter separately from ordinary Enter', () => {
  assert.equal(modifiedEnterSequence({ type: 'keydown', key: 'Enter', shiftKey: true }), '\x1b[13;2u');
  assert.equal(modifiedEnterSequence({ type: 'keydown', key: 'Enter', shiftKey: false }), null);
  assert.equal(modifiedEnterSequence({ type: 'keyup', key: 'Enter', shiftKey: true }), null);
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
