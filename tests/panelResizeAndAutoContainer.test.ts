import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

test('manages panel widths and right panel pin state', () => {
  const store = useWorkspaceStore.getState();
  assert.equal(store.leftPanelWidth, 320);
  assert.equal(store.rightPanelWidth, 320);
  assert.equal(store.pinnedSessionWidthPercent, 50);
  assert.equal(store.isRightPanelPinned, true);

  store.setLeftPanelWidth(400);
  assert.equal(useWorkspaceStore.getState().leftPanelWidth, 400);

  store.setRightPanelWidth(350);
  assert.equal(useWorkspaceStore.getState().rightPanelWidth, 350);

  store.setPinnedSessionWidthPercent(60);
  assert.equal(useWorkspaceStore.getState().pinnedSessionWidthPercent, 60);

  store.toggleRightPanelPin();
  assert.equal(useWorkspaceStore.getState().isRightPanelPinned, false);

  store.setRightPanelPinned(true);
  assert.equal(useWorkspaceStore.getState().isRightPanelPinned, true);
});
