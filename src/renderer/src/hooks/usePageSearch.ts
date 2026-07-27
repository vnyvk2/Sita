import { useDebouncedCallback } from '@tanstack/react-pacer';
import { useEffect, useRef, useState, useCallback } from 'react';

export const usePageSearch = ({
  keyword,
  updateSearch,
  debounceMs = 250
}: {
  keyword?: string;
  updateSearch: (val: string) => void;
  debounceMs?: number;
}) => {
  const [searchInput, setSearchInput] = useState(keyword ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchInput((prev) => {
      const next = keyword ?? '';
      return prev !== next ? next : prev;
    });
  }, [keyword]);

  const debouncedSearch = useDebouncedCallback(
    (val: string) => {
      if (val === (keyword ?? '')) return;
      updateSearch(val);
    },
    { wait: debounceMs }
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInput(e.target.value);
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  return { value: searchInput, inputRef: searchInputRef, onChange };
};
