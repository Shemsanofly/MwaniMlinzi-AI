export const ROLES = [
  { name: 'FARMER', description: 'Seaweed farmer: manages own farms and records' },
  { name: 'ADMIN', description: 'System administrator: full access, settings, models, audit' },
];

// Administrators manage field operations and cooperatives; farmers access their own records.
export const PERMISSIONS = {
  'farm:read:own': ['FARMER'],
  'farm:write:own': ['FARMER'],
  'farm:read:all': ['ADMIN'],
  'observation:review': ['ADMIN'],
  'recommendation:review': ['ADMIN'],
  'action_library:validate': ['ADMIN'],
  'action_library:manage': ['ADMIN'],
  'prediction:flag': ['ADMIN'],
  'forecast:read:aggregate': ['ADMIN'],
  'cooperative:dashboard': ['ADMIN'],
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
