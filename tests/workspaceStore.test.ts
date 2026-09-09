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
    openFiles: [],
    openFilesByProject: {},
    activeFileTab: null,
    activeFilePath: null,
    activeFileTabByProject: {},
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

test('manages multiple open file tabs and active tab switching correctly', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  // Open file A
  store.openFile('/project/src/a.ts', 'a.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/a.ts');
  assert.equal(useWorkspaceStore.getState().openFiles.length, 1);

  // Open file B
  store.openFile('/project/src/b.ts', 'b.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/b.ts');
  assert.equal(useWorkspaceStore.getState().openFiles.length, 2);
  assert.deepEqual(useWorkspaceStore.getState().openFiles, [
    { path: '/project/src/a.ts', name: 'a.ts' },
    { path: '/project/src/b.ts', name: 'b.ts' },
  ]);

  // Switch active tab back to file A
  store.setActiveFileTab('/project/src/a.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/a.ts');
  // Open files list must remain intact with all opened files
  assert.equal(useWorkspaceStore.getState().openFiles.length, 2);

  // Close file B
  store.closeFile('/project/src/b.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/a.ts');
  assert.equal(useWorkspaceStore.getState().openFiles.length, 1);
});

test('closes and reopens top project workspace tabs correctly', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, ['proj-1', 'proj-2', 'proj-3']);

  // Close proj-2 tab
  store.closeWorkspaceTab('proj-2');
  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, ['proj-1', 'proj-3']);

  // Reopen proj-2 tab
  store.openWorkspaceTab('proj-2');
  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, ['proj-1', 'proj-3', 'proj-2']);

  // Close remaining tabs
  store.closeWorkspaceTab('proj-1');
  store.closeWorkspaceTab('proj-3');
  store.closeWorkspaceTab('proj-2');
  assert.deepEqual(useWorkspaceStore.getState().openWorkspaceTabIds, []);
});

test('switches from file preview back to session when session is activated in unpinned mode, but retains file preview when pinned', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  // 1. Unpinned mode (default: isSessionPinned = false)
  useWorkspaceStore.setState({ isSessionPinned: false });
  store.openFile('/project/src/preview.ts', 'preview.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/preview.ts');
  assert.equal(useWorkspaceStore.getState().openFiles.length, 1);

  // User clicks session tab -> setActiveSession
  store.setActiveSession('sess-1');
  // File preview should be cleared to reveal session panel
  assert.equal(useWorkspaceStore.getState().activeFileTab, null);
  // Opened files list should remain intact in tabs bar
  assert.equal(useWorkspaceStore.getState().openFiles.length, 1);
  assert.equal(useWorkspaceStore.getState().openFiles[0].path, '/project/src/preview.ts');

  // 2. Pinned mode (isSessionPinned = true)
  useWorkspaceStore.setState({ isSessionPinned: true });
  store.setActiveFileTab('/project/src/preview.ts');
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/preview.ts');

  // User clicks session tab in pinned mode
  store.setActiveSession('sess-2');
  // Both panels remain open simultaneously: activeFileTab is preserved
  assert.equal(useWorkspaceStore.getState().activeFileTab, '/project/src/preview.ts');
  assert.equal(useWorkspaceStore.getState().activeSessionId, 'sess-2');
});

test('manages web tabs per project isolation and connects with center preview tabs', () => {
  resetPaneState();
  const store = useWorkspaceStore.getState();

  // Project 1 (active workspace: proj-1)
  store.setWorkspace({ id: 'proj-1', name: 'Proj 1', path: '/proj1' });
  store.openWebTab('http://localhost:3000', 'Localhost 3000', 'task-1');

  const p1Files = useWorkspaceStore.getState().openFiles;
  assert.equal(p1Files.length, 1);
  assert.ok(p1Files[0].path.startsWith('web:'));
  assert.equal(p1Files[0].name, 'Localhost 3000');
  assert.equal(useWorkspaceStore.getState().activeFileTab, p1Files[0].path);

  const tabId1 = p1Files[0].path.replace('web:', '');
  const webTab1 = useWorkspaceStore.getState().webTabs[tabId1];
  assert.equal(webTab1.url, 'http://localhost:3000');
  assert.equal(webTab1.ownership, 'agent');

  // Switch to Project 2 (proj-2)
  store.setWorkspace({ id: 'proj-2', name: 'Proj 2', path: '/proj2' });
  // Project 2 should have 0 open tabs initially
  assert.equal(useWorkspaceStore.getState().openFiles.length, 0);
  assert.equal(useWorkspaceStore.getState().activeFileTab, null);

  // Open web tab in Project 2
  store.openWebTab('https://github.com/citrolabs/ego-lite', 'ego-lite', 'task-2');
  const p2Files = useWorkspaceStore.getState().openFiles;
  assert.equal(p2Files.length, 1);
  assert.ok(p2Files[0].path.startsWith('web:'));
  assert.equal(p2Files[0].name, 'ego-lite');

  // Switch back to Project 1 (proj-1)
  store.setWorkspace({ id: 'proj-1', name: 'Proj 1', path: '/proj1' });
  // Project 1 should restore its own web tab
  assert.equal(useWorkspaceStore.getState().openFiles.length, 1);
  assert.equal(useWorkspaceStore.getState().openFiles[0].name, 'Localhost 3000');

  // Close web tab in Project 1
  store.closeWebTab(tabId1);
  assert.equal(useWorkspaceStore.getState().openFiles.length, 0);
  assert.equal(useWorkspaceStore.getState().activeFileTab, null);
});

