export const ROLES = [
  { name: 'FARMER', description: 'Seaweed farmer: manages own farms and records' },
  { name: 'COOPERATIVE_ADMIN', description: 'Cooperative staff: operates one cooperative — farmers, farms, forecasts, alerts' },
  { name: 'EXTENSION_OFFICER', description: 'Extension officer: reviews farms across cooperatives, prioritises field visits' },
  { name: 'ADMIN', description: 'System administrator: full access, settings, models, audit' },
];

// `cooperative:dashboard` is scoped to the staff's own cooperative at the controller layer.
// EXTENSION_OFFICER and ADMIN see all cooperatives; COOPERATIVE_ADMIN sees only their own.
export const PERMISSIONS = {
  'farm:read:own': ['FARMER'],
  'farm:write:own': ['FARMER'],
  'farm:read:all': ['EXTENSION_OFFICER', 'ADMIN'],
  'farm:read:coop': ['COOPERATIVE_ADMIN'],
  'observation:review': ['EXTENSION_OFFICER', 'ADMIN'],
  'recommendation:review': ['EXTENSION_OFFICER', 'ADMIN'],
  'action_library:validate': ['ADMIN'],
  'action_library:manage': ['ADMIN'],
  'prediction:flag': ['ADMIN'],
  'forecast:read:aggregate': ['COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'],
  'cooperative:dashboard': ['COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'],
  'user:manage': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'model:manage': ['ADMIN'],
  'audit:read': ['ADMIN'],
  'whatif:simulate': ['ADMIN'],
  'assistant:use': ['FARMER', 'ADMIN'],
};

export const SPECIES = [
  { code: 'KAPPA', scientificName: 'Kappaphycus alvarezii', commonName: 'Cottonii', commonNameSw: 'Mwani mnene (Cottonii)', typicalCycleDays: 45, optimalSstMin: 25, optimalSstMax: 29, heatSensitivity: 0.75, yieldKgDryPerLine: 1.3 },
  { code: 'EUCH', scientificName: 'Eucheuma denticulatum', commonName: 'Spinosum', commonNameSw: 'Mwani mwembamba (Spinosum)', typicalCycleDays: 42, optimalSstMin: 24, optimalSstMax: 30, heatSensitivity: 0.45, yieldKgDryPerLine: 1.0 },
];
