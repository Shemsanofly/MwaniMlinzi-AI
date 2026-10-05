'use client';
import { useEffect, useState, Suspense } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from '../src/client/stores/AuthContext.jsx';
import { I18nProvider } from '../src/client/i18n/I18nProvider.jsx';
import { PageLoader } from '../src/client/components/ui/index.jsx';

const DAY = 24 * 60 * 60 * 1000;
const makeQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // keep data long enough to be saved for offline use
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 1 && !(err?.status >= 400 && err?.status < 500),
    },
    // Fail fast when offline instead of waiting silently; the UI shows the network error.
    mutations: { networkMode: 'always' },
  },
});

/**
 * Low-connectivity support: the farmer's own data (farms, risk, alerts, conditions) is saved in this
 * browser so the last known risk and advice stay visible without a connection. Logging out clears it.
 */
const OFFLINE_KEYS = new Set(['farms', 'farm', 'risks', 'farmAlerts', 'env', 'health', 'notifications']);
function makePersistOptions() {
  let storage;
  try { storage = window.localStorage; } catch { storage = undefined; }
  return {
    persister: createSyncStoragePersister({ storage, key: 'mwanimlinzi.cache' }),
    maxAge: DAY,
    buster: 'v2',
    dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && OFFLINE_KEYS.has(q.queryKey[0]) },
  };
}

/** The app is browser-only (localStorage auth, offline cache, Leaflet), like the former SPA's empty #root. */
export default function Providers({ children }) {
  const [client, setClient] = useState(null);
  useEffect(() => {
    // Scroll-reveal animations only run where they can finish (IntersectionObserver) and are wanted.
    if (typeof IntersectionObserver !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('motion-ok');
    }
    setClient({ queryClient: makeQueryClient(), persistOptions: makePersistOptions() });
  }, []);
  if (!client) return null;
  return (
    <PersistQueryClientProvider client={client.queryClient} persistOptions={client.persistOptions}>
      <I18nProvider>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </AuthProvider>
      </I18nProvider>
    </PersistQueryClientProvider>
  );
}
