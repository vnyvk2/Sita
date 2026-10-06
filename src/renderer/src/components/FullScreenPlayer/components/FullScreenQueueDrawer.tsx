import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import QueueContainer from '../../MiniPlayer/containers/QueueContainer';

interface FullScreenQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullScreenQueueDrawer = memo(({ isOpen, onClose }: FullScreenQueueDrawerProps) => {
  const { t } = useTranslation();

  // NOTE: Escape is owned solely by FullScreenPlayer (bubble listener) which closes
  // the drawer first when open. No capture listener here to avoid window
  // capture-vs-bubble double-handling requiring stopImmediatePropagation.

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <button
          type="button"
          data-testid="fullscreen-queue-backdrop"
          aria-label={t('common.close', 'Close')}
          tabIndex={-1}
          onClick={onClose}
          className="fixed inset-0 z-30 cursor-default border-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* Slide-over Drawer Panel */}
      <aside
        data-testid="fullscreen-queue-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('player.currentQueue', 'Queue')}
        className={`fixed top-0 right-0 z-40 flex h-full w-[420px] max-w-[92vw] flex-col border-l border-white/10 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out select-none ${
          isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-xl text-white/80">queue_music</span>
            <h2 className="text-base font-semibold text-white">
              {t('player.currentQueue', 'Current Queue')}
            </h2>
          </div>
          <button
            type="button"
            data-testid="fullscreen-queue-close-btn"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            aria-label={t('common.close', 'Close')}
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Virtualized Queue List Container */}
        <div className="min-h-0 flex-1 pt-2">
          <QueueContainer isQueueVisible={isOpen} />
        </div>
      </aside>
    </>
  );
});

FullScreenQueueDrawer.displayName = 'FullScreenQueueDrawer';
export default FullScreenQueueDrawer;
