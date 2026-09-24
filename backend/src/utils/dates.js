export const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

export const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY_MS);

export const daysBetween = (from, to = new Date()) => Math.floor((startOfDay(to) - startOfDay(from)) / DAY_MS);

/** Crop age is always derived from the planting date — never entered manually. */
export const cropAgeDays = (plantingDate, now = new Date()) => (plantingDate ? Math.max(0, daysBetween(plantingDate, now)) : null);

/** YYYY-MM-DD (UTC) — short and unambiguous for SMS/USSD. */
export const formatDate = (d) => new Date(d).toISOString().slice(0, 10);
