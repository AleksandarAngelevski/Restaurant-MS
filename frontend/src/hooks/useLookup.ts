import { useQuery } from '@tanstack/react-query';
import { api, type Row } from '../api/client';

/** A lookup table (order-types, table-types, units...) as {id, label, ...extras} rows. */
export function useLookup(name: string, enabled = true) {
  const query = useQuery({
    queryKey: ['lookup', name],
    queryFn: () => api.get<Row[]>(`/lookups/${name}`),
    staleTime: 5 * 60_000,
    enabled,
  });
  return query.data ?? [];
}

export const toOptions = (rows: Row[], value = 'id', label = 'label') =>
  rows.map((row) => ({ value: row[value], label: String(row[label]) }));
