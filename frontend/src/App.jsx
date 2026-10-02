import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import FarmerLayout from './layouts/FarmerLayout.jsx';
import ProtectedRoute from './layouts/ProtectedRoute.jsx';
import { PageLoader } from './components/ui/index.jsx';
import { useAuth } from './stores/AuthContext.jsx';

const page = (loader) => lazy(loader);

// Public
const Landing = page(() => import('./pages/public/Landing.jsx'));
const About = page(() => import('./pages/public/About.jsx'));
const HowItWorks = page(() => import('./pages/public/HowItWorks.jsx'));
const Login = page(() => import('./pages/public/Login.jsx'));
const Register = page(() => import('./pages/public/Register.jsx'));
const ForgotPassword = page(() => import('./pages/public/ForgotPassword.jsx'));
const Partner = page(() => import('./pages/public/Partner.jsx'));
const NotFound = page(() => import('./pages/public/NotFound.jsx'));
// Farmer
const FarmerDashboard = page(() => import('./pages/farmer/Dashboard.jsx'));
const FarmerFarm = page(() => import('./pages/farmer/Farm.jsx'));
const FarmerRisk = page(() => import('./pages/farmer/Risk.jsx'));
const FarmerObservations = page(() => import('./pages/farmer/Observations.jsx'));
const FarmerHarvest = page(() => import('./pages/farmer/Harvest.jsx'));
const FarmerHistory = page(() => import('./pages/farmer/History.jsx'));
const FarmerAssistant = page(() => import('./pages/farmer/Assistant.jsx'));
const FarmerRecords = page(() => import('./pages/farmer/RecordBook.jsx'));
// Field operations reused by admin
const CoopDashboard = page(() => import('./pages/cooperative/CoopDashboard.jsx'));
const CoopForecast = page(() => import('./pages/cooperative/Forecast.jsx'));
const CoopAlerts = page(() => import('./pages/cooperative/Alerts.jsx'));
const ExtDashboard = page(() => import('./pages/extension/Dashboard.jsx'));
const ExtRiskMap = page(() => import('./pages/extension/RiskMap.jsx'));
const ExtFarms = page(() => import('./pages/extension/Farms.jsx'));
const ExtReviews = page(() => import('./pages/extension/Reviews.jsx'));
const StaffFarmDetail = page(() => import('./pages/extension/FarmDetail.jsx'));
// Admin
const AdminDashboard = page(() => import('./pages/admin/Dashboard.jsx'));
const AdminUsers = page(() => import('./pages/admin/Users.jsx'));
const AdminActions = page(() => import('./pages/admin/Actions.jsx'));
const AdminModels = page(() => import('./pages/admin/Models.jsx'));
const AdminSettings = page(() => import('./pages/admin/Settings.jsx'));
const AdminAudit = page(() => import('./pages/admin/Audit.jsx'));
const AdminTokens = page(() => import('./pages/admin/AccessTokens.jsx'));
const AdminTma = page(() => import('./pages/admin/TmaBulletin.jsx'));
const Impact = page(() => import('./pages/shared/Impact.jsx'));
// Tools
const WhatIfPlanner = page(() => import('./pages/tools/WhatIf.jsx'));
const AccountSettings = page(() => import('./pages/account/Settings.jsx'));
const Notifications = page(() => import('./pages/account/Notifications.jsx'));

function HomeRedirect() {
  const { status, homePath } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return <Navigate to={status === 'authenticated' ? homePath : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ForgotPassword />} />
          <Route path="/partner" element={<Partner />} />
        </Route>

        <Route path="/app" element={<HomeRedirect />} />

        <Route element={<ProtectedRoute roles={['FARMER']} />}>
          <Route element={<FarmerLayout />}>
            <Route path="/farmer" element={<Navigate to="/farmer/dashboard" replace />} />
            <Route path="/farmer/dashboard" element={<FarmerDashboard />} />
            <Route path="/farmer/farm" element={<FarmerFarm />} />
            <Route path="/farmer/risk" element={<FarmerRisk />} />
            <Route path="/farmer/observations" element={<FarmerObservations />} />
            <Route path="/farmer/harvest" element={<FarmerHarvest />} />
            <Route path="/farmer/history" element={<FarmerHistory />} />
            <Route path="/farmer/records" element={<FarmerRecords />} />
            <Route path="/farmer/assistant" element={<FarmerAssistant />} />
            <Route path="/farmer/alerts" element={<Notifications />} />
            <Route path="/farmer/settings" element={<AccountSettings />} />
          </Route>
        </Route>

        {/* Cooperative staff: scoped to one cooperative's farms, forecasts and alerts. */}
        <Route element={<ProtectedRoute roles={['COOPERATIVE_ADMIN']} />}>
          <Route element={<AppLayout />}>
            <Route path="/cooperative" element={<Navigate to="/cooperative/dashboard" replace />} />
            <Route path="/cooperative/dashboard" element={<CoopDashboard />} />
            <Route path="/cooperative/farms" element={<ExtFarms />} />
            <Route path="/cooperative/farms/:id" element={<StaffFarmDetail />} />
            <Route path="/cooperative/alerts" element={<CoopAlerts />} />
            <Route path="/cooperative/forecast" element={<CoopForecast />} />
            <Route path="/cooperative/impact" element={<Impact />} />
          </Route>
        </Route>

        {/* Extension officer: cross-cooperative view, visit prioritisation, report reviews. */}
        <Route element={<ProtectedRoute roles={['EXTENSION_OFFICER']} />}>
          <Route element={<AppLayout />}>
            <Route path="/extension" element={<Navigate to="/extension/dashboard" replace />} />
            <Route path="/extension/dashboard" element={<ExtDashboard />} />
            <Route path="/extension/farms" element={<ExtFarms />} />
            <Route path="/extension/farms/:id" element={<StaffFarmDetail />} />
            <Route path="/extension/risk-map" element={<ExtRiskMap />} />
            <Route path="/extension/reviews" element={<ExtReviews />} />
            <Route path="/extension/alerts" element={<CoopAlerts />} />
            <Route path="/extension/forecast" element={<CoopForecast />} />
            <Route path="/extension/impact" element={<Impact />} />
          </Route>
        </Route>

        {/* Admin: system-wide control. Shares every operator screen under /admin/* for continuity. */}
        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/field" element={<ExtDashboard />} />
            <Route path="/admin/farms" element={<ExtFarms />} />
            <Route path="/admin/farms/:id" element={<StaffFarmDetail />} />
            <Route path="/admin/risk-map" element={<ExtRiskMap />} />
            <Route path="/admin/reviews" element={<ExtReviews />} />
            <Route path="/admin/alerts" element={<CoopAlerts />} />
            <Route path="/admin/forecast" element={<CoopForecast />} />
            <Route path="/admin/actions" element={<AdminActions />} />
            <Route path="/admin/models" element={<AdminModels />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/tokens" element={<AdminTokens />} />
            <Route path="/admin/tma" element={<AdminTma />} />
            <Route path="/admin/impact" element={<Impact />} />
            <Route path="/tools/scenarios" element={<WhatIfPlanner />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/account/settings" element={<AccountSettings />} />
            <Route path="/account/notifications" element={<Notifications />} />
          </Route>
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
