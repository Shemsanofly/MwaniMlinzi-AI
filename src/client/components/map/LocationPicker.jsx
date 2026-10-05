'use client';
import dynamic from 'next/dynamic';

/** Leaflet touches `window` at import time, so the map loads only in the browser. */
export default dynamic(() => import('./LocationPicker.client.jsx'), { ssr: false });
