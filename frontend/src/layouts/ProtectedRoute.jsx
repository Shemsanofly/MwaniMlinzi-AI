import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext.jsx';
import { PageLoader, ErrorState } from '../components/ui/index.jsx';

/** Requires login; if `roles` is given, one of them (ADMIN always passes). */
export default function ProtectedRoute({ roles }) {
  const { status, user, hasRole } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !hasRole(...roles, 'ADMIN')) {
    return <div className="p-6"><ErrorState error={{ status: 403 }} /></div>;
  }
  return user ? <Outlet /> : <PageLoader />;
}
