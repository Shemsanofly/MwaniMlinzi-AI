'use client';
import { Navigate } from '../../src/client/navigation.jsx';
import { useAuth } from '../../src/client/stores/AuthContext.jsx';
import { PageLoader } from '../../src/client/components/ui/index.jsx';

export default function HomeRedirect() {
  const { status, homePath } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return <Navigate to={status === 'authenticated' ? homePath : '/login'} replace />;
}
