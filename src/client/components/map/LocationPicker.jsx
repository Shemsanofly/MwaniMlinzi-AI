'use client';
import dynamic from 'next/dynamic';

/** Leaflet touches `window` at import time, so the map loads only in the browser. */
const MapPlaceholder = () => <div className="h-[260px] w-full animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />;

export default dynamic(() => import('./LocationPicker.client.jsx'), { ssr: false, loading: MapPlaceholder });
