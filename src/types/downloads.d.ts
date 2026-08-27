declare global {
  type OnlineTrackResult = import('../main/downloads/models/downloadTypes').OnlineTrackResult;
  type OnlinePlaylistInfo = import('../main/downloads/models/downloadTypes').OnlinePlaylistInfo;
  type DownloadJobState = import('../main/downloads/models/downloadTypes').DownloadJobState;
  type DownloadsSnapshot = import('../main/downloads/models/downloadTypes').DownloadsSnapshot;
  type DuplicatePolicy = import('../main/downloads/models/downloadTypes').DuplicatePolicy;
  type EnqueueDownloadInput = import('../main/downloads/models/downloadTypes').EnqueueDownloadInput;
}

export {};
