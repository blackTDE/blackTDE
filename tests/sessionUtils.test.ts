import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSessions } from '../src/sessionUtils.ts';

test('keeps one canonical local row per remote session', () => {
  const sessions = [
    {
      id: 'newer-terminated',
      agent_type: 'claude',
      cwd: '/project',
      remote_session_id: 'remote-1',
      status: 'terminated',
    },
    {
      id: 'older-active',
      agent_type: 'claude',
      cwd: '/project',
      remote_session_id: 'remote-1',
      status: 'active',
    },
  ];

  assert.deepEqual(dedupeSessions(sessions).map((session) => session.id), ['older-active']);
});

test('keeps unrelated local shells without remote IDs', () => {
  const sessions = [
    { id: 'shell-1', agent_type: 'zsh', cwd: '/project', remote_session_id: null },
    { id: 'shell-2', agent_type: 'zsh', cwd: '/project', remote_session_id: null },
  ];

  assert.deepEqual(dedupeSessions(sessions).map((session) => session.id), ['shell-1', 'shell-2']);
});
