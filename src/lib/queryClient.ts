import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api";

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 0,
    },
    mutations: {
      retry: false,
    },
  },
});
