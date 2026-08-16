import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDownloadProgress,
  downloadPercent,
  formatBytes,
  type DownloadTransfer,
} from '../src/sftpTransfers.ts';

test('updates download history with bounded progress and readable speed', () => {
  const queued: DownloadTransfer = {
    transfer_id: 'one', host: 'devbox', file_name: 'archive.zip', local_path: '/tmp/archive.zip',
    transferred_bytes: 0, total_bytes: 1000, speed_bytes_per_second: 0,
    status: 'queued', error: null, started_at: 1,
  };
  const [running] = applyDownloadProgress([queued], {
    ...queued,
    transferred_bytes: 1250,
    speed_bytes_per_second: 1536,
    status: 'running',
  });

  assert.equal(downloadPercent(running), 100);
  assert.equal(formatBytes(running.speed_bytes_per_second), '1.5 KB');
  assert.equal(running.started_at, 1);
});
