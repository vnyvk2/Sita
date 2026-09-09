export {};

interface ParsedLyricLine {
  originalText: string | Array<{ text: string; start: number; end: number }>;
  start?: number;
  end?: number;
}

interface FloatingLyricsData {
  title?: string;
  artists?: string[];
  lyrics?: {
    isSynced: boolean;
    parsedLyrics: ParsedLyricLine[];
    offset?: number;
    unparsedLyrics?: string;
  };
}

declare global {
  interface Window {
    floatingLyricsApi: {
      onLyricsUpdate: (callback: (lyrics: FloatingLyricsData | null) => void) => () => void;
      onTimeUpdate: (callback: (time: number) => void) => () => void;
      onPlayStateChange: (callback: (isPlaying: boolean) => void) => () => void;
      onLockChange: (callback: (isLocked: boolean) => void) => () => void;
      getCurrentLyrics: () => Promise<FloatingLyricsData | null>;
      toggleLock: () => Promise<boolean>;
      closeWindow: () => void;
      setIgnoreMouseEvents: (ignore: boolean, forward?: boolean) => void;
      togglePlayPause: () => void;
      skipNext: () => void;
      skipPrevious: () => void;
    };
  }
}

// ========== STYLES ==========
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .lyrics-app {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    border-radius: 16px;
    padding: 8px 16px;
    transition: background 0.25s ease, backdrop-filter 0.25s ease, border-color 0.25s ease;
    background: transparent;
    border: 1px solid transparent;
  }

  .lyrics-app:not(.locked):hover {
    background: rgba(18, 18, 18, 0.78);
    backdrop-filter: blur(14px);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .toolbar {
    position: absolute;
    top: 8px;
    left: 12px;
    right: 12px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 10;
  }

  .lyrics-app:not(.locked):hover .toolbar {
    opacity: 1;
    pointer-events: auto;
  }

  .drag-handle {
    -webkit-app-region: drag;
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    cursor: grab;
    padding-left: 4px;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
    -webkit-app-region: no-drag;
  }

  .btn {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    outline: none;
    color: #ffffff;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.06);
  }

  .btn:active {
    transform: scale(0.95);
  }

  .btn.active {
    background: #f59e0b;
    color: #000000;
  }

  .lyrics-stage {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    overflow: hidden;
    padding: 24px 8px 8px;
  }

  .lyric-line {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
    transition: all 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9), 0 0 3px rgba(0, 0, 0, 0.95);
  }

  .line-prev {
    font-size: calc(var(--base-font-size) * 0.75);
    opacity: 0.45;
    transform: translateY(-2px);
  }

  .line-current {
    font-size: var(--base-font-size);
    font-weight: 700;
    color: #fbbf24;
    opacity: 1;
    transform: scale(1.03);
  }

  .line-next {
    font-size: calc(var(--base-font-size) * 0.75);
    opacity: 0.45;
    transform: translateY(2px);
  }

  .empty-state {
    font-size: var(--base-font-size);
    font-weight: 500;
    opacity: 0.7;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
  }
`;
document.head.appendChild(styleSheet);

// ========== STATE ==========
let currentLyrics: FloatingLyricsData | null = null;
let currentActiveIndex: number | null = null;
let isLocked = false;
let isPlaying = true;
let baseFontSize = parseInt(localStorage.getItem('nora_floating_lyrics_font_size') || '20', 10);

const app = document.getElementById('app')!;
app.style.setProperty('--base-font-size', `${baseFontSize}px`);

// ========== DOM BUILD ==========
const container = document.createElement('div');
container.className = 'lyrics-app';

container.innerHTML = `
  <div class="toolbar">
    <div class="drag-handle" id="dragTitle">Nora Floating Lyrics</div>
    <div class="controls">
      <button class="btn" id="btnPrev" title="Previous Song">
        <span class="material-symbols-rounded" style="font-size: 16px;">skip_previous</span>
      </button>
      <button class="btn" id="btnPlayPause" title="Play / Pause">
        <span class="material-symbols-rounded" id="iconPlayPause" style="font-size: 16px;">pause</span>
      </button>
      <button class="btn" id="btnNext" title="Next Song">
        <span class="material-symbols-rounded" style="font-size: 16px;">skip_next</span>
      </button>
      <button class="btn" id="btnFontDec" title="Decrease Font">A-</button>
      <button class="btn" id="btnFontInc" title="Increase Font">A+</button>
      <button class="btn" id="btnLock" title="Lock Window (Click-through)">
        <span class="material-symbols-rounded" id="iconLock" style="font-size: 16px;">lock_open</span>
      </button>
      <button class="btn" id="btnClose" title="Close">
        <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
      </button>
    </div>
  </div>
  <div class="lyrics-stage" id="stage">
    <div class="empty-state" id="emptyState">Listening for playback...</div>
    <div class="lyric-line line-prev" id="linePrev" style="display: none;"></div>
    <div class="lyric-line line-current" id="lineCurrent" style="display: none;"></div>
    <div class="lyric-line line-next" id="lineNext" style="display: none;"></div>
  </div>
`;

app.appendChild(container);

// ========== REFS ==========
const dragTitle = document.getElementById('dragTitle')!;
const emptyState = document.getElementById('emptyState')!;
const linePrev = document.getElementById('linePrev')!;
const lineCurrent = document.getElementById('lineCurrent')!;
const lineNext = document.getElementById('lineNext')!;
const iconPlayPause = document.getElementById('iconPlayPause')!;
const btnLock = document.getElementById('btnLock')!;
const iconLock = document.getElementById('iconLock')!;

// ========== HELPERS ==========
function getLineText(line?: ParsedLyricLine): string {
  if (!line) return '';
  if (typeof line.originalText === 'string') return line.originalText;
  if (Array.isArray(line.originalText)) {
    return line.originalText.map((word) => word.text).join('');
  }
  return '';
}

function binarySearchActiveLine(lines: ParsedLyricLine[], time: number, offset: number): number | null {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];
    const start = (line.start || 0) + offset;
    const end = line.end === Number.POSITIVE_INFINITY || !line.end ? Number.POSITIVE_INFINITY : line.end + offset;

    if (time < start) {
      high = mid - 1;
    } else if (time >= end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return null;
}

function updateDisplay(index: number | null) {
  if (!currentLyrics?.lyrics?.parsedLyrics?.length) {
    emptyState.style.display = 'block';
    emptyState.textContent = currentLyrics?.title ? `♪ ${currentLyrics.title} ♪` : 'No lyrics available';
    linePrev.style.display = 'none';
    lineCurrent.style.display = 'none';
    lineNext.style.display = 'none';
    return;
  }

  const lines = currentLyrics.lyrics.parsedLyrics;

  if (index === null || index < 0 || index >= lines.length) {
    // Show intro or first line preview
    emptyState.style.display = 'none';
    linePrev.style.display = 'none';
    lineCurrent.style.display = 'block';
    lineCurrent.textContent = currentLyrics.title ? `♪ ${currentLyrics.title} ♪` : '•••';
    lineNext.style.display = lines[0] ? 'block' : 'none';
    lineNext.textContent = getLineText(lines[0]);
    return;
  }

  emptyState.style.display = 'none';

  // Prev Line
  if (index > 0 && lines[index - 1]) {
    linePrev.style.display = 'block';
    linePrev.textContent = getLineText(lines[index - 1]);
  } else {
    linePrev.style.display = 'none';
  }

  // Current Line
  lineCurrent.style.display = 'block';
  lineCurrent.textContent = getLineText(lines[index]);

  // Next Line
  if (index + 1 < lines.length && lines[index + 1]) {
    lineNext.style.display = 'block';
    lineNext.textContent = getLineText(lines[index + 1]);
  } else {
    lineNext.style.display = 'none';
  }
}

// ========== BUTTON LISTENERS ==========
document.getElementById('btnPrev')?.addEventListener('click', () => {
  window.floatingLyricsApi?.skipPrevious();
});

document.getElementById('btnPlayPause')?.addEventListener('click', () => {
  window.floatingLyricsApi?.togglePlayPause();
});

document.getElementById('btnNext')?.addEventListener('click', () => {
  window.floatingLyricsApi?.skipNext();
});

document.getElementById('btnFontInc')?.addEventListener('click', () => {
  if (baseFontSize < 36) {
    baseFontSize += 2;
    app.style.setProperty('--base-font-size', `${baseFontSize}px`);
    localStorage.setItem('nora_floating_lyrics_font_size', baseFontSize.toString());
  }
});

document.getElementById('btnFontDec')?.addEventListener('click', () => {
  if (baseFontSize > 14) {
    baseFontSize -= 2;
    app.style.setProperty('--base-font-size', `${baseFontSize}px`);
    localStorage.setItem('nora_floating_lyrics_font_size', baseFontSize.toString());
  }
});

btnLock?.addEventListener('click', async () => {
  if (window.floatingLyricsApi) {
    const locked = await window.floatingLyricsApi.toggleLock();
    setLockState(locked);
  }
});

document.getElementById('btnClose')?.addEventListener('click', () => {
  window.floatingLyricsApi?.closeWindow();
});

function setLockState(locked: boolean) {
  isLocked = locked;
  if (isLocked) {
    container.classList.add('locked');
    btnLock.classList.add('active');
    iconLock.textContent = 'lock';
    window.floatingLyricsApi?.setIgnoreMouseEvents(true, true);
  } else {
    container.classList.remove('locked');
    btnLock.classList.remove('active');
    iconLock.textContent = 'lock_open';
    window.floatingLyricsApi?.setIgnoreMouseEvents(false, false);
  }
}

// ========== IPC SUBSCRIPTIONS ==========
if (window.floatingLyricsApi) {
  window.floatingLyricsApi.onLyricsUpdate((lyrics) => {
    currentLyrics = lyrics;
    if (lyrics?.title) {
      dragTitle.textContent = lyrics.title;
    }
    updateDisplay(currentActiveIndex);
  });

  window.floatingLyricsApi.onTimeUpdate((time) => {
    if (!currentLyrics?.lyrics?.isSynced || !currentLyrics.lyrics.parsedLyrics?.length) {
      return;
    }
    const offset = currentLyrics.lyrics.offset || 0;
    const activeIndex = binarySearchActiveLine(currentLyrics.lyrics.parsedLyrics, time, offset);

    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      updateDisplay(currentActiveIndex);
    }
  });

  window.floatingLyricsApi.onPlayStateChange((playing) => {
    isPlaying = playing;
    iconPlayPause.textContent = isPlaying ? 'pause' : 'play_arrow';
  });

  window.floatingLyricsApi.onLockChange((locked) => {
    setLockState(locked);
  });

  // Fetch initial lyrics
  window.floatingLyricsApi.getCurrentLyrics().then((lyrics) => {
    if (lyrics) {
      currentLyrics = lyrics;
      if (lyrics.title) {
        dragTitle.textContent = lyrics.title;
      }
      updateDisplay(currentActiveIndex);
    }
  });
}
