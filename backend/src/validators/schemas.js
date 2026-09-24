import { z } from 'zod';
import { normalizeTzPhone } from '../utils/phone.js';

const trimmed = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 2000) => z.string().trim().max(max).optional().nullable();
const dateStr = z.coerce.date();
const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
const num = (min, max) => z.coerce.number().min(min).max(max);
/** Tanzanian mobile number in any common format (+255…, 255…, 07…, 7…) → normalised +255XXXXXXXXX. */
const phone = z.string().trim().max(32)
  .refine((v) => normalizeTzPhone(v) !== null, 'Enter a valid Tanzanian mobile number, e.g. 0777 123 456 or +255777123456')
  .transform((v) => normalizeTzPhone(v));
const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number');
const optEmail = z.union([z.string().trim().toLowerCase().email().max(200), z.literal('').transform(() => null)]).optional().nullable();

export const registerSchema = z.object({
  fullName: trimmed(120),
  phone,
  password,
  email: optEmail,
  role: z.enum(['FARMER', 'BUYER']).default('FARMER'),
  preferredLanguage: z.enum(['en', 'sw']).default('sw'),
  cooperativeCode: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  village: optText(120),
  district: optText(120),
  smsEnabled: bool.optional(),
  consent: z.literal(true, { message: 'You must agree to data use to create an account' }),
});

/** Log in with a phone number or an email address (`email` is kept for older clients). */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(200).optional(),
  email: z.string().trim().max(200).optional(),
  password: z.string().min(1).max(128),
}).refine((v) => v.identifier || v.email, { message: 'Enter your phone number or email', path: ['identifier'] });

export const profileSchema = z.object({
  fullName: trimmed(120).optional(),
  phone: phone.optional(),
  email: optEmail,
  preferredLanguage: z.enum(['en', 'sw']).optional(),
  smsEnabled: bool.optional(),
  notifyRiskAlerts: bool.optional(),
  notifyHarvest: bool.optional(),
  notifySystem: bool.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const farmSchema = z.object({
  name: trimmed(120),
  farmCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/).optional(),
  cooperativeId: z.string().uuid().optional().nullable(),
  speciesId: z.string().uuid(),
  farmingMethod: z.enum(['OFF_BOTTOM', 'LONG_LINE', 'RAFT', 'FLOATING_LINE']).default('OFF_BOTTOM'),
  exposure: z.enum(['SHELTERED', 'MODERATE', 'EXPOSED']).default('MODERATE'),
  anchoringMethod: z.enum(['WOODEN_STAKES', 'CONCRETE_BLOCKS', 'SAND_BAGS', 'ROCKS']).default('WOODEN_STAKES'),
  areaHectares: num(0, 1000).optional().nullable(),
  lineCount: z.coerce.number().int().min(0).max(100000).default(0),
  notes: optText(),
  latitude: num(-90, 90),
  longitude: num(-180, 180),
  locationName: trimmed(120),
  district: trimmed(80),
  region: trimmed(80),
  plantingDate: dateStr.optional(),
  expectedHarvestDate: dateStr.optional(),
  linesPlanted: z.coerce.number().int().min(1).max(100000).optional(),
});

export const farmUpdateSchema = farmSchema.partial().omit({ plantingDate: true, expectedHarvestDate: true, linesPlanted: true, farmCode: true })
  .extend({ status: z.enum(['ACTIVE', 'FALLOW', 'INACTIVE']).optional() });

export const cycleSchema = z.object({
  plantingDate: dateStr,
  expectedHarvestDate: dateStr.optional(),
  linesPlanted: z.coerce.number().int().min(1).max(100000),
  seedQuantityKg: num(0, 100000).optional().nullable(),
  notes: optText(),
});

export const cycleUpdateSchema = z.object({ status: z.enum(['ACTIVE', 'HARVESTED', 'FAILED']), notes: optText() });

const gear = z.enum(['GOOD', 'LOOSE', 'BROKEN', 'MISSING']);
export const observationSchema = z.object({
  observedAt: dateStr.optional(),
  cropCondition: z.enum(['GOOD', 'FAIR', 'POOR']),
  whitening: bool.default(false),
  breakage: bool.default(false),
  epiphytes: bool.default(false),
  diseaseSymptoms: bool.default(false),
  unusualGrowth: bool.default(false),
  growthCondition: z.enum(['NORMAL', 'SLOW', 'UNUSUAL']).optional().nullable(),
  waterAppearance: z.enum(['CLEAR', 'TURBID', 'DISCOLORED']).optional().nullable(),
  lineCondition: gear.optional().nullable(),
  anchorCondition: gear.optional().nullable(),
  percentAffected: num(0, 100).optional().nullable(),
  notes: optText(),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  imageFileId: z.string().uuid().optional().nullable(),
});

export const reviewSchema = z.object({
  status: z.enum(['REVIEWED', 'FLAGGED']),
  note: optText(1000),
});

export const harvestSchema = z.object({
  harvestDate: dateStr,
  estimatedQuantity: num(0, 1e7).optional().nullable(),
  actualQuantity: num(0, 1e7),
  unit: z.enum(['KG_DRY', 'KG_WET']).default('KG_DRY'),
  qualityGrade: z.enum(['A', 'B', 'C', 'REJECT']).optional().nullable(),
  buyerId: z.string().uuid().optional().nullable(),
  dryingMethod: z.enum(['RACK', 'TARPAULIN', 'ROPE_HANGING', 'GROUND']).optional().nullable(),
  dryingDurationDays: num(0, 60).optional().nullable(),
  pricePerKg: num(0, 1e6).optional().nullable(),
  notes: optText(),
  closeCycle: bool.default(true),
  moisturePercent: num(0, 100).optional().nullable(),
  impurityPercent: num(0, 100).optional().nullable(),
  groundContact: bool.optional(),
  rainDuringDrying: bool.optional(),
});

export const lossSchema = z.object({
  lossDate: dateStr,
  cause: z.enum(['ICE_ICE', 'STORM', 'EPIPHYTES', 'GRAZING', 'THEFT', 'POOR_GROWTH', 'OTHER']),
  quantityKg: num(0, 1e7).optional().nullable(),
  percentLost: num(0, 100),
  notes: optText(),
});

export const farmerActionSchema = z.object({
  recommendationId: z.string().uuid().optional().nullable(),
  actionTaken: bool,
  description: z.string().trim().max(500).optional(),
  performedAt: dateStr.optional(),
  notes: optText(),
});

export const outcomeSchema = z.object({
  farmerActionId: z.string().uuid().optional().nullable(),
  recommendationId: z.string().uuid().optional().nullable(),
  predictionId: z.string().uuid().optional().nullable(),
  outcomeType: z.enum(['NO_LOSS', 'MINOR_LOSS', 'MAJOR_LOSS', 'TOTAL_LOSS', 'HARVESTED']),
  lossPercent: num(0, 100).optional().nullable(),
  riskMaterialized: bool.optional().nullable(),
  outcomeDate: dateStr.optional(),
  notes: optText(),
});

export const recommendationUpdateSchema = z.object({ status: z.enum(['ACKNOWLEDGED', 'COMPLETED', 'DISMISSED']) });

export const simulationSchema = z.object({
  farmId: z.string().uuid(),
  overrides: z.object({
    sstAnomalyC: num(-3, 5).optional(),
    waveHeightM: num(0, 10).optional(),
    windSpeedKmh: num(0, 200).optional(),
    rainfallMm: num(0, 500).optional(),
    currentVelocityMs: num(0, 5).optional(),
    salinityPsu: num(0, 45).optional(),
    sstAnomalyDays: z.coerce.number().int().min(0).max(30).optional(),
  }).optional(),
});

const riskLevel = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const condition = z.object({ feature: z.string().regex(/^[A-Za-z0-9_]+$/), op: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'neq']), value: z.union([z.number(), z.string(), z.boolean()]) });
export const actionLibrarySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,60}$/),
  riskType: z.enum(['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW']),
  minimumRiskLevel: riskLevel,
  maximumRiskLevel: riskLevel.optional().nullable(),
  cropStage: z.enum(['ANY', 'EARLY', 'GROWING', 'MATURING', 'HARVEST_READY']).default('ANY'),
  conditions: z.array(condition).max(10).optional().nullable(),
  action: trimmed(500),
  actionSw: trimmed(500),
  explanation: trimmed(1000),
  explanationSw: trimmed(1000),
  urgency: z.enum(['ROUTINE', 'SOON', 'URGENT', 'IMMEDIATE']).default('ROUTINE'),
  urgencyHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  source: trimmed(300),
  enabled: bool.default(true),
  escalateToExtension: bool.default(false),
});
export const actionLibraryUpdateSchema = actionLibrarySchema.partial().omit({ code: true });
export const actionValidateSchema = z.object({ validated: bool, note: optText(1000) });

export const flagPredictionSchema = z.object({ reason: trimmed(1000), feedbackType: z.enum(['FALSE_POSITIVE', 'FALSE_NEGATIVE', 'FLAGGED', 'CORRECT']).default('FLAGGED') });
export const extensionNoteSchema = z.object({ note: trimmed(2000), visitPriority: riskLevel.optional().nullable(), visitBy: dateStr.optional().nullable() });

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  farmId: z.string().uuid().optional().nullable(),
  language: z.enum(['en', 'sw']).optional(),
});

export const testSmsSchema = z.object({
  phone,
  message: z.string().trim().min(1).max(306).optional(),
});

export const cooperativeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  name: trimmed(160),
  district: trimmed(80),
  region: trimmed(80),
  description: optText(1000),
});

export const adminUserCreateSchema = z.object({
  email: optEmail,
  password: z.string().min(8).max(128),
  fullName: trimmed(120),
  phone: phone.optional().nullable(),
  roles: z.array(z.enum(['FARMER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'ADMIN'])).min(1),
  cooperativeId: z.string().uuid().optional().nullable(),
  preferredLanguage: z.enum(['en', 'sw']).default('sw'),
}).refine((v) => v.email || v.phone, { message: 'Enter a phone number or an email', path: ['phone'] });

export const adminUserUpdateSchema = z.object({
  fullName: trimmed(120).optional(),
  phone: phone.optional().nullable(),
  isActive: bool.optional(),
  roles: z.array(z.enum(['FARMER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'ADMIN'])).min(1).optional(),
  cooperativeId: z.string().uuid().optional().nullable(),
});

export const settingUpdateSchema = z.object({ value: z.any() });
export const modelStatusSchema = z.object({ status: z.enum(['ACTIVE', 'RETIRED', 'TRAINED']) });

export const demandSchema = z.object({
  speciesId: z.string().uuid().optional().nullable(),
  quantityKg: num(1, 1e8),
  pricePerKg: num(0, 1e6).optional().nullable(),
  neededBy: dateStr,
  minimumGrade: z.enum(['A', 'B', 'C']).optional().nullable(),
  notes: optText(),
});

export const forecastQuerySchema = z.object({
  cooperativeId: z.string().uuid().optional(),
  district: z.string().max(80).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  days: z.coerce.number().int().min(1).max(180).optional(),
  minQuantityKg: z.coerce.number().min(0).optional(),
  grade: z.enum(['A', 'B', 'C', 'REJECT']).optional(),
});
