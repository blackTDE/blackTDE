import assert from 'node:assert/strict';
import test from 'node:test';
import { getAgentIconKind } from '../src/agentIcons.ts';

test('maps supported agent commands to their official icon', () => {
  assert.equal(getAgentIconKind('claude'), 'claude');
  assert.equal(getAgentIconKind('/usr/local/bin/codex'), 'codex');
  assert.equal(getAgentIconKind('agy'), 'antigravity');
  assert.equal(getAgentIconKind('Google Antigravity'), 'antigravity');
  assert.equal(getAgentIconKind('gemini'), 'gemini');
  assert.equal(getAgentIconKind('open-code'), 'opencode');
  assert.equal(getAgentIconKind('custom-agent'), 'fallback');
});
