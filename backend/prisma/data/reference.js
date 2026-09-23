export const ROLES = [
  { name: 'FARMER', description: 'Seaweed farmer: manages own farms and records' },
  { name: 'COOPERATIVE_ADMIN', description: 'Cooperative manager: monitors member farms' },
  { name: 'EXTENSION_OFFICER', description: 'Extension officer: reviews risks, observations and validates actions' },
  { name: 'BUYER', description: 'Buyer / processor: views aggregated supply forecasts' },
  { name: 'ADMIN', description: 'System administrator' },
];

export const PERMISSIONS = {
  'farm:read:own': ['FARMER'],
  'farm:write:own': ['FARMER'],
  'farm:read:cooperative': ['COOPERATIVE_ADMIN'],
  'farm:read:all': ['EXTENSION_OFFICER', 'ADMIN'],
  'observation:review': ['EXTENSION_OFFICER', 'ADMIN'],
  'recommendation:review': ['EXTENSION_OFFICER', 'ADMIN'],
  'action_library:validate': ['EXTENSION_OFFICER', 'ADMIN'],
  'action_library:manage': ['ADMIN'],
  'prediction:flag': ['EXTENSION_OFFICER', 'ADMIN'],
  'forecast:read:aggregate': ['BUYER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'],
  'cooperative:dashboard': ['COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'],
  'user:manage': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'model:manage': ['ADMIN'],
  'audit:read': ['ADMIN'],
  'assistant:use': ['FARMER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'],
};

export const SPECIES = [
  { code: 'KAPPA', scientificName: 'Kappaphycus alvarezii', commonName: 'Cottonii', commonNameSw: 'Mwani mnene (Cottonii)', typicalCycleDays: 45, optimalSstMin: 25, optimalSstMax: 29, heatSensitivity: 0.75, yieldKgDryPerLine: 1.3 },
  { code: 'EUCH', scientificName: 'Eucheuma denticulatum', commonName: 'Spinosum', commonNameSw: 'Mwani mwembamba (Spinosum)', typicalCycleDays: 42, optimalSstMin: 24, optimalSstMax: 30, heatSensitivity: 0.45, yieldKgDryPerLine: 1.0 },
];

/** Demo cooperatives (names are illustrative, not real organisations). */
export const COOPERATIVES = [
  { code: 'PAJE', name: 'Paje Demo Seaweed Cooperative', district: 'Kusini', region: 'Unguja South', description: 'Demo cooperative on the south-east coast of Unguja (demo data).', center: [-6.268, 39.545], village: 'Paje' },
  { code: 'JAMBIANI', name: 'Jambiani Demo Women Seaweed Group', district: 'Kusini', region: 'Unguja South', description: 'Demo cooperative, Jambiani lagoon (demo data).', center: [-6.318, 39.552], village: 'Jambiani' },
  { code: 'KIWANI', name: 'Kiwani Demo Seaweed Cooperative', district: 'Mkoani', region: 'Pemba South', description: 'Demo cooperative, south-west Pemba (demo data).', center: [-5.405, 39.628], village: 'Kiwani' },
];

export const FARMER_NAMES = [
  'Mwanaisha Haji', 'Asha Juma', 'Fatma Ali', 'Zuhura Makame', 'Mwanajuma Khamis', 'Rehema Said', 'Salma Hamad', 'Mariam Vuai',
  'Tatu Mussa', 'Halima Ame', 'Mize Kombo', 'Mwatima Ussi', 'Khadija Abdalla', 'Saada Mohamed', 'Riziki Juma', 'Maryam Suleiman',
  'Aisha Bakari', 'Pili Makame', 'Mwanamkuu Haji', 'Time Othman', 'Juma Ali', 'Hamad Omar', 'Ali Khamis', 'Said Mbarouk',
  'Othman Haji', 'Makame Vuai', 'Suleiman Rashid', 'Abdalla Mussa', 'Khamis Ame', 'Bakari Faki',
];
