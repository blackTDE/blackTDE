import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalShell, shellResumeMessage } from '../src/shellRestore.ts';

test('recognizes supported local shells but excludes SSH and agents', () => {
  assert.equal(isLocalShell('/bin/zsh'), true);
  assert.equal(isLocalShell('BASH'), true);
  assert.equal(isLocalShell('sh', ' '), true);
  assert.equal(isLocalShell('zsh', 'user@host'), false);
  assert.equal(isLocalShell('claude'), false);
});

test('describes shell resume outcomes accurately', () => {
  assert.equal(shellResumeMessage('reattached'), 'Shell session reattached');
  assert.equal(
    shellResumeMessage('restarted'),
    'Shell session restarted; saved scrollback restored',
  );
  assert.equal(shellResumeMessage('resumed'), 'Shell session resumed');
});
