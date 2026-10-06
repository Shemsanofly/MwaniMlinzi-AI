import { Navigate, useLocation } from '../navigation.jsx';
import { useAuth } from '../stores/AuthContext.jsx';
import { PageLoader, ErrorState } from '../components/ui/index.jsx';

/** Requires login; if `roles` is given, one of them (ADMIN always passes — superadmins see every tree). */
export default function ProtectedRoute({ roles, children }) {
  const { status, user, hasRole, loggedOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  // After an explicit logout nothing may remember the previous user's page.
  if (status !== 'authenticated') return <Navigate to="/login" replace state={loggedOut ? undefined : { from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (roles && !hasRole(...roles, 'ADMIN')) {
    return <div className="p-6"><ErrorState error={{ status: 403 }} /></div>;
  }
  return user ? children : <PageLoader />;
}
