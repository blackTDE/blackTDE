import test from 'node:test';
import assert from 'node:assert/strict';
import { hasWorkspacePath, useWorkspaceStore } from '../src/store/workspaceStore.ts';

const resetPaneState = () => {
  useWorkspaceStore.setState({
    activeWorkspace: { id: 'project', name: 'Project', path: '/project' },
    activeSessionId: null,
    workspaces: [
      { id: 'proj-1', name: 'Proj 1', path: '/proj1' },
      { id: 'proj-2', name: 'Proj 2', path: '/proj2' },
      { id: 'proj-3', name: 'Proj 3', path: '/proj3' },
    ],
    openWorkspaceTabIds: ['proj-1', 'proj-2', 'proj-3'],
    sessions: {
      'sess-1': { id: 'sess-1', name: 'Shell 1', agentType: 'bash', cwd: '/proj1' },
      'sess-2': { id: 'sess-2', name: 'Shell 2', agentType: 'claude', cwd: '/proj1' },
      'sess-3': { id: 'sess-3', name: 'Shell 3', agentType: 'gemini', cwd: '/proj1' },
    },
    sessionOrderIdsByProject: {},
    paneLayout: {
      type: '1x2',
      activePaneIndex: 0,
      panes: [null, null, null, null],
    },
    paneLayoutsByProject: {},
  });
};

test('recognizes a project path with trailing separators as a duplicate', () => {
  assert.equal(hasWorkspacePath([{ id: 'project', name: 'Project', path: '/project' }], '/project/'), true);
  assert.equal(hasWorkspacePath([{ id: 'project', name: 'Project', path: '/project' }], '/other'), false);
});

test('moves an assigned session instead of duplicating it', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  store.setPaneSessionId(0, 'session-a');
  store.setPaneSessionId(1, 'session-a');

  assert.deepEqual(useWorkspaceStore.getState().paneLayout.panes, [null, 'session-a', null, null]);
});

test('ignores pane indexes outside the four available slots', () => {
  resetPaneState();

  useWorkspaceStore.getState().setPaneSessionId(4, 'session-a');

  assert.deepEqual(useWorkspaceStore.getState().paneLayout.panes, [null, null, null, null]);
});

test('clears the assigned session from saved layouts for other workspaces', () => {
  resetPaneState();
  useWorkspaceStore.setState({
    paneLayoutsByProject: {
      other: {
        type: '1x1',
        activePaneIndex: 0,
        panes: ['session-a', null, null, null],
      },
    },
  });

  useWorkspaceStore.getState().setPaneSessionId(1, 'session-a');

  assert.deepEqual(
    useWorkspaceStore.getState().paneLayoutsByProject.other.panes,
    [null, null, null, null],
  );
});

test('opens a search result at its target line and clears it for normal navigation', () => {
  resetPaneState();

  useWorkspaceStore.getState().openFile('/project/src/app.ts', 'app.ts', 42);
  assert.equal(useWorkspaceStore.getState().activeFileLine, 42);
  const firstNavigation = useWorkspaceStore.getState().fileNavigationCounter;

  useWorkspaceStore.getState().openFile('/project/src/app.ts', 'app.ts', 42);
  assert.equal(useWorkspaceStore.getState().fileNavigationCounter, firstNavigation + 1);

  useWorkspaceStore.getState().openFile('/project/src/app.ts', 'app.ts');
  assert.equal(useWorkspaceStore.getState().activeFileLine, null);
});

test('reorders workspace top tabs correctly', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  // Move proj-1 (index 0) to index 2
  store.reorderWorkspaceTabs(0, 2);
  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, ['proj-2', 'proj-3', 'proj-1']);

  // Move proj-1 (index 2) back to index 1
  store.reorderWorkspaceTabs(2, 1);
  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, ['proj-2', 'proj-1', 'proj-3']);
});

test('reorders session tabs for specific workspace correctly', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  // Move sess-1 (index 0) to index 2 in proj-1
  store.reorderSessionTabs('proj-1', 0, 2);
  assert.deepEqual(useWorkspaceStore.getState().sessionOrderIdsByProject['proj-1'], ['sess-2', 'sess-3', 'sess-1']);

  // Move sess-3 (index 1) to index 0
  store.reorderSessionTabs('proj-1', 1, 0);
  assert.deepEqual(useWorkspaceStore.getState().sessionOrderIdsByProject['proj-1'], ['sess-3', 'sess-2', 'sess-1']);
});
