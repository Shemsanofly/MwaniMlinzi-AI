'use client';
import dynamic from 'next/dynamic';
import MapPlaceholder, { MapBox } from './MapPlaceholder.jsx';

/** Leaflet touches `window` at import time, so the map loads only in the browser. */
const DynamicFarmMap = dynamic(() => import('./FarmMap.client.jsx'), { ssr: false, loading: MapPlaceholder });

/** Same default height as FarmMap.client.jsx. */
export default function FarmMap(props) {
  return <MapBox height={props.height ?? 480}><DynamicFarmMap {...props} /></MapBox>;
}
