import { useState, type ReactNode } from 'react';
import { Box, Button, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Page, type Row } from '../api/client';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { dateTime, daysAgo, isoDate, money, number } from '../format';
import { useAction } from '../hooks/useNotify';

const COLOR = '#1f4e5f';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

function Bars({ data, x, y }: { data: Row[]; x: string; y: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={x} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={56} />
        <Tooltip />
        <Bar dataKey={y} fill={COLOR} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const run = useAction();
  const [range, setRange] = useState({ from: daysAgo(29), to: isoDate() });
  const [bucket, setBucket] = useState('day');
  const [page, setPage] = useState(0);

  const dashboard = useQuery({
    queryKey: ['analytics', range, bucket],
    queryFn: () => api.get<Row>('/analytics/dashboard', { ...range, bucket }),
    placeholderData: keepPreviousData,
  });
  const waiters = useQuery({ queryKey: ['analytics', 'waiters'], queryFn: () => api.get('/analytics/revenue-per-waiter') });
  const invoices = useQuery({
    queryKey: ['analytics', 'invoices', page],
    queryFn: () => api.get<Page>('/analytics/invoices', { page, size: 10 }),
    placeholderData: keepPreviousData,
  });
  const d = dashboard.data;
  const shrink = { inputLabel: { shrink: true } };

  return (
    <>
      <PageHeader title={t('Analytics')}>
        <TextField size="small" type="date" label={t('From')} value={range.from} slotProps={shrink}
          onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <TextField size="small" type="date" label={t('Until')} value={range.to} slotProps={shrink}
          onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <ToggleButtonGroup exclusive size="small" value={bucket} onChange={(_, value) => value && setBucket(value)}>
          <ToggleButton value="day">{t('Daily')}</ToggleButton>
          <ToggleButton value="week">{t('Weekly')}</ToggleButton>
        </ToggleButtonGroup>
        <Button onClick={() => run(() => api.post('/analytics/refresh'), t('Figures refreshed'))}>{t('Refresh')}</Button>
      </PageHeader>

      {d && (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {[
              [t('Revenue'), money(d.summary.revenue)],
              [t('Invoices'), number(d.summary.invoices)],
              [t('Average order'), money(d.summary.avgOrderValue)],
              [t('VAT'), money(d.summary.tax)],
            ].map(([label, value]) => (
              <Paper key={label} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="h6">{value}</Typography>
              </Paper>
            ))}
          </Box>

          <Card title={t('Revenue over time (MKD)')}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={d.sales}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={56} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke={COLOR} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
            <Card title={t('Top-selling items (quantity)')}><Bars data={d.topItems} x="product" y="quantity" /></Card>
            <Card title={t('Revenue by order type (MKD)')}><Bars data={d.byOrderType} x="orderType" y="revenue" /></Card>
            <Card title={t('Orders by hour of day')}><Bars data={d.busiestHours} x="hour" y="orders" /></Card>
            <Card title={t('Busiest tables (orders)')}><Bars data={d.busiestTables} x="tableNumber" y="orders" /></Card>
            <Card title={`${t('Daily consumption')}: ${d.stockProduct ?? '—'}`}>
              <Bars data={d.stockUsageDaily} x="day" y="consumed" />
            </Card>
            <Card title={t('Most consumed products')}>
              <DataTable
                rows={d.stockUsage}
                rowKey={(row) => row.product}
                columns={[
                  { key: 'product', label: t('Product') },
                  { key: 'amount', label: t('Consumed'), align: 'right', render: (row) => `${number(row.amount)} ${row.unit}` },
                ]}
              />
            </Card>
          </Box>
        </Stack>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>{t('Revenue per waiter (all time)')}</Typography>
      <DataTable
        rows={waiters.data}
        rowKey={(row) => row.waiter}
        columns={[
          { key: 'waiter', label: t('Waiter') },
          { key: 'totalOrders', label: t('Orders'), align: 'right' },
          { key: 'totalRevenue', label: t('Revenue'), align: 'right', render: (row) => money(row.totalRevenue) },
          { key: 'avgOrderValue', label: t('Average order'), align: 'right', render: (row) => money(row.avgOrderValue) },
        ]}
      />

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>{t('Invoices')}</Typography>
      <DataTable
        rows={invoices.data?.items}
        rowKey={(row) => row.invoiceId}
        page={page}
        hasMore={invoices.data?.hasMore}
        onPage={setPage}
        columns={[
          { key: 'invoiceId', label: '#' },
          { key: 'invoiceDate', label: t('Date'), render: (row) => dateTime(row.invoiceDate) },
          { key: 'waiter', label: t('Waiter') },
          { key: 'netAmount', label: t('Net'), align: 'right', render: (row) => money(row.netAmount) },
          { key: 'taxAmount', label: t('VAT'), align: 'right', render: (row) => money(row.taxAmount) },
          { key: 'totalAmount', label: t('Total'), align: 'right', render: (row) => money(row.totalAmount) },
        ]}
      />
    </>
  );
}
