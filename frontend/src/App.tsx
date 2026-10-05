import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  ADMIN,
  FLOOR,
  FLOOR_OR_HOST,
  KITCHEN,
  MANAGEMENT,
  RESERVATIONS,
  STAFF_OVERVIEW,
  useAuth,
  type Role,
} from './auth/AuthContext';
import Layout, { NAV } from './components/Layout';
import AnalyticsPage from './pages/AnalyticsPage';
import DiscountsPage from './pages/DiscountsPage';
import InventoryPage from './pages/InventoryPage';
import KitchenPage from './pages/KitchenPage';
import LoginPage from './pages/LoginPage';
import MenusPage from './pages/MenusPage';
import OrderPage from './pages/OrderPage';
import OrdersPage from './pages/OrdersPage';
import ProductsPage from './pages/ProductsPage';
import ReservationsPage from './pages/ReservationsPage';
import SettingsPage from './pages/SettingsPage';
import StaffPage from './pages/StaffPage';
import TablesPage from './pages/TablesPage';

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  return can(roles) ? <>{children}</> : <Alert severity="warning">{t('Your role does not have access to this screen.')}</Alert>;
}

/** Sends each role to its own first screen (kitchen staff to the queue, hosts to tables...). */
function Home() {
  const { can } = useAuth();
  const first = NAV.find((item) => can(item.roles));
  return first ? <Navigate to={first.path} replace /> : <Alert severity="info">No screens are assigned to your role.</Alert>;
}

export default function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/tables" element={<Guard roles={FLOOR_OR_HOST}><TablesPage /></Guard>} />
        <Route path="/orders" element={<Guard roles={FLOOR}><OrdersPage /></Guard>} />
        <Route path="/orders/:id" element={<Guard roles={FLOOR}><OrderPage /></Guard>} />
        <Route path="/kitchen" element={<Guard roles={KITCHEN}><KitchenPage /></Guard>} />
        <Route path="/reservations" element={<Guard roles={RESERVATIONS}><ReservationsPage /></Guard>} />
        <Route path="/menus" element={<Guard roles={MANAGEMENT}><MenusPage /></Guard>} />
        <Route path="/discounts" element={<Guard roles={MANAGEMENT}><DiscountsPage /></Guard>} />
        <Route path="/products" element={<Guard roles={MANAGEMENT}><ProductsPage /></Guard>} />
        <Route path="/inventory" element={<Guard roles={MANAGEMENT}><InventoryPage /></Guard>} />
        <Route path="/analytics" element={<Guard roles={MANAGEMENT}><AnalyticsPage /></Guard>} />
        <Route path="/staff" element={<Guard roles={STAFF_OVERVIEW}><StaffPage /></Guard>} />
        <Route path="/settings" element={<Guard roles={ADMIN}><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
