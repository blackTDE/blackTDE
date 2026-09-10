import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRemoteSlashCommand,
  normalizePairCode,
  isValidPairCode,
} from '../src/remoteUtils.ts';

test('parseRemoteSlashCommand parses /help and /start', () => {
  assert.deepEqual(parseRemoteSlashCommand('/help'), { type: 'help' });
  assert.deepEqual(parseRemoteSlashCommand('  /start  '), { type: 'help' });
});

test('parseRemoteSlashCommand parses /project list', () => {
  assert.deepEqual(parseRemoteSlashCommand('/project list'), { type: 'project_list' });
  assert.deepEqual(parseRemoteSlashCommand('  /project   list  '), { type: 'project_list' });
});

test('parseRemoteSlashCommand parses /project list session and /session list', () => {
  assert.deepEqual(parseRemoteSlashCommand('/project list session'), { type: 'session_list' });
  assert.deepEqual(parseRemoteSlashCommand('/project list sessions'), { type: 'session_list' });
  assert.deepEqual(parseRemoteSlashCommand('/session list'), { type: 'session_list' });
});

test('parseRemoteSlashCommand parses /switch project session <id> and /switch <id>', () => {
  assert.deepEqual(
    parseRemoteSlashCommand('/switch project session sess-12345'),
    { type: 'switch_session', sessionId: 'sess-12345' }
  );
  assert.deepEqual(
    parseRemoteSlashCommand('/switch sess-999'),
    { type: 'switch_session', sessionId: 'sess-999' }
  );
});

test('parseRemoteSlashCommand treats plain text as agent input', () => {
  assert.deepEqual(
    parseRemoteSlashCommand('git status'),
    { type: 'agent_input', text: 'git status' }
  );
  assert.deepEqual(
    parseRemoteSlashCommand('hello world! please help me write code'),
    { type: 'agent_input', text: 'hello world! please help me write code' }
  );
});

test('normalizePairCode and isValidPairCode format and validate 6-char codes', () => {
  assert.equal(normalizePairCode('123456'), '123456');
  assert.equal(normalizePairCode(' 8a-9b-2c '), '8A9B2C');
  assert.equal(isValidPairCode('123456'), true);
  assert.equal(isValidPairCode('8A9B2C'), true);
  assert.equal(isValidPairCode('12345'), false); // too short
  assert.equal(isValidPairCode('1234567'), true); // normalized to 6 chars
  assert.equal(isValidPairCode('!@#$%^'), false); // invalid characters
});
