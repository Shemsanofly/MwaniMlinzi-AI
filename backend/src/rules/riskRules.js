import { clamp, round } from '../ai/features.js';

/**
 * Transparent, rule-based baseline risk model.
 *
 * Each risk type is a logistic score: logit = bias + Σ term(features).
 * Every term is a named, human-readable factor, so each prediction can be explained
 * exactly (no LLM involvement). Coefficients are expert-style starting values for the
 * MVP and MUST be calibrated with local field data before real-world deployment.
 *
 * `requires` lists the features whose absence lowers confidence for that risk type.
 */

const fmt = (v, dp = 1) => (v == null ? '—' : Number(v).toFixed(dp));
const signed = (v, dp = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(dp)}`);

export const RISK_RULES = {
  HEAT_ICE_ICE: {
    bias: -3.4,
    horizonHours: 72,
    requires: ['sstC', 'sstAnomalyC', 'cropAgeDays'],
    terms: [
      {
        code: 'SST_ANOMALY',
        compute: (f) => (f.sstAnomalyC == null ? 0 : 1.0 * clamp(f.sstAnomalyC, -1.5, 3)),
        value: (f) => `${signed(f.sstAnomalyC)}°C`,
        en: (f) => (f.sstAnomalyC >= 0 ? `Sea surface temperature is ${signed(f.sstAnomalyC)}°C above normal for this season` : `Sea surface temperature is ${fmt(Math.abs(f.sstAnomalyC))}°C below normal (cooler water)`),
        sw: (f) => (f.sstAnomalyC >= 0 ? `Joto la uso wa bahari liko ${signed(f.sstAnomalyC)}°C juu ya kawaida kwa msimu huu` : `Joto la bahari liko ${fmt(Math.abs(f.sstAnomalyC))}°C chini ya kawaida (maji ni baridi)`),
      },
      {
        code: 'SST_PERSISTENCE',
        compute: (f) => 0.1 * clamp(f.sstAnomalyDays ?? 0, 0, 10),
        value: (f) => `${f.sstAnomalyDays ?? 0} days`,
        en: (f) => `Elevated sea temperature has persisted for ${f.sstAnomalyDays} day(s)`,
        sw: (f) => `Joto la juu la bahari limeendelea kwa siku ${f.sstAnomalyDays}`,
      },
      {
        code: 'SST_ABOVE_OPTIMAL',
        compute: (f) => (f.sstC == null ? 0 : 0.7 * Math.max(0, f.sstC - f.optimalSstMax)),
        value: (f) => `${fmt(f.sstC)}°C`,
        en: (f) => `Water temperature (${fmt(f.sstC)}°C) is above the optimal maximum for this species (${fmt(f.optimalSstMax)}°C)`,
        sw: (f) => `Joto la maji (${fmt(f.sstC)}°C) limezidi kiwango bora kwa aina hii ya mwani (${fmt(f.optimalSstMax)}°C)`,
      },
      {
        code: 'SST_RISING',
        compute: (f) => (f.sstTrend7d == null ? 0 : 0.5 * clamp(f.sstTrend7d, 0, 1.5)),
        value: (f) => `${signed(f.sstTrend7d)}°C / 7 days`,
        en: (f) => `Sea temperature has risen ${signed(f.sstTrend7d)}°C over the past 7 days`,
        sw: (f) => `Joto la bahari limepanda ${signed(f.sstTrend7d)}°C katika siku 7 zilizopita`,
      },
      {
        code: 'CROP_STAGE',
        compute: (f) => {
          if (f.cropAgeDays == null) return 0;
          if (f.cropAgeDays < 14) return -0.3;
          if (f.cropAgeDays <= 50) return f.cropAgeDays >= 25 ? 0.5 : 0.1;
          return 0.3;
        },
        value: (f) => `${f.cropAgeDays} days`,
        en: (f) => (f.cropAgeDays < 14 ? `Young crop (${f.cropAgeDays} days) is less exposed to ice-ice so far` : `Crop age is ${f.cropAgeDays} days — a stage vulnerable to heat stress`),
        sw: (f) => (f.cropAgeDays < 14 ? `Mwani ni mchanga (siku ${f.cropAgeDays}), hatari ya ice-ice bado ni ndogo` : `Umri wa mwani ni siku ${f.cropAgeDays} — hatua inayoathirika na joto`),
      },
      {
        code: 'SPECIES_SENSITIVITY',
        compute: (f) => 1.0 * (f.heatSensitivity - 0.5),
        value: (f) => fmt(f.heatSensitivity, 2),
        en: (f) => (f.heatSensitivity >= 0.5 ? 'This seaweed variety is sensitive to heat stress' : 'This seaweed variety tolerates heat relatively well'),
        sw: (f) => (f.heatSensitivity >= 0.5 ? 'Aina hii ya mwani huathirika na joto' : 'Aina hii ya mwani huvumilia joto kiasi'),
      },
      {
        code: 'WHITENING_REPORTED',
        compute: (f) => (f.obsWhitening ? 1.2 : 0),
        value: () => 'yes',
        en: () => 'Farmer reported whitening (a sign of ice-ice)',
        sw: () => 'Mkulima ameripoti mwani kubadilika rangi kuwa mweupe (dalili ya ice-ice)',
      },
      {
        code: 'DISEASE_SYMPTOMS',
        compute: (f) => (f.obsDisease ? 0.9 : 0),
        value: () => 'yes',
        en: () => 'Disease symptoms were reported on the farm',
        sw: () => 'Dalili za ugonjwa zimeripotiwa shambani',
      },
      {
        code: 'PERCENT_AFFECTED',
        compute: (f) => (f.obsPercentAffected ? Math.min(1.5, 0.025 * f.obsPercentAffected) : 0),
        value: (f) => `${fmt(f.obsPercentAffected, 0)}%`,
        en: (f) => `About ${fmt(f.obsPercentAffected, 0)}% of the crop was reported affected`,
        sw: (f) => `Takriban ${fmt(f.obsPercentAffected, 0)}% ya mwani imeripotiwa kuathirika`,
      },
      {
        code: 'CALM_WARM_WATER',
        compute: (f) => (f.waveHeightM != null && f.waveHeightM < 0.4 && (f.sstAnomalyC ?? 0) > 0.5 ? 0.3 : 0),
        value: (f) => `${fmt(f.waveHeightM)} m waves`,
        en: () => 'Calm water with little mixing keeps warm water over the farm',
        sw: () => 'Maji yametulia bila kuchanganyika, hivyo maji ya joto yanabaki shambani',
      },
      {
        code: 'LOW_SALINITY',
        compute: (f) => (f.salinityPsu != null && f.salinityPsu < 30 ? 0.3 : 0),
        value: (f) => `${fmt(f.salinityPsu)} PSU`,
        en: (f) => `Low salinity (${fmt(f.salinityPsu)} PSU) adds stress to the crop`,
        sw: (f) => `Chumvi ya maji iko chini (${fmt(f.salinityPsu)} PSU), inaongeza msongo kwa mwani`,
      },
      {
        code: 'FARM_HISTORY',
        compute: (f) => 1.2 * (f.histIceIceLossRate || 0),
        value: (f) => `${fmt((f.histIceIceLossRate || 0) * 100, 0)}% of past cycles`,
        en: (f) => `This farm had ice-ice losses in ${fmt((f.histIceIceLossRate || 0) * 100, 0)}% of past cycles`,
        sw: (f) => `Shamba hili lilipata hasara ya ice-ice katika ${fmt((f.histIceIceLossRate || 0) * 100, 0)}% ya misimu iliyopita`,
      },
    ],
  },

  STORM_LINE_DAMAGE: {
    bias: -3.6,
    horizonHours: 72,
    requires: ['waveHeightM', 'windSpeedKmh'],
    terms: [
      {
        code: 'WAVE_HEIGHT',
        compute: (f) => (f.waveHeightM == null ? 0 : 1.3 * Math.max(0, f.waveHeightM - 0.8)),
        value: (f) => `${fmt(f.waveHeightM)} m`,
        en: (f) => `Wave height of ${fmt(f.waveHeightM)} m is expected`,
        sw: (f) => `Mawimbi ya urefu wa mita ${fmt(f.waveHeightM)} yanatarajiwa`,
      },
      {
        code: 'WIND_SPEED',
        compute: (f) => (f.windSpeedKmh == null ? 0 : 0.05 * Math.max(0, f.windSpeedKmh - 20)),
        value: (f) => `${fmt(f.windSpeedKmh, 0)} km/h`,
        en: (f) => `Strong wind of ${fmt(f.windSpeedKmh, 0)} km/h is expected`,
        sw: (f) => `Upepo mkali wa km ${fmt(f.windSpeedKmh, 0)} kwa saa unatarajiwa`,
      },
      {
        code: 'CURRENT_VELOCITY',
        compute: (f) => (f.currentVelocityMs == null ? 0 : 1.2 * Math.max(0, f.currentVelocityMs - 0.5)),
        value: (f) => `${fmt(f.currentVelocityMs, 2)} m/s`,
        en: (f) => `Strong currents (${fmt(f.currentVelocityMs, 2)} m/s) pull on lines and anchors`,
        sw: (f) => `Mikondo mikali ya maji (${fmt(f.currentVelocityMs, 2)} m/s) inavuta mistari na nanga`,
      },
      {
        code: 'HEAVY_RAIN',
        compute: (f) => (f.rainfallMm == null ? 0 : 0.03 * clamp(f.rainfallMm, 0, 50)),
        value: (f) => `${fmt(f.rainfallMm, 0)} mm`,
        en: (f) => `Rainfall of ${fmt(f.rainfallMm, 0)} mm indicates stormy weather`,
        sw: (f) => `Mvua ya mm ${fmt(f.rainfallMm, 0)} inaonyesha hali ya dhoruba`,
      },
      {
        code: 'FARM_EXPOSURE',
        compute: (f) => 1.0 * f.exposureScore,
        value: (f) => fmt(f.exposureScore, 1),
        en: (f) => (f.exposureScore >= 1 ? 'The farm is in an exposed location' : f.exposureScore > 0 ? 'The farm is moderately exposed to open water' : 'The farm is sheltered'),
        sw: (f) => (f.exposureScore >= 1 ? 'Shamba liko sehemu iliyo wazi kwa mawimbi' : f.exposureScore > 0 ? 'Shamba liko wazi kiasi kwa bahari' : 'Shamba liko sehemu iliyohifadhiwa'),
      },
      {
        code: 'ANCHORING',
        compute: (f) => 0.8 * f.anchorWeakness,
        value: (f) => fmt(f.anchorWeakness, 1),
        en: (f) => (f.anchorWeakness >= 0.6 ? 'Anchoring method is less secure in rough water' : 'Anchoring method is relatively secure'),
        sw: (f) => (f.anchorWeakness >= 0.6 ? 'Njia ya kufunga nanga si imara sana kwenye maji machafu' : 'Njia ya kufunga nanga ni imara kiasi'),
      },
      {
        code: 'GEAR_CONDITION',
        compute: (f) => (f.obsLooseGear ? 1.0 : 0),
        value: () => 'loose/broken',
        en: () => 'Loose or broken lines/anchors were reported',
        sw: () => 'Mistari au nanga zilizolegea au kukatika zimeripotiwa',
      },
      {
        code: 'BREAKAGE_REPORTED',
        compute: (f) => (f.obsBreakage ? 0.8 : 0),
        value: () => 'yes',
        en: () => 'Breakage of seaweed or lines was reported',
        sw: () => 'Kukatika kwa mwani au mistari kumeripotiwa',
      },
      {
        code: 'FARM_HISTORY',
        compute: (f) => 1.0 * (f.histStormLossRate || 0),
        value: (f) => `${fmt((f.histStormLossRate || 0) * 100, 0)}%`,
        en: (f) => `This farm had storm losses in ${fmt((f.histStormLossRate || 0) * 100, 0)}% of past cycles`,
        sw: (f) => `Shamba hili lilipata hasara ya dhoruba katika ${fmt((f.histStormLossRate || 0) * 100, 0)}% ya misimu iliyopita`,
      },
    ],
  },

  POOR_GROWTH: {
    bias: -3.0,
    horizonHours: 168,
    requires: ['cropAgeDays', 'obsPoorCondition'],
    terms: [
      {
        code: 'SLOW_GROWTH_REPORTED',
        compute: (f) => (f.obsSlowGrowth ? 1.5 : 0),
        value: () => 'yes',
        en: () => 'Slow or unusual growth was reported',
        sw: () => 'Ukuaji wa polepole au usio wa kawaida umeripotiwa',
      },
      {
        code: 'CROP_CONDITION',
        compute: (f) => (f.obsPoorCondition == null ? 0 : f.obsPoorCondition >= 1 ? 1.2 : f.obsPoorCondition > 0 ? 0.5 : -0.3),
        value: (f) => ({ 1: 'poor', 0.5: 'fair', 0: 'good' }[f.obsPoorCondition] ?? '—'),
        en: (f) => (f.obsPoorCondition >= 1 ? 'Crop condition was reported as poor' : f.obsPoorCondition > 0 ? 'Crop condition was reported as fair' : 'Crop condition was reported as good'),
        sw: (f) => (f.obsPoorCondition >= 1 ? 'Hali ya mwani imeripotiwa kuwa mbaya' : f.obsPoorCondition > 0 ? 'Hali ya mwani imeripotiwa kuwa ya wastani' : 'Hali ya mwani imeripotiwa kuwa nzuri'),
      },
      {
        code: 'EPIPHYTES',
        compute: (f) => (f.obsEpiphytes ? 0.9 : 0),
        value: () => 'yes',
        en: () => 'Epiphytes (growth on the seaweed) were reported',
        sw: () => 'Viumbe vinavyoota juu ya mwani (epiphytes) vimeripotiwa',
      },
      {
        code: 'SST_OUTSIDE_OPTIMAL',
        compute: (f) => {
          if (f.sstC == null) return 0;
          const out = Math.max(0, f.optimalSstMin - f.sstC, f.sstC - f.optimalSstMax);
          return Math.min(1.5, 0.5 * out);
        },
        value: (f) => `${fmt(f.sstC)}°C`,
        en: (f) => `Water temperature (${fmt(f.sstC)}°C) is outside the best growing range (${fmt(f.optimalSstMin)}–${fmt(f.optimalSstMax)}°C)`,
        sw: (f) => `Joto la maji (${fmt(f.sstC)}°C) liko nje ya kiwango bora cha ukuaji (${fmt(f.optimalSstMin)}–${fmt(f.optimalSstMax)}°C)`,
      },
      {
        code: 'LOW_SALINITY',
        compute: (f) => (f.salinityPsu == null ? 0 : Math.min(1.5, 0.35 * Math.max(0, 31 - f.salinityPsu))),
        value: (f) => `${fmt(f.salinityPsu)} PSU`,
        en: (f) => `Low salinity (${fmt(f.salinityPsu)} PSU), often after heavy rain, slows growth`,
        sw: (f) => `Chumvi ya maji iko chini (${fmt(f.salinityPsu)} PSU), mara nyingi baada ya mvua kubwa, hupunguza ukuaji`,
      },
      {
        code: 'LOW_NUTRIENTS',
        compute: (f) => (f.chlorophyllMgM3 != null && f.chlorophyllMgM3 < 0.2 ? 0.8 : 0),
        value: (f) => `${fmt(f.chlorophyllMgM3, 2)} mg/m³`,
        en: () => 'Low chlorophyll suggests nutrient-poor water',
        sw: () => 'Kiwango kidogo cha klorofili kinaonyesha maji yenye virutubisho vichache',
      },
      {
        code: 'TURBID_WATER',
        compute: (f) => (f.obsTurbidWater ? 0.4 : 0),
        value: () => 'yes',
        en: () => 'Water was reported as turbid or discoloured',
        sw: () => 'Maji yameripotiwa kuwa machafu au kubadilika rangi',
      },
      {
        code: 'PAST_YIELD',
        compute: (f) => (f.histYieldRatio == null ? 0 : Math.min(1, 2 * Math.max(0, 1 - f.histYieldRatio))),
        value: (f) => `${fmt((f.histYieldRatio ?? 0) * 100, 0)}% of expected`,
        en: (f) => `Past harvests reached only ${fmt((f.histYieldRatio ?? 0) * 100, 0)}% of expected yield`,
        sw: (f) => `Mavuno yaliyopita yalifikia ${fmt((f.histYieldRatio ?? 0) * 100, 0)}% tu ya matarajio`,
      },
      {
        code: 'TOO_EARLY',
        compute: (f) => (f.cropAgeDays != null && f.cropAgeDays < 10 ? -0.5 : 0),
        value: (f) => `${f.cropAgeDays} days`,
        en: () => 'The crop is very young, so growth problems are harder to judge',
        sw: () => 'Mwani bado ni mchanga sana, ni vigumu kupima tatizo la ukuaji',
      },
    ],
  },

  HARVEST_WINDOW: {
    bias: -3.2,
    horizonHours: 72,
    requires: ['cropAgeDays', 'rainfallMm'],
    // Needs heat/storm probabilities from the same run (the cost of waiting to harvest).
    terms: [
      {
        code: 'HARVEST_READY',
        compute: (f) => {
          if (f.maturityRatio == null) return 0;
          if (f.maturityRatio >= 0.95) return 1.8;
          if (f.maturityRatio >= 0.85) return 0.9;
          if (f.maturityRatio < 0.7) return -1.0;
          return 0;
        },
        value: (f) => `${f.cropAgeDays}/${f.expectedCycleDays} days`,
        en: (f) => (f.maturityRatio >= 0.85 ? `Crop is ${f.cropAgeDays} days old and near or at maturity (${f.expectedCycleDays}-day cycle)` : `Crop is ${f.cropAgeDays} days old — not yet ready for harvest (${f.expectedCycleDays}-day cycle)`),
        sw: (f) => (f.maturityRatio >= 0.85 ? `Mwani una siku ${f.cropAgeDays} na umekaribia au kufikia kukomaa (mzunguko wa siku ${f.expectedCycleDays})` : `Mwani una siku ${f.cropAgeDays} — bado haujawa tayari kuvunwa (mzunguko wa siku ${f.expectedCycleDays})`),
      },
      {
        code: 'OVER_MATURE',
        compute: (f) => (f.maturityRatio == null ? 0 : Math.min(1.2, 2.0 * Math.max(0, f.maturityRatio - 1.05))),
        value: (f) => `${f.cropAgeDays} days`,
        en: () => 'Harvest is overdue; mature seaweed left in water risks quality loss',
        sw: () => 'Mavuno yamechelewa; mwani uliokomaa ukiachwa baharini unapoteza ubora',
      },
      {
        code: 'RAIN_DRYING',
        compute: (f) => (f.rainfallMm == null ? 0 : 0.06 * clamp(f.rainfallMm, 0, 40)),
        value: (f) => `${fmt(f.rainfallMm, 0)} mm`,
        en: (f) => `Rain (${fmt(f.rainfallMm, 0)} mm) will make drying difficult`,
        sw: (f) => `Mvua (mm ${fmt(f.rainfallMm, 0)}) itafanya ukaushaji kuwa mgumu`,
      },
      {
        code: 'HIGH_HUMIDITY',
        compute: (f) => (f.humidityPct != null && f.humidityPct > 85 ? 0.4 : 0),
        value: (f) => `${fmt(f.humidityPct, 0)}%`,
        en: () => 'High humidity slows drying',
        sw: () => 'Unyevu mwingi hewani unachelewesha ukaushaji',
      },
      {
        code: 'STRONG_WIND',
        compute: (f) => (f.windSpeedKmh == null ? 0 : 0.03 * Math.max(0, f.windSpeedKmh - 30)),
        value: (f) => `${fmt(f.windSpeedKmh, 0)} km/h`,
        en: () => 'Strong wind makes harvesting at sea difficult',
        sw: () => 'Upepo mkali unafanya kuvuna baharini kuwa kugumu',
      },
      {
        code: 'HEAT_RISK_WHILE_MATURE',
        compute: (f) => (f.maturityRatio != null && f.maturityRatio >= 0.85 ? 1.2 * (f.heatProbability || 0) : 0),
        value: (f) => `${fmt((f.heatProbability || 0) * 100, 0)}%`,
        en: () => 'Heat/ice-ice risk means waiting longer could damage a mature crop',
        sw: () => 'Hatari ya joto/ice-ice inamaanisha kusubiri zaidi kunaweza kuharibu mwani uliokomaa',
      },
      {
        code: 'STORM_RISK_WHILE_MATURE',
        compute: (f) => (f.maturityRatio != null && f.maturityRatio >= 0.85 ? 1.0 * (f.stormProbability || 0) : 0),
        value: (f) => `${fmt((f.stormProbability || 0) * 100, 0)}%`,
        en: () => 'Storm risk means a mature crop could be lost before harvest',
        sw: () => 'Hatari ya dhoruba inaweza kusababisha kupoteza mwani uliokomaa kabla ya kuvuna',
      },
    ],
  },
};

export { round };
