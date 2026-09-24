/**
 * Farmer-friendly one-line reasons per risk factor code (no numbers, no jargon).
 * The detailed labels (with values) stay available under "details" in the UI.
 * `up` = the factor increases the risk, `down` = it lowers the risk.
 */
const R = {
  SST_ANOMALY: { up: ['The sea is warmer than normal', 'Maji ya bahari yana joto kuliko kawaida'], down: ['The sea is cooler than normal', 'Maji ya bahari ni baridi kuliko kawaida'] },
  SST_PERSISTENCE: { up: ['The water has been warm for several days', 'Maji yamekuwa na joto kwa siku kadhaa'] },
  SST_ABOVE_OPTIMAL: { up: ['The water is too warm for your seaweed', 'Maji yana joto kupita kiasi kwa mwani wako'] },
  SST_RISING: { up: ['The sea is getting warmer', 'Joto la bahari linaongezeka'], down: ['The sea is cooling down', 'Joto la bahari linapungua'] },
  CROP_STAGE: { up: ['Your seaweed is at an age that is easily harmed by heat', 'Mwani wako uko katika umri unaoathirika kwa urahisi na joto'], down: ['Your seaweed is still young', 'Mwani wako bado ni mchanga'] },
  SPECIES_SENSITIVITY: { up: ['This seaweed type is sensitive to heat', 'Aina hii ya mwani huathirika na joto'], down: ['This seaweed type tolerates heat well', 'Aina hii ya mwani huvumilia joto'] },
  WHITENING_REPORTED: { up: ['Whitening was reported on the farm', 'Mwani kubadilika rangi kuwa mweupe umeripotiwa shambani'] },
  DISEASE_SYMPTOMS: { up: ['Disease signs were reported', 'Dalili za ugonjwa zimeripotiwa'] },
  PERCENT_AFFECTED: { up: ['Part of the crop is already affected', 'Sehemu ya mwani tayari imeathirika'] },
  CALM_WARM_WATER: { up: ['The water is calm and warm', 'Maji yametulia na yana joto'] },
  LOW_SALINITY: { up: ['The water is less salty than normal', 'Chumvi ya maji iko chini kuliko kawaida'] },
  FARM_HISTORY: { up: ['This farm has had this problem before', 'Shamba hili limewahi kupata tatizo hili'] },
  WAVE_HEIGHT: { up: ['Waves are high', 'Mawimbi ni makubwa'], down: ['Waves are low', 'Mawimbi ni madogo'] },
  WIND_SPEED: { up: ['Strong wind is expected', 'Upepo mkali unatarajiwa'], down: ['Wind is light', 'Upepo ni mdogo'] },
  CURRENT_VELOCITY: { up: ['Sea currents are strong', 'Mikondo ya bahari ina nguvu'] },
  HEAVY_RAIN: { up: ['Heavy rain is expected', 'Mvua kubwa inatarajiwa'] },
  FARM_EXPOSURE: { up: ['The farm is in an open, exposed place', 'Shamba liko sehemu iliyo wazi kwa mawimbi'], down: ['The farm is in a sheltered place', 'Shamba liko sehemu iliyokingwa'] },
  ANCHORING: { up: ['The anchors or pegs are weak', 'Nanga au vigingi si imara'], down: ['The anchors are strong', 'Nanga ni imara'] },
  GEAR_CONDITION: { up: ['The lines or ropes are worn', 'Kamba zimechakaa'], down: ['The lines are in good condition', 'Kamba ziko katika hali nzuri'] },
  BREAKAGE_REPORTED: { up: ['Broken seaweed or lines were reported', 'Kukatika kwa mwani au kamba kumeripotiwa'] },
  SLOW_GROWTH_REPORTED: { up: ['Slow growth was reported', 'Ukuaji hafifu umeripotiwa'] },
  CROP_CONDITION: { up: ['The seaweed looks weak', 'Mwani unaonekana dhaifu'], down: ['The seaweed looks healthy', 'Mwani unaonekana na afya'] },
  EPIPHYTES: { up: ['Dirt or other plants are growing on the seaweed', 'Uchafu au mimea mingine inaota juu ya mwani'] },
  SST_OUTSIDE_OPTIMAL: { up: ['The water temperature is not good for growth', 'Joto la maji si zuri kwa ukuaji'] },
  LOW_NUTRIENTS: { up: ['The water has little food for the seaweed', 'Maji yana virutubisho vichache'] },
  TURBID_WATER: { up: ['The water is cloudy', 'Maji ni machafu (hayaonyeshi vizuri)'] },
  PAST_YIELD: { up: ['Past harvests on this farm were low', 'Mavuno ya awali shambani hapa yalikuwa madogo'], down: ['Past harvests on this farm were good', 'Mavuno ya awali shambani hapa yalikuwa mazuri'] },
  TOO_EARLY: { down: ['The seaweed is not yet ready', 'Mwani bado haujakomaa'] },
  HARVEST_READY: { up: ['The seaweed is ready to harvest', 'Mwani uko tayari kuvunwa'] },
  OVER_MATURE: { up: ['The seaweed is past the best harvest time', 'Mwani umepita muda bora wa kuvuna'] },
  RAIN_DRYING: { up: ['Rain may spoil drying', 'Mvua inaweza kuharibu ukaushaji'] },
  HIGH_HUMIDITY: { up: ['The air is very humid, drying will be slow', 'Hewa ina unyevu mwingi, ukaushaji utakuwa wa polepole'] },
  STRONG_WIND: { up: ['Strong wind may make harvesting difficult', 'Upepo mkali unaweza kufanya uvunaji kuwa mgumu'] },
  HEAT_RISK_WHILE_MATURE: { up: ['Heat could damage mature seaweed', 'Joto linaweza kuharibu mwani uliokomaa'] },
  STORM_RISK_WHILE_MATURE: { up: ['Storms could damage mature seaweed', 'Dhoruba zinaweza kuharibu mwani uliokomaa'] },
};

/** @returns { en, sw } or null when no simple phrase exists for this code/direction. */
export function simpleReason(code, direction = 'INCREASES') {
  const entry = R[code]?.[direction === 'DECREASES' ? 'down' : 'up'];
  return entry ? { en: entry[0], sw: entry[1] } : null;
}

export const SIMPLE_REASON_CODES = Object.keys(R);
