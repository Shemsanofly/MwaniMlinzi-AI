import { lazy, Suspense } from 'react';

export default function dynamic(loader, { loading: Loading } = {}) {
  const Lazy = lazy(async () => { const m = await loader(); return { default: m.default ?? m }; });
  return function DynamicComponent(props) {
    return <Suspense fallback={Loading ? <Loading /> : null}><Lazy {...props} /></Suspense>;
  };
}
