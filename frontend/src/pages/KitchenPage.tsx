import { useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
import PageHeader from '../components/PageHeader';
import { minutesSince } from '../format';
import { useAction } from '../hooks/useNotify';

export default function KitchenPage() {
  const { t } = useTranslation();
  const run = useAction();
  const [warnings, setWarnings] = useState<string[]>([]);

  const queue = useQuery({ queryKey: ['kitchen', 'queue'], queryFn: () => api.get('/kitchen/queue'), refetchInterval: 5_000 });

  // the API returns items oldest order first; group them into one ticket per order
  const tickets = useMemo(() => {
    const byOrder = new Map<number, Row[]>();
    (queue.data ?? []).forEach((item) => byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]));
    return [...byOrder.values()];
  }, [queue.data]);

  const finish = (item: Row) =>
    run(async () => {
      const result = await api.post<{ warnings: string[] }>(`/kitchen/items/${item.itemId}/finish`);
      if (result.warnings.length) setWarnings((current) => [...result.warnings, ...current].slice(0, 8));
    });

  return (
    <>
      <PageHeader title={t('Kitchen')}>
        <Typography color="text.secondary">
          {tickets.length} {t('open tickets')}
        </Typography>
      </PageHeader>

      {warnings.length > 0 && (
        <Alert severity="warning" onClose={() => setWarnings([])} sx={{ mb: 2 }}>
          <strong>{t('Stock warnings')}</strong>
          {warnings.map((warning, index) => (
            <div key={index}>{warning}</div>
          ))}
        </Alert>
      )}

      {queue.data && tickets.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('Nothing to prepare right now.')}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', alignItems: 'start' }}>
        {tickets.map((items) => {
          const first = items[0];
          return (
            <Paper key={first.orderId} variant="outlined" data-testid={`ticket-${first.orderId}`}>
              <Stack direction="row" sx={{ p: 2, justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="h6">
                  #{first.orderId} · {first.tableNumber ? `${t('Table')} ${first.tableNumber}` : first.orderType}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {minutesSince(first.dateCreated)} min
                </Typography>
              </Stack>
              <Divider />
              {items.map((item) => (
                <Stack
                  key={item.itemId}
                  direction="row"
                  spacing={1}
                  sx={{ px: 2, py: 1, alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography sx={{ fontSize: 18 }}>
                    <strong>{item.quantity} ×</strong> {item.product}
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    aria-label={`${t('Done')}: ${item.quantity} × ${item.product}`}
                    onClick={() => finish(item)}
                    sx={{ minWidth: 88, minHeight: 48 }}
                  >
                    {t('Done')}
                  </Button>
                </Stack>
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>
                {first.waiter}
              </Typography>
            </Paper>
          );
        })}
      </Box>
    </>
  );
}
