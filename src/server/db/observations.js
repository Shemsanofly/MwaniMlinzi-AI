/** Disease entries live with the observation; flatten them for the existing staff feed. */
export async function latestDiseases(db, limit = 20) {
  const rows = await db.$queryRaw`
    SELECT d.entry AS disease,
           jsonb_build_object('id', f.id, 'farmCode', f.farm_code, 'name', f.name) AS farm
    FROM farm_observations o
    JOIN farms f ON f.id = o.farm_id
    CROSS JOIN LATERAL jsonb_array_elements(o.diseases) AS d(entry)
    ORDER BY (d.entry->>'createdAt')::timestamptz DESC, d.entry->>'id'
    LIMIT ${limit}`;
  return rows.map(({ disease, farm }) => ({ ...disease, farm }));
}
