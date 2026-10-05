import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Chip, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
import { FLOOR, useAuth } from '../auth/AuthContext';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { time } from '../format';
import { toOptions, useLookup } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

export default function TablesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const takesOrders = can(FLOOR);
  const [otherOrder, setOtherOrder] = useState(false);

  const tables = useQuery({ queryKey: ['tables'], queryFn: () => api.get('/tables'), refetchInterval: 10_000 });
  const reservations = useQuery({ queryKey: ['reservations', 'today'], queryFn: () => api.get('/reservations/today') });
  const orderTypes = useLookup('order-types', takesOrders);
  const dineIn = orderTypes.find((type) => type.label === 'Dine-in') ?? orderTypes[0];

  const createOrder = async (orderTypeId: number, tableNumber: number | null) => {
    let created: Row | undefined;
    const ok = await run(async () => {
      created = await api.post<Row>('/orders', { orderTypeId, tableNumber });
    });
    if (ok && created) navigate(`/orders/${created.order.orderId}`);
  };

  const openTable = (table: Row) => {
    if (!takesOrders) return;
    if (table.openOrderId) navigate(`/orders/${table.openOrderId}`);
    else if (table.available && dineIn) void createOrder(dineIn.id, table.tableNumber);
  };

  return (
    <>
      <PageHeader title={t('Tables')}>
        {takesOrders && (
          <Button variant="contained" onClick={() => setOtherOrder(true)}>
            {t('Order without a table')}
          </Button>
        )}
      </PageHeader>

      {takesOrders && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('Tap a free table to start an order, or an occupied one to open its order.')}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {(tables.data ?? []).map((table) => (
          <ButtonBase
            key={table.tableNumber}
            onClick={() => openTable(table)}
            disabled={!takesOrders}
            aria-label={`${t('Table')} ${table.tableNumber}, ${table.available ? t('Free') : t('Occupied')}`}
            sx={{ borderRadius: 2, textAlign: 'left', display: 'block' }}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 112,
                borderWidth: 2,
                borderColor: table.available ? 'success.main' : 'secondary.main',
                bgcolor: table.available ? 'background.paper' : '#fbeee6',
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {table.tableNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {table.tableType} · {table.capacity} {t('seats')}
              </Typography>
              <Chip
                size="small"
                label={table.available ? t('Free') : t('Occupied')}
                color={table.available ? 'success' : 'secondary'}
                variant={table.available ? 'outlined' : 'filled'}
                sx={{ mt: 1 }}
              />
            </Paper>
          </ButtonBase>
        ))}
      </Box>

      <Stack spacing={1} sx={{ mt: 4 }}>
        <Typography variant="h6">{t("Today's reservations")}</Typography>
        <DataTable
          rows={reservations.data}
          rowKey={(row) => row.id}
          empty={t('No reservations today')}
          columns={[
            { key: 'time', label: t('Time'), render: (row) => `${time(row.startTime)} – ${time(row.endTime)}` },
            { key: 'tableNumber', label: t('Table') },
            { key: 'guestName', label: t('Guest') },
            { key: 'guestPhone', label: t('Phone') },
            { key: 'handledBy', label: t('Handled by') },
          ]}
        />
      </Stack>

      <FormDialog
        open={otherOrder}
        title={t('Order without a table')}
        submitLabel={t('Start order')}
        fields={[
          {
            name: 'orderTypeId',
            label: t('Order type'),
            type: 'select',
            required: true,
            options: toOptions(orderTypes.filter((type) => type.id !== dineIn?.id)),
          },
        ]}
        onClose={() => setOtherOrder(false)}
        onSubmit={async (values) => {
          const created = await api.post<Row>('/orders', { orderTypeId: values.orderTypeId, tableNumber: null });
          navigate(`/orders/${created.order.orderId}`);
        }}
      />
    </>
  );
}
