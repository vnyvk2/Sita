import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // default: true
      staleTime: 1000 * 60 * 1, // 1 minute
      gcTime: 1000 * 60 * 2 // 2 minutes (reclaims inactive queries sooner)
    }
  }
});
