import { useQuery } from '@tanstack/react-query';
import { metaApi } from '../api/endpoints.js';

/** True when the backend runs with DEMO_MODE=true (demo guide, demo banner and training tools are shown only then). */
export function useDemoMode() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: metaApi.health, staleTime: 5 * 60_000, retry: false });
  return !!data?.demoMode;
}
