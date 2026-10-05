/**
 * Approximate monthly mean sea-surface temperature (°C) for the Zanzibar/Pemba channel,
 * used to compute SST anomalies when a provider only reports absolute SST.
 * These are rounded reference values for the MVP; replace with a proper climatology
 * (e.g. NOAA OISST 1991–2020 monthly means for each farm's grid cell) for production.
 */
export const ZANZIBAR_SST_CLIMATOLOGY = [28.3, 28.9, 29.2, 28.8, 27.7, 26.6, 25.9, 25.6, 26.0, 26.8, 27.6, 28.1];

export const climatologySst = (date = new Date()) => ZANZIBAR_SST_CLIMATOLOGY[new Date(date).getUTCMonth()];
