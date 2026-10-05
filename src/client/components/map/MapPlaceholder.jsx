'use client';

/** Shown while a Leaflet map loads. Fills the box its wrapper reserves, so the page does not jump. */
export default function MapPlaceholder() {
  return <div data-testid="map-placeholder" className="w-full flex-1 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />;
}

/** Reserves the map's height (`minHeight`) while the map, or its placeholder, is shown inside. */
export function MapBox({ height, children }) {
  return <div className="flex flex-col" style={{ minHeight: height }}>{children}</div>;
}
