import { useState } from 'react';
import { Box, Button, Chip, MenuItem, Stack, Tab, Tabs, TextField } from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page, type Row } from '../api/client';
import { ADMIN, useAuth } from '../auth/AuthContext';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { dateTime, number } from '../format';
import { useLookup } from '../hooks/useLookup';

export default function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('stock');
  return (
    <>
      <PageHeader title={t('Inventory')} />
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab value="stock" label={t('Stock')} />
        <Tab value="low" label={t('Low stock')} />
        <Tab value="history" label={t('Movements')} />
      </Tabs>
      {tab === 'stock' && <Stock />}
      {tab === 'low' && <LowStock />}
      {tab === 'history' && <History />}
    </>
  );
}

function Stock() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can(ADMIN);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<{ kind: 'restock' | 'adjust'; product: Row } | null>(null);

  const stock = useQuery({
    queryKey: ['inventory', search, page],
    queryFn: () => api.get<Page>('/inventory', { search, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <TextField
        size="small"
        label={t('Search')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        sx={{ mb: 2 }}
      />
      <DataTable
        rows={stock.data?.items}
        rowKey={(row) => row.productId}
        page={page}
        hasMore={stock.data?.hasMore}
        onPage={setPage}
        columns={[
          { key: 'product', label: t('Product') },
          { key: 'productType', label: t('Type') },
          {
            key: 'quantity',
            label: t('In stock'),
            align: 'right',
            render: (row) => (row.stocked ? `${number(row.quantity)} ${row.baseUnit}` : t('not stocked')),
          },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  label: '',
                  align: 'right' as const,
                  render: (row: Row) => (
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      <Button size="small" variant="outlined" onClick={() => setAction({ kind: 'restock', product: row })}>
                        {t('Restock')}
                      </Button>
                      <Button size="small" onClick={() => setAction({ kind: 'adjust', product: row })}>
                        {t('Adjust')}
                      </Button>
                    </Stack>
                  ),
                },
              ]
            : []),
        ]}
      />

      <FormDialog
        open={!!action}
        title={`${action?.kind === 'restock' ? t('Restock') : t('Adjust stock of')} ${action?.product.product ?? ''}`}
        initial={action?.kind === 'adjust' ? { quantity: action.product.quantity } : {}}
        fields={[
          {
            name: 'quantity',
            label:
              action?.kind === 'restock'
                ? `${t('Quantity received')} (${action.product.baseUnit})`
                : `${t('Counted quantity')} (${action?.product.baseUnit ?? ''})`,
            type: 'number',
            required: true,
            helperText:
              action?.kind === 'restock'
                ? t('Added to the current stock and logged as a purchase')
                : t('Replaces the current stock and is logged as a manual adjustment'),
          },
        ]}
        onClose={() => setAction(null)}
        onSubmit={async (values) => {
          await api.post(`/inventory/${action?.product.productId}/${action?.kind}`, { quantity: values.quantity });
          await queryClient.invalidateQueries();
        }}
      />
    </>
  );
}

function LowStock() {
  const { t } = useTranslation();
  const [threshold, setThreshold] = useState('');
  const report = useQuery({
    queryKey: ['low-stock', threshold],
    queryFn: () => api.get<{ threshold: number; items: Row[] }>('/inventory/low-stock', { threshold }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <TextField
        size="small"
        type="number"
        label={t('Threshold (base units)')}
        value={threshold}
        placeholder={report.data ? String(report.data.threshold) : ''}
        onChange={(e) => setThreshold(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ mb: 2, width: 220 }}
      />
      <DataTable
        rows={report.data?.items}
        rowKey={(row) => row.product}
        empty={t('Everything is above the threshold')}
        columns={[
          { key: 'product', label: t('Product') },
          { key: 'productType', label: t('Type') },
          {
            key: 'quantity',
            label: t('In stock'),
            align: 'right',
            render: (row) => `${number(row.quantity)} ${row.baseUnit}`,
          },
        ]}
      />
    </>
  );
}

function History() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ productId: '', changeTypeId: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const changeTypes = useLookup('change-types');
  const products = useQuery({ queryKey: ['inventory', 'all'], queryFn: () => api.get<Page>('/inventory', { size: 200 }) });
  const history = useQuery({
    queryKey: ['inventory', 'history', filters, page],
    queryFn: () => api.get<Page>('/inventory/history', { ...filters, page }),
    placeholderData: keepPreviousData,
  });

  const update = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setPage(0);
  };

  return (
    <>
      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label={t('Product')}
          value={filters.productId}
          onChange={(e) => update({ productId: e.target.value })}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t('All products')}</MenuItem>
          {(products.data?.items ?? []).map((product) => (
            <MenuItem key={product.productId} value={product.productId}>
              {product.product}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t('Movement type')}
          value={filters.changeTypeId}
          onChange={(e) => update({ changeTypeId: e.target.value })}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t('All types')}</MenuItem>
          {changeTypes.map((type) => (
            <MenuItem key={type.id} value={type.id}>
              {type.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={t('From')}
          value={filters.from}
          onChange={(e) => update({ from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t('Until')}
          value={filters.to}
          onChange={(e) => update({ to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <DataTable
        rows={history.data?.items}
        rowKey={(row) => row.logId}
        page={page}
        hasMore={history.data?.hasMore}
        onPage={setPage}
        empty={t('No stock movements match the filters')}
        columns={[
          { key: 'loggedAt', label: t('When'), render: (row) => dateTime(row.loggedAt) },
          { key: 'product', label: t('Product') },
          {
            key: 'changeType',
            label: t('Movement'),
            render: (row) => <Chip size="small" variant="outlined" label={row.changeType} />,
          },
          {
            key: 'changeAmount',
            label: t('Change'),
            align: 'right',
            render: (row) => (
              <Box component="span" sx={{ color: row.positive ? 'success.dark' : 'error.dark', fontWeight: 600 }}>
                {row.positive ? '+' : '−'}
                {number(row.changeAmount)} {row.unit}
              </Box>
            ),
          },
        ]}
      />
    </>
  );
}
