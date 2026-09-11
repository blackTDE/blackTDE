import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRepoNameFromUrl,
  getDefaultCloneParent,
  buildCloneTargetPath,
} from '../src/utils/gitUrlUtils.ts';

test('extractRepoNameFromUrl extracts repo name from HTTPS URLs', () => {
  assert.equal(extractRepoNameFromUrl('https://github.com/astral-sh/uv.git'), 'uv');
  assert.equal(extractRepoNameFromUrl('https://github.com/astral-sh/uv'), 'uv');
  assert.equal(extractRepoNameFromUrl('https://github.com/astral-sh/uv/'), 'uv');
  assert.equal(extractRepoNameFromUrl('https://gitlab.com/group/subgroup/my-service.git'), 'my-service');
  assert.equal(extractRepoNameFromUrl('https://github.com/owner/repo.git?token=123#branch'), 'repo');
});

test('extractRepoNameFromUrl extracts repo name from SSH URLs', () => {
  assert.equal(extractRepoNameFromUrl('git@github.com:facebook/react.git'), 'react');
  assert.equal(extractRepoNameFromUrl('git@github.com:facebook/react'), 'react');
  assert.equal(extractRepoNameFromUrl('ssh://git@github.com/facebook/react.git'), 'react');
  assert.equal(extractRepoNameFromUrl('git@gitlab.company.com:7999/team/core-api.git'), 'core-api');
});

test('extractRepoNameFromUrl handles edge cases and file paths', () => {
  assert.equal(extractRepoNameFromUrl('file:///path/to/local-repo.git'), 'local-repo');
  assert.equal(extractRepoNameFromUrl('/Users/ray/local-repo.git'), 'local-repo');
  assert.equal(extractRepoNameFromUrl(''), '');
  assert.equal(extractRepoNameFromUrl('   '), '');
  assert.equal(extractRepoNameFromUrl('just-a-name'), 'just-a-name');
});

test('getDefaultCloneParent determines parent directory correctly', () => {
  const workspaces = [
    { path: '/Users/ray/git-repo/project1' },
    { path: '/Users/ray/git-repo/project2' },
  ];

  assert.equal(getDefaultCloneParent(workspaces, '/Users/ray/git-repo/black_tde'), '/Users/ray/git-repo');
  assert.equal(getDefaultCloneParent(workspaces, undefined), '/Users/ray/git-repo');
  assert.equal(getDefaultCloneParent([], undefined), '');
});

test('buildCloneTargetPath constructs clean joined paths', () => {
  assert.equal(buildCloneTargetPath('/Users/ray/projects', 'my-repo'), '/Users/ray/projects/my-repo');
  assert.equal(buildCloneTargetPath('/Users/ray/projects/', '/my-repo/'), '/Users/ray/projects/my-repo');
  assert.equal(buildCloneTargetPath('C:\\projects\\', 'my-repo'), 'C:/projects/my-repo');
  assert.equal(buildCloneTargetPath('', 'my-repo'), 'my-repo');
});
