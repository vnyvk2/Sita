import { store } from '@renderer/store/store';
import { useCallback, useEffect, useState } from 'react';

// Singleton Audio Element for all track preview auditions
let previewAudio: HTMLAudioElement | null = null;
let currentPreviewId: string | number | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

function getOrCreateAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (!previewAudio) {
    previewAudio = new Audio();
    previewAudio.volume = 0.8;

    previewAudio.addEventListener('ended', () => {
      currentPreviewId = null;
      notifyListeners();
    });

    previewAudio.addEventListener('pause', () => {
      notifyListeners();
    });

    previewAudio.addEventListener('play', () => {
      notifyListeners();
    });

    previewAudio.addEventListener('error', (e) => {
      console.warn('Preview audio playback error:', e);
      currentPreviewId = null;
      notifyListeners();
    });
  }
  return previewAudio;
}

// Auto-pause audition preview if main player starts playing a local track
if (typeof window !== 'undefined') {
  store.subscribe((state) => {
    const isMainPlaying = (state as any)?.player?.isCurrentSongPlaying;
    if (isMainPlaying && previewAudio && !previewAudio.paused) {
      previewAudio.pause();
    }
  });
}

export function resetPreviewAudioForTesting() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  currentPreviewId = null;
  listeners.clear();
}

export function usePreviewAudio() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const isPlaying = previewAudio ? !previewAudio.paused : false;

  const playPreview = useCallback((id: string | number, url?: string) => {
    if (!url) return;
    const audio = getOrCreateAudio();
    if (!audio) return;

    if (currentPreviewId === id && !audio.paused) {
      audio.pause();
      return;
    }

    if (audio.src !== url) {
      audio.src = url;
    }
    currentPreviewId = id;
    audio.currentTime = 0;
    notifyListeners();

    audio.play().catch((err) => {
      console.warn('Preview play aborted or blocked:', err);
      currentPreviewId = null;
      notifyListeners();
    });
  }, []);

  const stopPreview = useCallback(() => {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = '';
      currentPreviewId = null;
      notifyListeners();
    }
  }, []);

  const isCurrentTrackPlaying = useCallback(
    (id: string | number) => {
      return currentPreviewId === id && isPlaying;
    },
    [isPlaying]
  );

  return {
    activePreviewId: currentPreviewId,
    isPlaying,
    playPreview,
    stopPreview,
    isCurrentTrackPlaying
  };
}
