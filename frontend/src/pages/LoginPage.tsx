import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 380 }}>
        <form onSubmit={submit}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
              RestaurantMS
            </Typography>
            <Typography color="text.secondary">{t('Sign in with your staff account.')}</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t('E-mail')}
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <TextField
              label={t('Password')}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {t('Sign in')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
