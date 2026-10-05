import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
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
} from '../auth/AuthContext';
import { setLanguage } from '../i18n';

export const NAV: { path: string; label: string; roles: Role[] }[] = [
  { path: '/tables', label: 'Tables', roles: FLOOR_OR_HOST },
  { path: '/orders', label: 'Orders', roles: FLOOR },
  { path: '/kitchen', label: 'Kitchen', roles: KITCHEN },
  { path: '/reservations', label: 'Reservations', roles: RESERVATIONS },
  { path: '/menus', label: 'Menus', roles: MANAGEMENT },
  { path: '/discounts', label: 'Discounts', roles: MANAGEMENT },
  { path: '/products', label: 'Products', roles: MANAGEMENT },
  { path: '/inventory', label: 'Inventory', roles: MANAGEMENT },
  { path: '/analytics', label: 'Analytics', roles: MANAGEMENT },
  { path: '/staff', label: 'Staff', roles: STAFF_OVERVIEW },
  { path: '/settings', label: 'Settings', roles: ADMIN },
];

const DRAWER_WIDTH = 220;

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const lowStock = useQuery({
    queryKey: ['low-stock', 'badge'],
    queryFn: () => api.get<{ items: Row[] }>('/inventory/low-stock'),
    enabled: can(MANAGEMENT),
    refetchInterval: 60_000,
  });
  const lowStockCount = lowStock.data?.items.length ?? 0;

  const nav = (
    <List component="nav" aria-label={t('Main navigation')} sx={{ py: 1 }}>
      {NAV.filter((item) => can(item.roles)).map((item) => (
        <ListItemButton
          key={item.path}
          component={NavLink}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          sx={{ minHeight: 48, '&.active': { bgcolor: 'action.selected', fontWeight: 600 } }}
        >
          <ListItemText primary={t(item.label)} />
          {item.path === '/inventory' && lowStockCount > 0 && (
            <Badge badgeContent={lowStockCount} color="warning" aria-label={t('Low stock products')} sx={{ mr: 1.5 }} />
          )}
        </ListItemButton>
      ))}
    </List>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }} className="no-print">
        <Toolbar sx={{ gap: 1 }}>
          <Button color="inherit" onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' }, minWidth: 0 }}>
            {t('Menu')}
          </Button>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }} noWrap>
            RestaurantMS
          </Typography>
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }} noWrap>
            {user?.name} · {user?.roles.join(', ').toLowerCase()}
          </Typography>
          <Button
            color="inherit"
            size="small"
            onClick={() => setLanguage(i18n.language === 'mk' ? 'en' : 'mk')}
            aria-label={t('Switch language')}
            sx={{ minWidth: 0 }}
          >
            {i18n.language === 'mk' ? 'EN' : 'MK'}
          </Button>
          <Button
            color="inherit"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            {t('Sign out')}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        <Toolbar />
        {nav}
      </Drawer>
      <Drawer
        variant="permanent"
        className="no-print"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        <Toolbar />
        {nav}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar className="no-print" />
        <Outlet />
      </Box>
    </Box>
  );
}
