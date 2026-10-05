import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, FormControlLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page } from '../api/client';
import { MANAGEMENT, useAuth } from '../auth/AuthContext';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { dateTime, money } from '../format';

export const statusColor = (status: string) =>
  ({ Pending: 'default', 'In Progress': 'info', Ready: 'success', Served: 'primary', Completed: 'default', Cancelled: 'error' })[
    status
  ] as 'default' | 'info' | 'success' | 'primary' | 'error';

export default function OrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const seesAll = can(MANAGEMENT);
  const [state, setState] = useState('open');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);

  const orders = useQuery({
    queryKey: ['orders', state, mine, page],
    queryFn: () => api.get<Page>('/orders', { state, mine, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader title={seesAll ? t('Orders') : t('My orders')}>
        {seesAll && (
          <FormControlLabel
            control={
              <Switch
                checked={mine}
                onChange={(e) => {
                  setMine(e.target.checked);
                  setPage(0);
                }}
              />
            }
            label={t('Only mine')}
          />
        )}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={state}
          onChange={(_, value) => {
            if (value) {
              setState(value);
              setPage(0);
            }
          }}
        >
          <ToggleButton value="open">{t('Open')}</ToggleButton>
          <ToggleButton value="closed">{t('Closed')}</ToggleButton>
          <ToggleButton value="all">{t('All')}</ToggleButton>
        </ToggleButtonGroup>
      </PageHeader>

      <DataTable
        rows={orders.data?.items}
        rowKey={(row) => row.orderId}
        onRowClick={(row) => navigate(`/orders/${row.orderId}`)}
        page={page}
        hasMore={orders.data?.hasMore}
        onPage={setPage}
        empty={t('No orders')}
        columns={[
          { key: 'orderId', label: '#' },
          { key: 'tableNumber', label: t('Table'), render: (row) => row.tableNumber ?? '—' },
          { key: 'orderType', label: t('Type') },
          {
            key: 'status',
            label: t('Status'),
            render: (row) => <Chip size="small" label={row.status} color={statusColor(row.status)} />,
          },
          { key: 'waiter', label: t('Waiter') },
          { key: 'dateCreated', label: t('Created'), render: (row) => dateTime(row.dateCreated) },
          { key: 'total', label: t('Total'), align: 'right', render: (row) => money(row.total) },
        ]}
      />
    </>
  );
}
