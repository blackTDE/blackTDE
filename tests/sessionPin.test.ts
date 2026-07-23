import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

test('toggles session pin state in store', () => {
  const store = useWorkspaceStore.getState();
  assert.equal(store.isSessionPinned, false);

  store.toggleSessionPin();
  assert.equal(useWorkspaceStore.getState().isSessionPinned, true);

  store.setSessionPinned(false);
  assert.equal(useWorkspaceStore.getState().isSessionPinned, false);
});
