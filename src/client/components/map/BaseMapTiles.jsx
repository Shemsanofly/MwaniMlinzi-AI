import { TileLayer } from 'react-leaflet';

// Use the canonical OSM endpoint and send the real page origin, even when a
// hosting platform supplies a restrictive document-wide referrer policy.
export default function BaseMapTiles() {
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
