export type DownloadStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface DownloadProgress {
  transfer_id: string;
  host: string;
  file_name: string;
  local_path: string;
  transferred_bytes: number;
  total_bytes: number;
  speed_bytes_per_second: number;
  status: DownloadStatus;
  error: string | null;
}

export interface DownloadTransfer extends DownloadProgress {
  started_at: number;
}

export const applyDownloadProgress = (
  transfers: DownloadTransfer[],
  progress: DownloadProgress,
): DownloadTransfer[] => {
  const existing = transfers.find((transfer) => transfer.transfer_id === progress.transfer_id);
  const updated = existing
    ? transfers.map((transfer) => transfer.transfer_id === progress.transfer_id
      ? { ...transfer, ...progress }
      : transfer)
    : [{ ...progress, started_at: Date.now() }, ...transfers];
  return updated.slice(0, 20);
};

export const downloadPercent = (transfer: DownloadTransfer): number =>
  transfer.total_bytes > 0
    ? Math.min(100, Math.round((transfer.transferred_bytes / transfer.total_bytes) * 100))
    : 0;

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};
