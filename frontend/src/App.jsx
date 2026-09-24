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
const DemoHome = page(() => import('./pages/public/DemoHome.jsx'));
const Login = page(() => import('./pages/public/Login.jsx'));
const Register = page(() => import('./pages/public/Register.jsx'));
const NotFound = page(() => import('./pages/public/NotFound.jsx'));
// Farmer
const FarmerDashboard = page(() => import('./pages/farmer/Dashboard.jsx'));
const FarmerFarm = page(() => import('./pages/farmer/Farm.jsx'));
const FarmerRisk = page(() => import('./pages/farmer/Risk.jsx'));
const FarmerObservations = page(() => import('./pages/farmer/Observations.jsx'));
const FarmerHarvest = page(() => import('./pages/farmer/Harvest.jsx'));
const FarmerHistory = page(() => import('./pages/farmer/History.jsx'));
const FarmerAssistant = page(() => import('./pages/farmer/Assistant.jsx'));
// Cooperative
const CoopDashboard = page(() => import('./pages/cooperative/Dashboard.jsx'));
const CoopFarms = page(() => import('./pages/cooperative/Farms.jsx'));
const CoopMap = page(() => import('./pages/cooperative/MapPage.jsx'));
const CoopForecast = page(() => import('./pages/cooperative/Forecast.jsx'));
const CoopAlerts = page(() => import('./pages/cooperative/Alerts.jsx'));
// Extension
const ExtDashboard = page(() => import('./pages/extension/Dashboard.jsx'));
const ExtRiskMap = page(() => import('./pages/extension/RiskMap.jsx'));
const ExtFarms = page(() => import('./pages/extension/Farms.jsx'));
const ExtActions = page(() => import('./pages/extension/Actions.jsx'));
const ExtReviews = page(() => import('./pages/extension/Reviews.jsx'));
const StaffFarmDetail = page(() => import('./pages/extension/FarmDetail.jsx'));
// Buyer
const BuyerDashboard = page(() => import('./pages/buyer/Dashboard.jsx'));
const BuyerForecast = page(() => import('./pages/buyer/Forecast.jsx'));
const BuyerSupply = page(() => import('./pages/buyer/Supply.jsx'));
// Admin
const AdminDashboard = page(() => import('./pages/admin/Dashboard.jsx'));
const AdminUsers = page(() => import('./pages/admin/Users.jsx'));
const AdminActions = page(() => import('./pages/admin/Actions.jsx'));
const AdminModels = page(() => import('./pages/admin/Models.jsx'));
const AdminSettings = page(() => import('./pages/admin/Settings.jsx'));
const AdminAudit = page(() => import('./pages/admin/Audit.jsx'));
// Demo
const DemoSimulation = page(() => import('./pages/demo/Simulation.jsx'));
const AccountSettings = page(() => import('./pages/account/Settings.jsx'));

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
          <Route path="/demo" element={<DemoHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
            <Route path="/farmer/assistant" element={<FarmerAssistant />} />
            <Route path="/farmer/settings" element={<AccountSettings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['COOPERATIVE_ADMIN']} />}>
          <Route element={<AppLayout />}>
            <Route path="/cooperative" element={<Navigate to="/cooperative/dashboard" replace />} />
            <Route path="/cooperative/dashboard" element={<CoopDashboard />} />
            <Route path="/cooperative/farms" element={<CoopFarms />} />
            <Route path="/cooperative/farms/:id" element={<StaffFarmDetail />} />
            <Route path="/cooperative/map" element={<CoopMap />} />
            <Route path="/cooperative/forecast" element={<CoopForecast />} />
            <Route path="/cooperative/alerts" element={<CoopAlerts />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['EXTENSION_OFFICER']} />}>
          <Route element={<AppLayout />}>
            <Route path="/extension" element={<Navigate to="/extension/dashboard" replace />} />
            <Route path="/extension/dashboard" element={<ExtDashboard />} />
            <Route path="/extension/risk-map" element={<ExtRiskMap />} />
            <Route path="/extension/farms" element={<ExtFarms />} />
            <Route path="/extension/farms/:id" element={<StaffFarmDetail />} />
            <Route path="/extension/actions" element={<ExtActions />} />
            <Route path="/extension/reviews" element={<ExtReviews />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['BUYER', 'COOPERATIVE_ADMIN']} />}>
          <Route element={<AppLayout />}>
            <Route path="/buyer" element={<Navigate to="/buyer/dashboard" replace />} />
            <Route path="/buyer/dashboard" element={<BuyerDashboard />} />
            <Route path="/buyer/forecast" element={<BuyerForecast />} />
            <Route path="/buyer/supply" element={<BuyerSupply />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/actions" element={<AdminActions />} />
            <Route path="/admin/models" element={<AdminModels />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/demo/simulation" element={<DemoSimulation />} />
            <Route path="/account/settings" element={<AccountSettings />} />
          </Route>
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
