import { useStore } from '@tanstack/react-store';
import { memo, type FC } from 'react';

import { dndStore } from '../store';
import type { DropEdge } from '../types';

interface DropOverlayProps {
  nodeId: string;
}

const EDGE_STYLES: Record<DropEdge, string> = {
  left: 'left-0 top-0 w-1/2 h-full',
  right: 'right-0 top-0 w-1/2 h-full',
  top: 'left-0 top-0 w-full h-1/2',
  bottom: 'left-0 bottom-0 w-full h-1/2',
  center: 'inset-0 w-full h-full'
};

export const DropOverlay: FC<DropOverlayProps> = memo(({ nodeId }) => {
  const isDragging = useStore(dndStore, (s) => s.isDragging);
  const hoveredDropTarget = useStore(dndStore, (s) => s.hoveredDropTarget);

  if (!isDragging || !hoveredDropTarget || hoveredDropTarget.nodeId !== nodeId) {
    return null;
  }

  const edge = hoveredDropTarget.edge;
  const positionClass = EDGE_STYLES[edge] ?? EDGE_STYLES.center;

  return (
    <div
      data-testid="drop-overlay"
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
    >
      <div
        className={`absolute ${positionClass} border-accent bg-accent/25 flex items-center justify-center rounded-xl border-2 shadow-lg backdrop-blur-[2px] transition-all duration-150`}
      >
        {edge === 'center' ? (
          <div className="bg-accent/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-md">
            <span className="material-symbols-rounded text-sm">tab</span>
            <span>Add as Tab</span>
          </div>
        ) : (
          <div className="bg-accent/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-md">
            <span className="material-symbols-rounded text-sm">splitscreen</span>
            <span className="capitalize">Split {edge}</span>
          </div>
        )}
      </div>
    </div>
  );
});

DropOverlay.displayName = 'DropOverlay';
