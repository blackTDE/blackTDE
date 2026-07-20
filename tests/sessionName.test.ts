import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

test('updates session display name in store state', () => {
  const store = useWorkspaceStore.getState();
  store.addSession({
    id: 'test-sess-name-1',
    name: 'Original Session Label',
    agentType: 'claude',
    cwd: '/tmp',
    provider: 'anthropic',
    cmd: 'claude',
    args: [],
  });

  assert.equal(useWorkspaceStore.getState().sessions['test-sess-name-1'].name, 'Original Session Label');

  store.setSessionNameLocal('test-sess-name-1', 'Renamed Backend Shell');
  assert.equal(useWorkspaceStore.getState().sessions['test-sess-name-1'].name, 'Renamed Backend Shell');

  // Cleanup
  store.removeSession('test-sess-name-1');
});
