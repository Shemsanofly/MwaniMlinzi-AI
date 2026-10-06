import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInvalidateFarm } from '../shared.jsx';

test('after a farmer saves anything (e.g. a harvest with a price) the record book is refreshed too', () => {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const { result } = renderHook(() => useInvalidateFarm(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
  result.current('f1');
  expect(spy).toHaveBeenCalledWith({ queryKey: ['records'] });
});
