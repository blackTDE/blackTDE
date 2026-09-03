import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getParentDirectory,
  resolveCreationDirectory,
  getRelativeDisplayPath,
  getRelativePath,
} from '../src/utils/fileTreeUtils.ts';

test('getParentDirectory extracts parent directory correctly', () => {
  assert.equal(getParentDirectory('/workspace/src/components/FileTree.tsx'), '/workspace/src/components');
  assert.equal(getParentDirectory('/workspace/src/components'), '/workspace/src');
  assert.equal(getParentDirectory('/workspace'), '/');
  assert.equal(getParentDirectory('/'), '/');
});

test('resolveCreationDirectory resolves target directory for new file/folder', () => {
  const root = '/workspace/black_tde';

  // No selection -> root
  assert.equal(resolveCreationDirectory(root, null, false), root);

  // Directory selected -> that directory
  assert.equal(
    resolveCreationDirectory(root, '/workspace/black_tde/src/components', true),
    '/workspace/black_tde/src/components'
  );

  // File selected -> file's parent directory
  assert.equal(
    resolveCreationDirectory(root, '/workspace/black_tde/src/components/FileTree.tsx', false),
    '/workspace/black_tde/src/components'
  );

  // Root level file selected -> root
  assert.equal(
    resolveCreationDirectory(root, '/workspace/black_tde/package.json', false),
    '/workspace/black_tde'
  );
});

test('getRelativeDisplayPath formats relative path for UI badges', () => {
  const root = '/workspace/black_tde';

  assert.equal(getRelativeDisplayPath(root, root), root);
  assert.equal(getRelativeDisplayPath(root, '/workspace/black_tde/src/components'), 'src/components');
  assert.equal(getRelativeDisplayPath(root, '/workspace/black_tde/src'), 'src');
});

test('getRelativePath computes clean relative paths for clipboard copying', () => {
  const root = '/workspace/black_tde';

  assert.equal(getRelativePath(root, root), '.');
  assert.equal(getRelativePath(root, '/workspace/black_tde/src/components/FileTree.tsx'), 'src/components/FileTree.tsx');
  assert.equal(getRelativePath(root, '/workspace/black_tde/src/main.rs'), 'src/main.rs');
  assert.equal(getRelativePath(root, '/other/external/file.txt'), '/other/external/file.txt');
});
