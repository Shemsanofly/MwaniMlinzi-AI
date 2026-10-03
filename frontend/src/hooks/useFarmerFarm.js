import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { farmApi } from '../api/endpoints.js';

const KEY = 'mwanimlinzi.selectedFarm';

/** Farmer's farms + the currently selected farm (remembered per browser). */
export function useFarmerFarm() {
  const farmsQuery = useQuery({ queryKey: ['farms', 'mine'], queryFn: () => farmApi.list() });
  const [selectedId, setSelectedId] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const farms = farmsQuery.data?.farms || [];
  const farm = farms.find((f) => f.id === selectedId) || farms[0] || null;
  useEffect(() => {
    if (farm && farm.id !== selectedId) setSelectedId(farm.id);
  }, [farm, selectedId]);
  const selectFarm = (id) => {
    setSelectedId(id);
    try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
  };
  return { farms, farm, farmId: farm?.id || null, selectFarm, ...farmsQuery };
}
