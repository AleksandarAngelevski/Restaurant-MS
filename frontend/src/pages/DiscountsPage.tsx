import { useState } from 'react';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Switch } from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page, type Row } from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { isoDate, money } from '../format';
import { toOptions } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

export default function DiscountsPage() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);

  const discounts = useQuery({
    queryKey: ['discounts', page],
    queryFn: () => api.get<Page>('/discounts', { page }),
    placeholderData: keepPreviousData,
  });
  const menus = useQuery({ queryKey: ['menus'], queryFn: () => api.get('/menus') });
  const items = useQuery({
    queryKey: ['discounts', viewing?.id, 'items'],
    queryFn: () => api.get(`/discounts/${viewing?.id}/items`),
    enabled: !!viewing,
  });

  return (
    <>
      <PageHeader title={t('Discounts')}>
        <Button variant="contained" onClick={() => setCreating(true)}>
          {t('New discount')}
        </Button>
      </PageHeader>

      <DataTable
        rows={discounts.data?.items}
        rowKey={(row) => row.id}
        page={page}
        hasMore={discounts.data?.hasMore}
        onPage={setPage}
        empty={t('No discounts yet')}
        columns={[
          { key: 'name', label: t('Discount') },
          { key: 'menu', label: t('Menu') },
          { key: 'period', label: t('Period'), render: (row) => `${row.fromDate} – ${row.toDate}` },
          { key: 'items', label: t('Items'), align: 'right' },
          {
            key: 'running',
            label: t('Today'),
            render: (row) =>
              row.running ? <Chip size="small" color="success" label={t('Running')} /> : <Chip size="small" variant="outlined" label={t('Not running')} />,
          },
          {
            key: 'status',
            label: t('Enabled'),
            render: (row) => (
              <Switch
                checked={row.status}
                slotProps={{ input: { 'aria-label': `${t('Enable')} ${row.name}` } }}
                onChange={(e) => run(() => api.put(`/discounts/${row.id}/status`, { status: e.target.checked }))}
              />
            ),
          },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setViewing(row)}>
                  {t('Prices')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Delete discount')} "${row.name}"?`}
                  onConfirm={() => run(() => api.delete(`/discounts/${row.id}`), t('Discount deleted'))}
                >
                  {t('Delete')}
                </ConfirmButton>
              </Stack>
            ),
          },
        ]}
      />

      <FormDialog
        open={creating}
        title={t('New discount')}
        submitLabel={t('Apply discount')}
        initial={{ from: isoDate(), to: isoDate(), percent: 10 }}
        fields={[
          {
            name: 'menuId',
            label: t('Menu'),
            type: 'select',
            required: true,
            options: toOptions(menus.data ?? [], 'id', 'name'),
            helperText: t('Every item on the menu gets the discounted price'),
          },
          { name: 'name', label: t('Name'), required: true },
          { name: 'percent', label: t('Percent off'), type: 'number', step: '0.01', required: true },
          { name: 'from', label: t('From'), type: 'date', required: true },
          { name: 'to', label: t('Until'), type: 'date', required: true },
        ]}
        onClose={() => setCreating(false)}
        onSubmit={async (values) => {
          await api.post('/discounts', values);
          await queryClient.invalidateQueries();
        }}
      />

      <Dialog open={!!viewing} onClose={() => setViewing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{viewing?.name}</DialogTitle>
        <DialogContent>
          <DataTable
            rows={items.data}
            rowKey={(row) => row.id}
            empty={t('The menu had no items when the discount was created')}
            columns={[
              { key: 'product', label: t('Product') },
              { key: 'price', label: t('Price'), align: 'right', render: (row) => money(row.price) },
              { key: 'newPrice', label: t('Discounted'), align: 'right', render: (row) => money(row.newPrice) },
            ]}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>{t('Close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
