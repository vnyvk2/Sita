import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';

export interface DropdownOption<T extends string> {
  label: string;
  value: T;
  isDisabled?: boolean;
  isDivider?: boolean;
  isHeader?: boolean;
}

export interface DropdownProp<T extends string> {
  name: string;
  className?: string;
  options: DropdownOption<T>[];
  value: T;
  onChange: (_e: ChangeEvent<HTMLSelectElement>) => void;
  isDisabled?: boolean;
  type?: string;
}

function Dropdown<T extends string>(props: DropdownProp<T>) {
  const { className, name, value, onChange, options, isDisabled = false, type = '' } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const menuId = useId();

  const isFilter = name.toLowerCase().includes('filter') || type.toLowerCase().includes('filter');
  const isSort = name.toLowerCase().includes('sort') || type.toLowerCase().includes('sort');
  const iconName = isFilter ? 'filter_alt' : isSort ? 'sort' : undefined;

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const tooltip = useMemo(() => {
    if (selectedOption) {
      return `${type ? `${type} ` : ''}${selectedOption.label}`;
    }
    return type ? type.replace(/\s*:\s*$/, '') : name;
  }, [name, selectedOption, type]);

  // Index map of selectable (non-header, non-divider, non-disabled) options
  const selectableIndices = useMemo(() => {
    return options
      .map((opt, idx) => (!opt.isDivider && !opt.isHeader && !opt.isDisabled ? idx : -1))
      .filter((idx) => idx !== -1);
  }, [options]);

  const closeMenu = useCallback((returnFocus = true) => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (returnFocus) {
      triggerButtonRef.current?.focus();
    }
  }, []);

  const handleSelect = useCallback(
    (optionValue: T) => {
      if (optionValue !== value) {
        // Create synthetic event matching HTMLSelectElement change event interface
        const syntheticEvent = {
          target: { value: optionValue, name },
          currentTarget: { value: optionValue, name }
        } as unknown as ChangeEvent<HTMLSelectElement>;

        onChange(syntheticEvent);
      }
      closeMenu(true);
    },
    [closeMenu, name, onChange, value]
  );

  // Outside click and Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu(false);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu(true);
      } else if (e.key === 'Tab') {
        closeMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [closeMenu, isOpen]);

  // Automatically focus the active/highlighted item when menu opens
  useEffect(() => {
    if (isOpen) {
      const selectedIdx = options.findIndex((opt) => opt.value === value);
      const initialIdx =
        selectedIdx !== -1 && selectableIndices.includes(selectedIdx)
          ? selectedIdx
          : selectableIndices[0] ?? -1;

      setHighlightedIndex(initialIdx);
      if (initialIdx !== -1) {
        requestAnimationFrame(() => {
          itemRefs.current[initialIdx]?.focus();
        });
      }
    }
  }, [isOpen, options, selectableIndices, value]);

  // Keyboard navigation inside the menu
  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentPos = selectableIndices.indexOf(highlightedIndex);
      const nextPos = currentPos < selectableIndices.length - 1 ? currentPos + 1 : 0;
      const nextIdx = selectableIndices[nextPos];
      setHighlightedIndex(nextIdx);
      itemRefs.current[nextIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentPos = selectableIndices.indexOf(highlightedIndex);
      const prevPos = currentPos > 0 ? currentPos - 1 : selectableIndices.length - 1;
      const prevIdx = selectableIndices[prevPos];
      setHighlightedIndex(prevIdx);
      itemRefs.current[prevIdx]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstIdx = selectableIndices[0];
      if (firstIdx !== undefined) {
        setHighlightedIndex(firstIdx);
        itemRefs.current[firstIdx]?.focus();
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastIdx = selectableIndices[selectableIndices.length - 1];
      if (lastIdx !== undefined) {
        setHighlightedIndex(lastIdx);
        itemRefs.current[lastIdx]?.focus();
      }
    }
  };

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;

    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      const lastIdx = selectableIndices[selectableIndices.length - 1];
      if (lastIdx !== undefined) {
        setHighlightedIndex(lastIdx);
      }
    }
  };

  const toggleOpen = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (!isDisabled) {
      setIsOpen((prev) => !prev);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`dropdown-container relative ml-4 inline-flex shrink-0 ${className ?? ''}`}
      onKeyDown={handleMenuKeyDown}
    >
      {iconName ? (
        <button
          ref={triggerButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          aria-label={tooltip}
          title={tooltip}
          disabled={isDisabled}
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
          className={`group relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-3xl border-[3px] transition-[border,background,color,transform] duration-150 ease-in-out select-none outline-none ${
            isOpen
              ? 'border-font-color-highlight! bg-background-color-2/50 text-font-color-highlight dark:border-dark-font-color-highlight! dark:bg-dark-background-color-2/50 dark:text-dark-font-color-highlight scale-105'
              : 'border-background-color-2 bg-background-color-2/25 text-font-color-black hover:border-background-color-3 hover:bg-background-color-2/50 focus-visible:border-font-color-highlight-2 focus-visible:bg-background-color-2/50 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:text-font-color-white dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus-visible:border-dark-font-color-highlight-2 dark:focus-visible:bg-dark-background-color-2/50'
          } ${
            isDisabled
              ? 'cursor-not-allowed! opacity-50! brightness-90! transition-none!'
              : 'active:scale-95'
          }`}
        >
          <span className="material-icons-round icon text-lg !leading-none md:text-xl">
            {iconName}
          </span>
        </button>
      ) : (
        <button
          ref={triggerButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          aria-label={tooltip}
          title={tooltip}
          disabled={isDisabled}
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
          className={`flex h-10 w-52 cursor-pointer items-center justify-between gap-2 rounded-lg border-[3px] px-3 text-sm font-medium transition-[border-color,background-color] duration-150 ease-in-out select-none outline-none backdrop-blur-xs ${
            isOpen
              ? 'border-font-color-highlight! bg-background-color-2/50 text-font-color-highlight dark:border-dark-font-color-highlight! dark:bg-dark-background-color-2/50 dark:text-dark-font-color-highlight'
              : 'border-background-color-2 bg-background-color-2/25 text-font-color-black hover:border-background-color-3 hover:bg-background-color-2/50 focus-visible:border-font-color-highlight-2 focus-visible:bg-background-color-2/50 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:text-font-color-white dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus-visible:border-dark-font-color-highlight-2 dark:focus-visible:bg-dark-background-color-2/50'
          } ${
            isDisabled
              ? 'cursor-not-allowed! opacity-50! brightness-90! backdrop-blur-none! transition-none!'
              : 'active:scale-[0.99]'
          }`}
        >
          <span className="truncate">
            {type ? `${type} ` : ''}
            {selectedOption?.label ?? name}
          </span>
          <span
            className={`material-icons-round text-base transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-font-color-highlight dark:text-dark-font-color-highlight' : 'opacity-60'
            }`}
          >
            expand_more
          </span>
        </button>
      )}

      {/* Floating Glassmorphic Popover Menu */}
      {isOpen && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={tooltip}
          className={`absolute z-50 mt-2 min-w-[13.5rem] max-w-[18rem] origin-top-right overflow-hidden rounded-2xl border p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-120 ease-out animate-in fade-in-0 zoom-in-95 ${
            iconName ? 'right-0 top-full' : 'left-0 top-full w-full'
          } border-black/10 bg-[#f8f9fa]/95 text-font-color-black dark:border-white/10 dark:bg-[#141418]/95 dark:text-font-color-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.65)]`}
        >
          {/* Section Header */}
          {type && (
            <div className="px-3 pt-1 pb-1.5 text-[10.5px] font-bold tracking-wider text-font-color-dimmed/75 uppercase select-none dark:text-font-color-dimmed/60">
              {type.replace(/\s*:\s*$/, '')}
            </div>
          )}

          <div className="flex flex-col gap-0.5" role="none">
            {options.map((option, idx) => {
              if (option.isDivider) {
                return (
                  <div
                    key={`divider-${idx}`}
                    role="separator"
                    className="my-1 h-[1px] w-full bg-black/5 dark:bg-white/10"
                  />
                );
              }

              if (option.isHeader) {
                return (
                  <div
                    key={`header-${idx}`}
                    className="px-3 pt-2 pb-1 text-[10.5px] font-bold tracking-wider text-font-color-dimmed/75 uppercase select-none dark:text-font-color-dimmed/60"
                  >
                    {option.label}
                  </div>
                );
              }

              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  disabled={option.isDisabled}
                  tabIndex={highlightedIndex === idx ? 0 : -1}
                  onClick={() => handleSelect(option.value)}
                  className={`group relative flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-medium transition-all duration-100 outline-none select-none md:text-sm ${
                    option.isDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : isSelected
                        ? 'bg-font-color-highlight/15 text-font-color-highlight font-semibold dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight'
                        : 'text-font-color-black hover:bg-black/5 focus-visible:bg-black/5 active:bg-black/10 dark:text-font-color-white/90 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 dark:active:bg-white/15'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <span className="material-icons-round text-base font-bold text-font-color-highlight dark:text-dark-font-color-highlight shrink-0">
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dropdown;
