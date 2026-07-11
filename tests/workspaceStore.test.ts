import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

const resetPaneState = () => {
  useWorkspaceStore.setState({
    activeWorkspace: { id: 'project', name: 'Project', path: '/project' },
    activeSessionId: null,
    paneLayout: {
      type: '1x2',
      activePaneIndex: 0,
      panes: [null, null, null, null],
    },
    paneLayoutsByProject: {},
  });
};

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
