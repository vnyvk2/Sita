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
  const isComposing = useRef(false);

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
      if (!isComposing.current) {
        debouncedSearch(e.target.value);
      }
    },
    [debouncedSearch]
  );

  const onCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      debouncedSearch(e.currentTarget.value);
    },
    [debouncedSearch]
  );

  return {
    value: searchInput,
    inputRef: searchInputRef,
    onChange,
    onCompositionStart,
    onCompositionEnd
  };
};
