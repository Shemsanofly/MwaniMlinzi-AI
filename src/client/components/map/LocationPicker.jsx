'use client';
import dynamic from 'next/dynamic';
import MapPlaceholder, { MapBox } from './MapPlaceholder.jsx';

/** Leaflet touches `window` at import time, so the map loads only in the browser. */
const DynamicLocationPicker = dynamic(() => import('./LocationPicker.client.jsx'), { ssr: false, loading: MapPlaceholder });

/** Same default height as LocationPicker.client.jsx. */
export default function LocationPicker(props) {
  return <MapBox height={props.height ?? 260}><DynamicLocationPicker {...props} /></MapBox>;
}
