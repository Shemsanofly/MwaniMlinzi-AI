'use client';
import ProtectedRoute from '../../src/client/layouts/ProtectedRoute.jsx';
import FarmerLayout from '../../src/client/layouts/FarmerLayout.jsx';

export default function Layout({ children }) {
  return <ProtectedRoute roles={['FARMER']}><FarmerLayout>{children}</FarmerLayout></ProtectedRoute>;
}
