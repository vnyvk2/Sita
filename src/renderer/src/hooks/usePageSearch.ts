import { useDebouncedCallback } from '@tanstack/react-pacer';
import { useEffect, useRef, useState } from 'react';

export const usePageSearch = ({
  keyword,
  updateSearch
}: {
  keyword?: string;
  updateSearch: (val: string) => void;
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
    { wait: 250 }
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  return { value: searchInput, ref: searchInputRef, onChange };
};
