import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './stores/AuthContext.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';

const DAY = 24 * 60 * 60 * 1000;
const queryClient = new QueryClient({
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
let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const persister = createSyncStoragePersister({ storage, key: 'mwanimlinzi.cache' });
const persistOptions = {
  persister,
  maxAge: DAY,
  buster: 'v2',
  dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && OFFLINE_KEYS.has(q.queryKey[0]) },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <I18nProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </I18nProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
