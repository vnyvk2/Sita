import { contextBridge, ipcRenderer } from 'electron';

export interface FloatingLyricsApi {
  onLyricsUpdate: (callback: (lyrics: any) => void) => () => void;
  onTimeUpdate: (callback: (time: number) => void) => () => void;
  onPlayStateChange: (callback: (isPlaying: boolean) => void) => () => void;
  onLockChange: (callback: (isLocked: boolean) => void) => () => void;
  getCurrentLyrics: () => Promise<any>;
  toggleLock: () => Promise<boolean>;
  closeWindow: () => void;
  setIgnoreMouseEvents: (ignore: boolean, forward?: boolean) => void;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrevious: () => void;
}

const api: FloatingLyricsApi = {
  onLyricsUpdate: (callback) => {
    const handler = (_: unknown, lyrics: any) => callback(lyrics);
    ipcRenderer.on('floating-lyrics/update-lyrics', handler);
    return () => ipcRenderer.removeListener('floating-lyrics/update-lyrics', handler);
  },
  onTimeUpdate: (callback) => {
    const handler = (_: unknown, time: number) => callback(time);
    ipcRenderer.on('floating-lyrics/update-time', handler);
    return () => ipcRenderer.removeListener('floating-lyrics/update-time', handler);
  },
  onPlayStateChange: (callback) => {
    const handler = (_: unknown, isPlaying: boolean) => callback(isPlaying);
    ipcRenderer.on('floating-lyrics/update-play-state', handler);
    return () => ipcRenderer.removeListener('floating-lyrics/update-play-state', handler);
  },
  onLockChange: (callback) => {
    const handler = (_: unknown, isLocked: boolean) => callback(isLocked);
    ipcRenderer.on('floating-lyrics/lock-changed', handler);
    return () => ipcRenderer.removeListener('floating-lyrics/lock-changed', handler);
  },
  getCurrentLyrics: () => ipcRenderer.invoke('floating-lyrics/get-lyrics'),
  toggleLock: () => ipcRenderer.invoke('floating-lyrics/toggle-lock'),
  closeWindow: () => ipcRenderer.send('floating-lyrics/close'),
  setIgnoreMouseEvents: (ignore, forward = true) =>
    ipcRenderer.send('floating-lyrics/set-ignore-mouse-events', ignore, forward),
  togglePlayPause: () => ipcRenderer.send('floating-lyrics/playback-toggle'),
  skipNext: () => ipcRenderer.send('floating-lyrics/playback-next'),
  skipPrevious: () => ipcRenderer.send('floating-lyrics/playback-prev')
};

contextBridge.exposeInMainWorld('floatingLyricsApi', api);
