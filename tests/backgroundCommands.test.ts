import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const commandRunsOnThreadPool = (source: string, command: string) =>
  new RegExp(`#\\[tauri::command\\(async\\)\\]\\s*pub fn ${command}\\b`).test(source);

test('long-running Git and SFTP commands run outside the GUI thread', () => {
  const git = readFileSync(new URL('../src-tauri/src/git_runner.rs', import.meta.url), 'utf8');
  const sftp = readFileSync(new URL('../src-tauri/src/ssh_sftp.rs', import.meta.url), 'utf8');

  for (const command of ['git_fetch_remote', 'git_pull_remote', 'git_push_remote']) {
    assert.equal(commandRunsOnThreadPool(git, command), true, `${command} must use Tauri's thread pool`);
  }
  for (const command of ['sftp_list_dir', 'sftp_download_file', 'sftp_upload_file']) {
    assert.equal(commandRunsOnThreadPool(sftp, command), true, `${command} must use Tauri's thread pool`);
  }
});
