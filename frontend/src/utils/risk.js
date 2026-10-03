export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const RISK_TYPES = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];

/** Tailwind classes + hex per risk level (hex is used by charts and map markers). */
export const RISK_STYLE = {
  LOW: { badge: 'bg-risk-low-bg text-risk-low ring-risk-low/20', bar: 'bg-risk-low', text: 'text-risk-low', border: 'border-risk-low', hex: '#15803d' },
  MEDIUM: { badge: 'bg-risk-medium-bg text-risk-medium ring-risk-medium/20', bar: 'bg-amber-500', text: 'text-risk-medium', border: 'border-amber-500', hex: '#d97706' },
  HIGH: { badge: 'bg-risk-high-bg text-risk-high ring-risk-high/20', bar: 'bg-orange-600', text: 'text-risk-high', border: 'border-orange-600', hex: '#ea580c' },
  CRITICAL: { badge: 'bg-risk-critical-bg text-risk-critical ring-risk-critical/20', bar: 'bg-red-700', text: 'text-risk-critical', border: 'border-red-700', hex: '#b91c1c' },
  NONE: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', bar: 'bg-slate-300', text: 'text-slate-500', border: 'border-slate-300', hex: '#94a3b8' },
};

export const riskStyle = (level) => RISK_STYLE[level] || RISK_STYLE.NONE;
export const levelRank = (l) => RISK_LEVELS.indexOf(l);
