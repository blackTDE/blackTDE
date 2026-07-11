import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreTerminal } from '../src/terminalRestore.ts';

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
      replayHistory: async () => { events.push('history'); },
      reset: () => { events.push('reset'); },
      resume: async () => { events.push('resume'); },
      fitAndResize: () => { events.push('fit'); },
      setReady: () => { events.push('ready'); },
      redraw: async () => { events.push('redraw'); },
      onLookupError: () => { events.push('error'); },
    },
  };
};

test('redraws an active terminal without replaying transcript history', async () => {
  const { actions, events } = createActions(true);

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'fit', 'ready', 'redraw']);
});

test('resumes a terminated terminal before redrawing it', async () => {
  const { actions, events } = createActions(false);

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'reset', 'resume', 'fit', 'ready', 'redraw']);
});

test('replays history without resuming when active lookup fails', async () => {
  const { actions, events } = createActions(new Error('lookup failed'));

  await restoreTerminal(actions);

  assert.deepEqual(events, ['lookup', 'error', 'history', 'ready']);
});

test('waits for resize completion before marking ready and redrawing', async () => {
  const { actions, events } = createActions(true);
  let finishResize: (() => void) | undefined;
  actions.fitAndResize = () => new Promise<void>((resolve) => {
    events.push('fit');
    finishResize = resolve;
  });

  const restoring = restoreTerminal(actions);
  await Promise.resolve();

  assert.deepEqual(events, ['lookup', 'fit']);
  finishResize?.();
  await restoring;
  assert.deepEqual(events, ['lookup', 'fit', 'ready', 'redraw']);
});
