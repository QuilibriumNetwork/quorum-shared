/**
 * useSpaces hook
 *
 * Fetches and caches space data with offline support
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Space } from '../types';
import type { StorageAdapter } from '../storage';
import { queryKeys } from './keys';

export interface UseSpacesOptions {
  storage: StorageAdapter;
  enabled?: boolean;
}

export function useSpaces({ storage, enabled = true }: UseSpacesOptions) {
  return useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: async (): Promise<Space[]> => {
      return storage.getSpaces();
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export interface UseSpaceOptions {
  storage: StorageAdapter;
  spaceId: string | undefined;
  enabled?: boolean;
}

export function useSpace({ storage, spaceId, enabled = true }: UseSpaceOptions) {
  return useQuery({
    queryKey: queryKeys.spaces.detail(spaceId ?? ''),
    queryFn: async (): Promise<Space | null> => {
      if (!spaceId) return null;
      return storage.getSpace(spaceId);
    },
    enabled: enabled && !!spaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useSpaceMembers({
  storage,
  spaceId,
  enabled = true,
}: UseSpaceOptions) {
  return useQuery({
    queryKey: queryKeys.spaces.members(spaceId ?? ''),
    queryFn: async () => {
      if (!spaceId) return [];
      return storage.getSpaceMembers(spaceId);
    },
    enabled: enabled && !!spaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
