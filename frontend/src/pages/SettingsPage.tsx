import { useState } from 'react';
import { Button, Chip, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import DataTable, { type Column } from '../components/DataTable';
import FormDialog, { type Field } from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { toOptions, useLookup } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('tables');
  return (
    <>
      <PageHeader title={t('Settings')} />
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="tables" label={t('Restaurant tables')} />
        <Tab value="lookups" label={t('Lookup tables')} />
      </Tabs>
      {tab === 'tables' ? <RestaurantTables /> : <Lookups />}
    </>
  );
}

function RestaurantTables() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const tables = useQuery({ queryKey: ['tables'], queryFn: () => api.get('/tables') });
  const tableTypes = useLookup('table-types');
  const editing = form !== 'new' && form ? form : null;

  return (
    <>
      <Button variant="contained" onClick={() => setForm('new')} sx={{ mb: 2 }}>
        {t('New table')}
      </Button>
      <DataTable
        rows={tables.data}
        rowKey={(row) => row.tableNumber}
        columns={[
          { key: 'tableNumber', label: t('Table') },
          { key: 'capacity', label: t('Seats'), align: 'right' },
          { key: 'tableType', label: t('Type') },
          {
            key: 'available',
            label: t('Status'),
            render: (row) => <Chip size="small" variant="outlined" label={row.available ? t('Free') : t('Occupied')} />,
          },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setForm(row)}>
                  {t('Edit')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Delete table')} ${row.tableNumber}?`}
                  message={t('Past orders and reservations keep their data but lose the table number.')}
                  onConfirm={() => run(() => api.delete(`/tables/${row.tableNumber}`), t('Table deleted'))}
                >
                  {t('Delete')}
                </ConfirmButton>
              </Stack>
            ),
          },
        ]}
      />
      <FormDialog
        open={!!form}
        title={editing ? `${t('Edit table')} ${editing.tableNumber}` : t('New table')}
        initial={editing ?? { capacity: 2 }}
        fields={[
          { name: 'capacity', label: t('Seats'), type: 'number', required: true },
          { name: 'tableTypeId', label: t('Type'), type: 'select', required: true, options: toOptions(tableTypes) },
        ]}
        onClose={() => setForm(null)}
        onSubmit={async (values) => {
          const body = { capacity: values.capacity, tableTypeId: values.tableTypeId };
          if (editing) await api.put(`/tables/${editing.tableNumber}`, body);
          else await api.post('/tables', body);
          await queryClient.invalidateQueries();
        }}
      />
    </>
  );
}

// Mirrors the whitelist in LookupController.
const LOOKUPS: { name: string; label: string; extras?: { field: Field; column: Column }[] }[] = [
  { name: 'table-types', label: 'Table types' },
  { name: 'order-types', label: 'Order types' },
  { name: 'order-statuses', label: 'Order statuses' },
  { name: 'menu-types', label: 'Menu types' },
  { name: 'menu-member-types', label: 'Menu item kinds' },
  { name: 'product-types', label: 'Product types' },
  {
    name: 'employee-types',
    label: 'Employee roles',
    extras: [
      {
        field: { name: 'permissions', label: 'Permission level', type: 'number' },
        column: { key: 'permissions', label: 'Permission level', align: 'right' },
      },
    ],
  },
  { name: 'unit-types', label: 'Unit types' },
  {
    name: 'units',
    label: 'Units',
    extras: [
      {
        field: { name: 'conversionToBase', label: 'Conversion to base unit', type: 'number', required: true },
        column: { key: 'conversionToBase', label: 'Conversion to base', align: 'right' },
      },
      { field: { name: 'typeid', label: 'Unit type', type: 'select', required: true }, column: { key: 'typeid', label: 'Unit type' } },
    ],
  },
  {
    name: 'change-types',
    label: 'Stock movement types',
    extras: [
      {
        field: { name: 'sign', label: 'Increases stock', type: 'checkbox' },
        column: { key: 'sign', label: 'Effect', render: (row) => (row.sign ? 'increase' : 'decrease') },
      },
    ],
  },
  { name: 'locations', label: 'Locations' },
];

function Lookups() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [name, setName] = useState(LOOKUPS[0].name);
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const lookup = LOOKUPS.find((entry) => entry.name === name) ?? LOOKUPS[0];
  const rows = useLookup(name);
  const unitTypes = useLookup('unit-types', name === 'units');
  const editing = form !== 'new' && form ? form : null;

  const extraFields = (lookup.extras ?? []).map(({ field }) =>
    field.name === 'typeid' ? { ...field, label: t(field.label), options: toOptions(unitTypes) } : { ...field, label: t(field.label) },
  );
  const extraColumns = (lookup.extras ?? []).map(({ column }) =>
    column.key === 'typeid'
      ? { ...column, label: t(column.label), render: (row: Row) => unitTypes.find((type) => type.id === row.typeid)?.label ?? row.typeid }
      : { ...column, label: t(column.label) },
  );

  return (
    <>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('Adapt the vocabulary of the system to your restaurant. Values that are in use cannot be deleted.')}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <TextField select size="small" label={t('Lookup table')} value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 240 }}>
          {LOOKUPS.map((entry) => (
            <MenuItem key={entry.name} value={entry.name}>
              {t(entry.label)}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => setForm('new')}>
          {t('Add value')}
        </Button>
      </Stack>
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          { key: 'id', label: 'Id' },
          { key: 'label', label: t('Value') },
          ...extraColumns,
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setForm(row)}>
                  {t('Edit')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Delete')} "${row.label}"?`}
                  onConfirm={() => run(() => api.delete(`/lookups/${name}/${row.id}`), t('Value deleted'))}
                >
                  {t('Delete')}
                </ConfirmButton>
              </Stack>
            ),
          },
        ]}
      />
      <FormDialog
        open={!!form}
        title={editing ? `${t('Edit')} "${editing.label}"` : `${t('Add to')} ${t(lookup.label)}`}
        initial={editing ?? {}}
        fields={[{ name: 'label', label: t('Value'), required: true }, ...extraFields]}
        onClose={() => setForm(null)}
        onSubmit={async (values) => {
          // an unchecked checkbox must still be sent (ChangeType.Sign has no default)
          const body: Row = { ...values };
          extraFields.filter((field) => field.type === 'checkbox').forEach((field) => (body[field.name] = !!values[field.name]));
          if (editing) await api.put(`/lookups/${name}/${editing.id}`, body);
          else await api.post(`/lookups/${name}`, body);
          await queryClient.invalidateQueries();
        }}
      />
    </>
  );
}
