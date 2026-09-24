/**
 * Demo Action Library. These are STARTING rules written for the MVP demo.
 * They are NOT validated agronomic guidance and must be reviewed by local seaweed
 * extension experts (e.g. Zanzibar Ministry of Blue Economy & Fisheries officers) before real use.
 */
const SOURCE = 'MwaniMlinzi demo rule set v1 — requires local expert validation before real-world deployment';
const ge = (feature, value) => ({ feature, op: 'gte', value });
const lt = (feature, value) => ({ feature, op: 'lt', value });
const le = (feature, value) => ({ feature, op: 'lte', value });
const gt = (feature, value) => ({ feature, op: 'gt', value });

export const ACTION_LIBRARY = [
  // ── Heat / ice-ice ──
  { code: 'HEAT_LOW_MONITOR', riskType: 'HEAT_ICE_ICE', minimumRiskLevel: 'LOW', maximumRiskLevel: 'LOW', urgency: 'ROUTINE', urgencyHours: 168,
    action: 'Continue normal monitoring.', actionSw: 'Endelea na ufuatiliaji wa kawaida.',
    explanation: 'No strong heat or ice-ice signals. Keep checking your lines on normal farm visits.', explanationSw: 'Hakuna dalili kubwa za joto au ice-ice. Endelea kukagua mistari katika ziara za kawaida.' },
  { code: 'HEAT_MEDIUM_INSPECT', riskType: 'HEAT_ICE_ICE', minimumRiskLevel: 'MEDIUM', maximumRiskLevel: 'MEDIUM', urgency: 'SOON', urgencyHours: 72,
    action: 'Inspect seaweed condition during the next farm visit.', actionSw: 'Kagua hali ya mwani wakati wa ziara ijayo shambani.',
    explanation: 'Sea temperature or farm signs suggest a moderate chance of heat stress. Early detection limits spread.', explanationSw: 'Joto la bahari au dalili za shamba zinaonyesha uwezekano wa wastani wa msongo wa joto. Kugundua mapema kunapunguza kuenea.' },
  { code: 'HEAT_HIGH_INSPECT_24H', riskType: 'HEAT_ICE_ICE', minimumRiskLevel: 'HIGH', maximumRiskLevel: 'HIGH', urgency: 'URGENT', urgencyHours: 24,
    action: 'Inspect lines within 24 hours and record whitening or breakage.', actionSw: 'Kagua mistari ya mwani ndani ya saa 24 na rekodi dalili za kubadilika rangi au kukatika.',
    explanation: 'High heat / ice-ice risk. Recording symptoms quickly lets the system and your extension officer respond.', explanationSw: 'Hatari kubwa ya joto / ice-ice. Kurekodi dalili haraka kunasaidia mfumo na afisa ugani kuchukua hatua.' },
  { code: 'HEAT_CRITICAL_ESCALATE', riskType: 'HEAT_ICE_ICE', minimumRiskLevel: 'CRITICAL', urgency: 'IMMEDIATE', urgencyHours: 12, escalateToExtension: true,
    action: 'Escalate to an extension officer and follow approved emergency farm guidance.', actionSw: 'Wasiliana na afisa ugani mara moja na fuata mwongozo wa dharura ulioidhinishwa.',
    explanation: 'Critical heat / ice-ice risk. An extension officer should confirm the situation and advise on approved measures.', explanationSw: 'Hatari muhimu ya joto / ice-ice. Afisa ugani anapaswa kuthibitisha hali na kushauri hatua zilizoidhinishwa.' },

  // ── Storm / line damage ──
  { code: 'STORM_LOW_MONITOR', riskType: 'STORM_LINE_DAMAGE', minimumRiskLevel: 'LOW', maximumRiskLevel: 'LOW', urgency: 'ROUTINE', urgencyHours: 168,
    action: 'Continue monitoring.', actionSw: 'Endelea kufuatilia.',
    explanation: 'Waves and wind are within normal range for your farm.', explanationSw: 'Mawimbi na upepo viko katika kiwango cha kawaida kwa shamba lako.' },
  { code: 'STORM_MEDIUM_CHECK', riskType: 'STORM_LINE_DAMAGE', minimumRiskLevel: 'MEDIUM', maximumRiskLevel: 'MEDIUM', urgency: 'SOON', urgencyHours: 48,
    action: 'Check anchors and loose lines.', actionSw: 'Kagua nanga na mistari iliyolegea.',
    explanation: 'Rougher water is possible. Loose lines and weak anchors fail first.', explanationSw: 'Maji yanaweza kuchafuka. Mistari iliyolegea na nanga dhaifu huharibika kwanza.' },
  { code: 'STORM_HIGH_SECURE', riskType: 'STORM_LINE_DAMAGE', minimumRiskLevel: 'HIGH', maximumRiskLevel: 'HIGH', urgency: 'URGENT', urgencyHours: 24,
    action: 'Inspect anchors and secure loose lines before severe conditions.', actionSw: 'Kagua nanga na funga vizuri mistari iliyolegea kabla ya hali mbaya ya bahari.',
    explanation: 'High waves or strong wind are expected. Securing lines beforehand reduces breakage and lost seaweed.', explanationSw: 'Mawimbi makubwa au upepo mkali unatarajiwa. Kufunga mistari mapema kunapunguza kukatika na kupoteza mwani.' },
  { code: 'STORM_CRITICAL_SAFETY', riskType: 'STORM_LINE_DAMAGE', minimumRiskLevel: 'CRITICAL', urgency: 'IMMEDIATE', urgencyHours: 12, escalateToExtension: true,
    action: 'Do not go to sea in dangerous conditions. Secure lines only when it is safe, and inform your cooperative.', actionSw: 'Usiende baharini wakati wa hali ya hatari. Funga mistari pale tu itakapokuwa salama, na ujulishe ushirika wako.',
    explanation: 'Critical storm risk. Personal safety comes first; the cooperative can coordinate help after conditions ease.', explanationSw: 'Hatari muhimu ya dhoruba. Usalama wako ni wa kwanza; ushirika unaweza kuratibu msaada hali ikitulia.' },

  // ── Poor growth ──
  { code: 'GROWTH_LOW_RECORD', riskType: 'POOR_GROWTH', minimumRiskLevel: 'LOW', maximumRiskLevel: 'LOW', urgency: 'ROUTINE', urgencyHours: 168,
    action: 'Growth looks normal. Keep recording crop condition weekly.', actionSw: 'Ukuaji unaonekana wa kawaida. Endelea kurekodi hali ya mwani kila wiki.',
    explanation: 'Regular records improve future predictions for your farm.', explanationSw: 'Kumbukumbu za mara kwa mara zinaboresha utabiri wa baadaye kwa shamba lako.' },
  { code: 'GROWTH_MEDIUM_CLEAN', riskType: 'POOR_GROWTH', minimumRiskLevel: 'MEDIUM', maximumRiskLevel: 'MEDIUM', urgency: 'SOON', urgencyHours: 72,
    action: 'Check seedlings and remove epiphytes during the next visit, then record growth.', actionSw: 'Kagua mbegu na ondoa uchafu (epiphytes) katika ziara ijayo, kisha rekodi ukuaji.',
    explanation: 'Some signs of slower growth. Clean lines help seaweed get light and nutrients.', explanationSw: 'Kuna dalili za ukuaji wa polepole. Mistari safi husaidia mwani kupata mwanga na virutubisho.' },
  { code: 'GROWTH_HIGH_REVIEW', riskType: 'POOR_GROWTH', minimumRiskLevel: 'HIGH', urgency: 'SOON', urgencyHours: 72, escalateToExtension: true,
    action: 'Record growth on sample lines and ask an extension officer to review your seedlings and farm site.', actionSw: 'Rekodi ukuaji kwenye mistari ya sampuli na muombe afisa ugani akague mbegu na eneo la shamba lako.',
    explanation: 'Growth is likely to be poor this cycle. An officer can check seedling quality and site conditions.', explanationSw: 'Ukuaji unaweza kuwa hafifu msimu huu. Afisa ugani anaweza kukagua ubora wa mbegu na hali ya eneo.' },

  // ── Harvest window ──
  { code: 'HARVEST_NOT_READY', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'LOW', conditions: [lt('maturityRatio', 0.85)], urgency: 'ROUTINE', urgencyHours: 168, priority: 1,
    action: 'Crop is not ready for harvest yet. Continue normal care.', actionSw: 'Mwani bado haujawa tayari kuvunwa. Endelea na utunzaji wa kawaida.',
    explanation: 'Based on planting date and the usual cycle length for this variety.', explanationSw: 'Kulingana na tarehe ya kupanda na urefu wa kawaida wa mzunguko wa aina hii.' },
  { code: 'HARVEST_PREPARE', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'LOW', maximumRiskLevel: 'MEDIUM', conditions: [ge('maturityRatio', 0.85), lt('maturityRatio', 0.9)], urgency: 'SOON', urgencyHours: 96, priority: 2,
    action: 'Harvest is approaching. Prepare drying racks and arrange a buyer.', actionSw: 'Mavuno yanakaribia. Andaa vichanja vya kukaushia na tafuta mnunuzi.',
    explanation: 'The crop will reach maturity within days. Preparation avoids delays.', explanationSw: 'Mwani utakomaa ndani ya siku chache. Maandalizi yanaepusha kuchelewa.' },
  { code: 'HARVEST_FAVORABLE', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'LOW', maximumRiskLevel: 'MEDIUM', conditions: [ge('maturityRatio', 0.9), le('rainfallMm', 5)], urgency: 'SOON', urgencyHours: 72, priority: 3,
    action: 'Harvest window is favorable.', actionSw: 'Wakati wa kuvuna ni mzuri.',
    explanation: 'The crop is mature and dry weather is expected, which is good for drying.', explanationSw: 'Mwani umekomaa na hali ya hewa kavu inatarajiwa, jambo zuri kwa kukausha.' },
  { code: 'HARVEST_DRY_DAY', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'LOW', maximumRiskLevel: 'LOW', urgency: 'SOON', urgencyHours: 72,
    action: 'Monitor the weather and plan harvest for a dry day.', actionSw: 'Fuatilia hali ya hewa na panga kuvuna siku isiyo na mvua.',
    explanation: 'Harvesting before dry weather makes drying easier and protects quality.', explanationSw: 'Kuvuna kabla ya hali ya hewa kavu kunarahisisha kukausha na kulinda ubora.' },
  { code: 'HARVEST_POOR_DRYING', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'MEDIUM', conditions: [ge('maturityRatio', 0.85), gt('rainfallMm', 5)], urgency: 'SOON', urgencyHours: 48, priority: 3,
    action: 'Improve drying setup and avoid ground contact.', actionSw: 'Boresha sehemu ya kukaushia na epuka mwani kugusa ardhi.',
    explanation: 'Rain is expected while the crop is ready. Raised racks and covers protect quality.', explanationSw: 'Mvua inatarajiwa wakati mwani uko tayari. Vichanja vilivyoinuliwa na vifuniko hulinda ubora.' },
  { code: 'HARVEST_PLAN_SOON', riskType: 'HARVEST_WINDOW', minimumRiskLevel: 'MEDIUM', conditions: [ge('maturityRatio', 0.85)], urgency: 'URGENT', urgencyHours: 48, priority: 1,
    action: 'Plan harvest as soon as it is safe, to reduce losses of the mature crop.', actionSw: 'Panga kuvuna mapema pindi itakapokuwa salama, ili kupunguza hasara ya mwani uliokomaa.',
    explanation: 'The crop is mature and current conditions increase the risk of losing it if harvest is delayed.', explanationSw: 'Mwani umekomaa na hali ya sasa inaongeza hatari ya kuupoteza mavuno yakichelewa.' },
].map((a) => ({ cropStage: 'ANY', priority: 0, escalateToExtension: false, conditions: null, maximumRiskLevel: null, ...a, source: SOURCE, validated: false, enabled: true }));
