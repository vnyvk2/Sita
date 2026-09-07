import { memo, useCallback, useEffect, useLayoutEffect, useRef, type FC } from 'react';

import { normalizeWeights } from '../ops';
import { workspaceActions } from '../store';
import type { SplitNode } from '../types';
import { NodeView } from './NodeView';

interface SplitViewProps {
  node: SplitNode;
}

export const SplitView: FC<SplitViewProps> = memo(({ node }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    slotRefs.current.length = node.children.length;
  }, [node.children.length]);

  useEffect(() => {
    const slots = slotRefs.current;
    return () => {
      slots.length = 0;
    };
  }, []);

  const isHorizontal = node.axis === 'x';

  const handleDividerPointerDown = useCallback(
    (dividerIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dividerEl = e.currentTarget;
      const containerEl = containerRef.current;
      if (!containerEl) return;

      const slotA = slotRefs.current[dividerIndex];
      const slotB = slotRefs.current[dividerIndex + 1];
      if (!slotA || !slotB) return;

      dividerEl.setPointerCapture(e.pointerId);
      containerEl.setAttribute('data-resizing', 'true');

      const startCoord = isHorizontal ? e.clientX : e.clientY;
      const rectA = slotA.getBoundingClientRect();
      const rectB = slotB.getBoundingClientRect();
      const startSizeA = isHorizontal ? rectA.width : rectA.height;
      const startSizeB = isHorizontal ? rectB.width : rectB.height;
      const totalPairSize = startSizeA + startSizeB;
      const minSlotSize = 80; // Minimum slot pixel size guard

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const curCoord = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        const delta = curCoord - startCoord;

        let newSizeA = startSizeA + delta;
        let newSizeB = startSizeB - delta;

        if (newSizeA < minSlotSize) {
          newSizeA = minSlotSize;
          newSizeB = totalPairSize - minSlotSize;
        } else if (newSizeB < minSlotSize) {
          newSizeB = minSlotSize;
          newSizeA = totalPairSize - minSlotSize;
        }

        // Direct DOM update (Decision D5: 0 React renders during drag)
        slotA.style.flexGrow = String(newSizeA);
        slotB.style.flexGrow = String(newSizeB);
      };

      const onPointerUp = (upEvent: PointerEvent): void => {
        dividerEl.removeEventListener('pointermove', onPointerMove);
        dividerEl.removeEventListener('pointerup', onPointerUp);
        dividerEl.removeEventListener('pointercancel', onPointerUp);
        containerEl.removeAttribute('data-resizing');

        try {
          dividerEl.releasePointerCapture(upEvent.pointerId);
        } catch {
          // Ignored if capture already lost
        }

        // Measure all child slot pixel sizes from DOM and normalize
        const currentSizes: number[] = [];
        for (let i = 0; i < node.children.length; i++) {
          const slot = slotRefs.current[i];
          if (slot) {
            const rect = slot.getBoundingClientRect();
            currentSizes.push(isHorizontal ? rect.width : rect.height);
          } else {
            currentSizes.push(node.weights[i] ?? 1);
          }
        }

        const normalized = normalizeWeights(currentSizes);
        workspaceActions.dispatchOp({
          t: 'split.weights',
          splitId: node.id,
          weights: normalized
        });
      };

      dividerEl.addEventListener('pointermove', onPointerMove);
      dividerEl.addEventListener('pointerup', onPointerUp);
      dividerEl.addEventListener('pointercancel', onPointerUp);
    },
    [isHorizontal, node.children.length, node.id, node.weights]
  );

  return (
    <div
      ref={containerRef}
      data-split-id={node.id}
      data-split-axis={node.axis}
      className={`split-view relative flex h-full w-full overflow-hidden ${
        isHorizontal ? 'flex-row' : 'flex-col'
      } [&[data-resizing="true"]]:select-none [&[data-resizing="true"]_*]:pointer-events-none`}
    >
      {node.children.map((child, index) => {
        const isCollapsed = node.collapsed === index;
        const weight = node.weights[index] ?? 1 / node.children.length;
        const childKey =
          child.kind === 'panel'
            ? child.panel
            : child.kind === 'tabs'
              ? child.id
              : child.kind === 'split'
                ? child.id
                : `slot-${index}`;

        return (
          <div key={childKey} className="contents">
            <div
              ref={(el) => {
                slotRefs.current[index] = el;
              }}
              data-slot-index={index}
              style={{
                flexBasis: 0,
                flexGrow: isCollapsed ? 0 : weight,
                minWidth: 0,
                minHeight: 0,
                display: isCollapsed ? 'none' : 'flex'
              }}
              className="slot-container relative h-full w-full overflow-hidden"
            >
              <NodeView node={child} />
            </div>

            {/* Divider between children */}
            {index < node.children.length - 1 && (
              <div
                onPointerDown={(e) => handleDividerPointerDown(index, e)}
                title="Drag to resize split"
                className={`split-divider group relative z-30 shrink-0 touch-none select-none ${
                  isHorizontal
                    ? 'hover:bg-accent/40 active:bg-accent w-1.5 cursor-col-resize transition-colors'
                    : 'hover:bg-accent/40 active:bg-accent h-1.5 cursor-row-resize transition-colors'
                } bg-transparent before:absolute before:inset-0 before:bg-stone-300/30 dark:before:bg-stone-800/40`}
              >
                <div
                  className={`divider-handle absolute inset-0 m-auto rounded-full bg-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-stone-600 ${
                    isHorizontal ? 'h-6 w-0.5' : 'h-0.5 w-6'
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

SplitView.displayName = 'SplitView';
