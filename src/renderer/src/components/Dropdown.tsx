import { type ChangeEvent, useMemo } from 'react';

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

  const optionComponents = useMemo(
    () =>
      options.map((option, idx) => {
        if (option.isDivider) {
          return (
            <option
              key={`divider-${idx}`}
              disabled
              className="bg-context-menu-background/90! text-font-color-black/40! dark:bg-dark-context-menu-background/90! dark:text-font-color-white/40!"
            >
              ───────────────
            </option>
          );
        }
        if (option.isHeader) {
          return (
            <option
              key={`header-${idx}`}
              disabled
              className="bg-context-menu-background/90! font-semibold text-font-color-black/60! dark:bg-dark-context-menu-background/90! dark:text-font-color-white/60!"
            >
              ── {option.label} ──
            </option>
          );
        }
        return (
          <option
            key={option.value}
            value={option.value}
            disabled={option.isDisabled}
            className="bg-context-menu-background/90! text-font-color-black! dark:bg-dark-context-menu-background/90! dark:text-font-color-white!"
          >
            {iconName ? option.label : `${type ? `${type} ` : ''}${option.label}`}
          </option>
        );
      }),
    [iconName, options, type]
  );

  if (iconName) {
    return (
      <div
        className={`dropdown group border-background-color-2 bg-background-color-2/25 text-font-color-black hover:border-background-color-3 hover:bg-background-color-2/50 focus-within:!border-font-color-highlight-2 focus-within:bg-background-color-2/50 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:text-font-color-white dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus-within:!border-dark-font-color-highlight-2 dark:focus-within:bg-dark-background-color-2/50 relative ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-3xl border-[3px] px-4 py-2 text-sm transition-[border,background,color] ease-in-out md:text-lg ${
          isDisabled &&
          `border-font-color-dimmed/10! text-opacity-50! dark:border-font-color-dimmed/40! cursor-not-allowed! opacity-50! brightness-90! transition-none!`
        } ${className}`}
        title={tooltip}
      >
        <span className="material-icons-round icon text-lg !leading-none md:text-xl">
          {iconName}
        </span>
        <select
          name={name}
          id={name}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-hidden"
          value={value}
          onChange={onChange}
          disabled={isDisabled}
          title={tooltip}
        >
          {optionComponents}
        </select>
      </div>
    );
  }

  return (
    <select
      name={name}
      id={name}
      className={`dropdown border-background-color-2 bg-background-color-2/25 text-font-color-black hover:border-background-color-3 hover:bg-background-color-2/50 focus:!border-background-color-3 focus-visible:!border-font-color-highlight-2 focus-visible:bg-background-color-2/50 active:border-background-color-3 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:text-font-color-white dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus:!border-dark-background-color-3 dark:focus-visible:!border-dark-font-color-highlight-2 dark:focus-visible:bg-dark-background-color-2/50 dark:active:border-dark-background-color-3 ml-4 h-10 w-52 cursor-pointer appearance-none truncate rounded-lg border-[3px] px-3 text-sm outline-hidden backdrop-blur-xs transition-[border-color] ease-in-out ${
        isDisabled &&
        `border-font-color-dimmed/10! text-opacity-50! dark:border-font-color-dimmed/40! cursor-not-allowed! opacity-50! brightness-90! backdrop-blur-none! transition-none!`
      } ${className}`}
      value={value}
      onChange={onChange}
      disabled={isDisabled}
    >
      {optionComponents}
    </select>
  );
}

export default Dropdown;
