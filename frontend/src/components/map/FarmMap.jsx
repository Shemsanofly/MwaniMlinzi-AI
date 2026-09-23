import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { riskStyle } from '../../utils/risk.js';
import { date, kg } from '../../utils/format.js';

const ZANZIBAR_CENTER = [-5.9, 39.45];

/**
 * Leaflet + OpenStreetMap farm map. Markers are coloured by overall risk level.
 * `farms` are FarmService DTOs (location, overallRiskLevel, latestRisks, forecast, …).
 * `renderPopup(farm)` can replace the default popup; `linkTo(farm)` adds a details link.
 */
export default function FarmMap({ farms = [], height = 480, renderPopup, linkTo, colorBy }) {
  const { t, lang } = useI18n();
  const located = farms.filter((f) => f.location?.latitude != null);
  const bounds = located.length ? located.map((f) => [f.location.latitude, f.location.longitude]) : null;
  return (
    <div className="relative">
      <MapContainer
        {...(bounds && bounds.length > 1 ? { bounds, boundsOptions: { padding: [30, 30] } } : { center: bounds?.[0] || ZANZIBAR_CENTER, zoom: bounds ? 12 : 9 })}
        style={{ height, width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {located.map((f) => {
          const level = colorBy ? colorBy(f) : f.overallRiskLevel;
          const style = riskStyle(level);
          return (
            <CircleMarker key={f.id} center={[f.location.latitude, f.location.longitude]} radius={level === 'CRITICAL' ? 11 : level === 'HIGH' ? 9.5 : 8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: style.hex, fillOpacity: 0.9 }}>
              <Tooltip>{f.farmCode}{level ? ` · ${t(`risk.level.${level}`)}` : ''}</Tooltip>
              <Popup>
                {renderPopup ? renderPopup(f) : (
                  <div className="min-w-[200px] space-y-1 text-sm">
                    <p className="font-semibold">{f.farmCode} — {f.name}</p>
                    {f.isDemo && <p className="text-xs font-semibold text-violet-700">{t('common.demoFarm')}</p>}
                    {f.farmer?.fullName && <p>{t('common.farmer')}: {f.farmer.fullName}</p>}
                    <p>{t('common.cropAge')}: {f.cropAgeDays != null ? t('common.days', { n: f.cropAgeDays }) : '—'}</p>
                    <p>{t('nav.risk')}: <span style={{ color: style.hex, fontWeight: 600 }}>{level ? t(`risk.level.${level}`) : '—'}</span></p>
                    {f.latestRisks && (
                      <ul className="text-xs text-slate-600">
                        {Object.entries(f.latestRisks).map(([rt, r]) => <li key={rt}>{t(`risk.type.${rt}`)}: {t(`risk.level.${r.level}`)} ({Math.round(r.probability * 100)}%)</li>)}
                      </ul>
                    )}
                    {f.forecast && <p>{t('common.expectedHarvest')}: {date(f.forecast.expectedHarvestDate, lang)} · {kg(f.forecast.riskAdjustedQuantityKg)}</p>}
                    <p className="text-xs text-slate-500">{lang === 'sw' ? 'Ripoti ya mwisho' : 'Last observation'}: {f.lastObservation ? date(f.lastObservation.observedAt, lang) : '—'}</p>
                    {linkTo && <Link to={linkTo(f)} className="font-semibold text-ocean-700">{t('actions.viewDetails')} →</Link>}
                  </div>
                )}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <MapLegend />
      {located.some((f) => f.isDemo) && (
        <p className="mt-1 text-xs text-violet-700">{lang === 'sw' ? 'Maeneo ya mashamba ni ya demo — si mashamba halisi.' : 'Farm locations are demo data — they do not represent real farms.'}</p>
      )}
    </div>
  );
}

export function MapLegend() {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
      {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: riskStyle(l).hex }} />{t(`risk.level.${l}`)}</span>
      ))}
    </div>
  );
}
