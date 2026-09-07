import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarResizerProps {
  onResize: (newRatio: number) => void;
  onReset: () => void;
  isMovableActive: boolean;
  onToggleMovable: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

export const SidebarResizer = memo(
  ({ onResize, onReset, isMovableActive, onToggleMovable, containerRef }: SidebarResizerProps) => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const startYRef = useRef<number>(0);
    const initialRatioRef = useRef<number>(0.5);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        startYRef.current = e.clientY;

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const currentY = e.clientY - rect.top;
          initialRatioRef.current = Math.min(Math.max(currentY / rect.height, 0.2), 0.8);
        }
      },
      [containerRef]
    );

    useEffect(() => {
      if (!isDragging) return;

      const handleMouseMove = (e: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const newRatio = Math.min(Math.max(relativeY / rect.height, 0.2), 0.8);
        onResize(newRatio);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isDragging, onResize, containerRef]);

    return (
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={t('sideBar.resizerAriaLabel', 'Playlist sidebar resizer')}
        className={`group relative flex h-6 w-full shrink-0 cursor-row-resize items-center justify-between px-3 transition-colors select-none ${
          isDragging || isMovableActive
            ? 'bg-background-color-3/20 dark:bg-dark-background-color-3/20'
            : 'hover:bg-background-color-1/60 dark:hover:bg-dark-background-color-1/60'
        }`}
        onMouseDown={handleMouseDown}
        onDoubleClick={onReset}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleMovable();
          }
        }}
        title={t(
          'sideBar.resizerTooltip',
          'Drag to resize, click button to toggle movable mode, double-click to reset'
        )}
      >
        {/* Horizontal Divider Line */}
        <div className="border-font-color-black/15 dark:border-font-color-white/15 absolute inset-x-0 top-1/2 -translate-y-1/2 border-t" />

        {/* Center Move Handle */}
        <button
          type="button"
          aria-label={t('sideBar.toggleMovableAria', 'Toggle movable resizer mode')}
          className={`relative z-10 mx-auto flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold backdrop-blur-sm transition-all ${
            isDragging || isMovableActive
              ? 'bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 shadow-md'
              : 'bg-background-color-2/80 text-font-color-black/70 dark:bg-dark-background-color-2/80 dark:text-font-color-white/70 group-hover:bg-background-color-3/80 dark:group-hover:bg-dark-background-color-3/80 group-hover:text-font-color-black'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMovable();
          }}
        >
          <span className="material-icons-round text-base leading-none">
            {isMovableActive ? 'swap_vert' : 'unfold_more'}
          </span>
          <span className="hidden leading-none md:group-hover:inline-block">
            {isMovableActive ? 'Movable ↕' : '↕'}
          </span>
        </button>
      </div>
    );
  }
);

SidebarResizer.displayName = 'SidebarResizer';
export default SidebarResizer;
