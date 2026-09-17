import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendPromptSubmit,
  authorizeHello,
  buildPairingUrl,
  CONTROL_BYTES,
  decodeBase64Bytes,
  encodeBase64Bytes,
  isWorkspacePathAllowed,
  parsePairingUrl,
  shouldSubmitPromptKey,
  stripAnsi,
  terminalWriteText,
  toWebSocketUrl,
  validateSessionWrite,
} from '../src/relayProtocol.ts';

test('authorizeHello requires desktop to create the room', () => {
  assert.deepEqual(
    authorizeHello({ tokenHash: null, revoked: false }, 'browser', 'hash'),
    { ok: false, error: 'desktop must pair first' },
  );
  assert.deepEqual(
    authorizeHello({ tokenHash: null, revoked: false }, 'desktop', 'hash'),
    { ok: true, storeHash: 'hash' },
  );
});

test('authorizeHello accepts the stored token and rejects others', () => {
  assert.deepEqual(
    authorizeHello({ tokenHash: 'hash', revoked: false }, 'browser', 'hash'),
    { ok: true },
  );
  assert.deepEqual(
    authorizeHello({ tokenHash: 'hash', revoked: false }, 'browser', 'nope'),
    { ok: false, error: 'invalid token' },
  );
  assert.deepEqual(
    authorizeHello({ tokenHash: 'hash', revoked: true }, 'desktop', 'hash'),
    { ok: false, error: 'revoked' },
  );
});

test('pairing URL round-trips through hash token', () => {
  const url = buildPairingUrl('https://tde-relay.example.workers.dev/', 'room-1', 'secret');
  assert.equal(url, 'https://tde-relay.example.workers.dev/r/room-1#t=secret');
  assert.deepEqual(parsePairingUrl(url), {
    relayUrl: 'https://tde-relay.example.workers.dev',
    roomId: 'room-1',
    token: 'secret',
  });
  assert.equal(
    toWebSocketUrl('https://tde-relay.example.workers.dev', 'room-1'),
    'wss://tde-relay.example.workers.dev/ws/room-1',
  );
});

test('workspace path allowlist blocks parent escapes', () => {
  assert.equal(isWorkspacePathAllowed('/Users/ray/proj/src/main.rs', ['/Users/ray/proj']), true);
  assert.equal(isWorkspacePathAllowed('/Users/ray/proj/../secret', ['/Users/ray/proj']), false);
  assert.equal(isWorkspacePathAllowed('/etc/passwd', ['/Users/ray/proj']), false);
});

test('control bytes and prompt submit stay stable', () => {
  assert.deepEqual(CONTROL_BYTES['ctrl-c'], [0x03]);
  assert.deepEqual(CONTROL_BYTES.left, [0x1b, 0x5b, 0x44]);
  assert.deepEqual(CONTROL_BYTES.right, [0x1b, 0x5b, 0x43]);
  assert.deepEqual(CONTROL_BYTES.y, [0x79, 0x0d]);
  assert.equal(appendPromptSubmit('hello'), 'hello\r');
  assert.equal(appendPromptSubmit('hello\r'), 'hello\r');
});

test('stripAnsi removes CSI sequences', () => {
  assert.equal(stripAnsi('\x1b[32mok\x1b[0m'), 'ok');
});

test('terminal writes keep raw ANSI instead of stripping it', () => {
  const raw = '\x1b[32mhello\x1b[0m\r\n';
  const encoded = encodeBase64Bytes(new TextEncoder().encode(raw));
  const decoded = terminalWriteText(decodeBase64Bytes(encoded));
  assert.equal(decoded.includes('\x1b[32m'), true);
  assert.equal(decoded, raw);
  assert.notEqual(stripAnsi(decoded), decoded);
});

test('prompt Enter is ignored during IME composition', () => {
  assert.equal(shouldSubmitPromptKey({ key: 'Enter' }), true);
  assert.equal(shouldSubmitPromptKey({ key: 'Enter', isComposing: true }), false);
  assert.equal(shouldSubmitPromptKey({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(shouldSubmitPromptKey({ key: 'a' }), false);
});

test('session writes require a selected session', () => {
  assert.equal(validateSessionWrite('', true), 'Select a session first.');
  assert.equal(validateSessionWrite('sess-1', false), null);
  assert.equal(validateSessionWrite('sess-1', true), null);
});
