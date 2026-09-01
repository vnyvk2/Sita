import React from 'react';

interface PageSearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PageSearchInput = ({
  inputRef,
  value,
  onChange,
  className,
  ...props
}: PageSearchInputProps) => {
  return (
    <input
      ref={inputRef}
      type="search"
      className={`search-input border-background-color-2 focus:border-font-color-highlight dark:border-dark-background-color-2 dark:focus:border-dark-font-color-highlight mr-4 w-48 rounded-full border-[1.5px] bg-transparent px-4 py-1 text-sm transition-colors outline-none md:w-64 md:text-base ${className ?? ''}`}
      value={value}
      onChange={onChange}
      {...props}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && value) {
          onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
        }
        props.onKeyDown?.(e);
      }}
    />
  );
};

export default PageSearchInput;
