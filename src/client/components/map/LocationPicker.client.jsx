import { CircleMarker, MapContainer, useMapEvents } from 'react-leaflet';
import BaseMapTiles from './BaseMapTiles.client.jsx';

const ZANZIBAR_CENTER = [-5.9, 39.45];

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Small Leaflet map: tap/click to choose a point. `lat`/`lng` show the current choice (if any). */
export default function LocationPicker({ lat, lng, onPick, height = 260 }) {
  const has = Number.isFinite(lat) && Number.isFinite(lng);
  return (
    <MapContainer center={has ? [lat, lng] : ZANZIBAR_CENTER} zoom={has ? 13 : 9} style={{ height, width: '100%' }} scrollWheelZoom={false} className="rounded-xl">
      <BaseMapTiles />
      <ClickToPick onPick={onPick} />
      {has && <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#16718c', fillOpacity: 0.95 }} />}
    </MapContainer>
  );
}
