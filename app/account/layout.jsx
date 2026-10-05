'use client';
import ProtectedRoute from '../../src/client/layouts/ProtectedRoute.jsx';
import AppLayout from '../../src/client/layouts/AppLayout.jsx';

export default function Layout({ children }) {
  return <ProtectedRoute><AppLayout>{children}</AppLayout></ProtectedRoute>;
}
