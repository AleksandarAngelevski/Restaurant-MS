import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { NotifyProvider } from './hooks/useNotify';
import './i18n';

const theme = createTheme({
  palette: {
    primary: { main: '#1f4e5f' },
    secondary: { main: '#b8572a' },
    background: { default: '#f5f6f7' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* the invoice prints without the app chrome */}
      <GlobalStyles styles={{ '@media print': { '.no-print': { display: 'none !important' }, body: { background: '#fff' } } }} />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <NotifyProvider>
              <App />
            </NotifyProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
