import React from 'react';

interface PageSearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PageSearchInput = ({ inputRef, value, placeholder, onChange }: PageSearchInputProps) => {
  return (
    <input
      ref={inputRef}
      type="search"
      className="search-input mr-4 w-48 rounded-full border-[1.5px] border-background-color-2 bg-transparent px-4 py-1 text-sm outline-none transition-colors focus:border-font-color-highlight dark:border-dark-background-color-2 dark:focus:border-dark-font-color-highlight md:w-64 md:text-base"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
};

export default PageSearchInput;
