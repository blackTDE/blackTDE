import test from 'node:test';
import assert from 'node:assert/strict';
import { canNavigateUp, resolveSftpPath } from '../src/sftpUtils.ts';

test('resolves relative sftp paths correctly', () => {
  // From home ("")
  assert.equal(resolveSftpPath('', 'projects'), 'projects');
  assert.equal(resolveSftpPath('', '..'), '');
  assert.equal(canNavigateUp(''), false);

  // From subfolder
  assert.equal(resolveSftpPath('projects', 'black_tde'), 'projects/black_tde');
  assert.equal(resolveSftpPath('projects/black_tde', '..'), 'projects');
  assert.equal(resolveSftpPath('projects', '..'), '');
  assert.equal(canNavigateUp('projects'), true);
});

test('resolves absolute sftp paths correctly', () => {
  // From root ("/")
  assert.equal(resolveSftpPath('/', 'var'), '/var');
  assert.equal(resolveSftpPath('/', '..'), '/');
  assert.equal(canNavigateUp('/'), false);

  // Nested absolute
  assert.equal(resolveSftpPath('/var', 'log'), '/var/log');
  assert.equal(resolveSftpPath('/var/log', 'nginx'), '/var/log/nginx');
  assert.equal(resolveSftpPath('/var/log/nginx', '..'), '/var/log');
  assert.equal(resolveSftpPath('/var/log', '..'), '/var');
  assert.equal(resolveSftpPath('/var', '..'), '/');
  assert.equal(canNavigateUp('/var'), true);
});

test('handles absolute destination jump and trailing slashes', () => {
  assert.equal(resolveSftpPath('projects', '/etc/nginx'), '/etc/nginx');
  assert.equal(resolveSftpPath('projects/', 'dist/'), 'projects/dist');
  assert.equal(resolveSftpPath('', '.'), '');
});
