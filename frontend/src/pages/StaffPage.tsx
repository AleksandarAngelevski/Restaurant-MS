import { useState } from 'react';
import { Button, Chip, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page, type Row } from '../api/client';
import { ADMIN, useAuth } from '../auth/AuthContext';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { isoDate } from '../format';
import { toOptions, useLookup } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

/** Admins manage employees; supervisors get the read-only active staff overview. */
export default function StaffPage() {
  const { can } = useAuth();
  return can(ADMIN) ? <Employees /> : <ActiveStaff />;
}

function ActiveStaff() {
  const { t } = useTranslation();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get('/staff') });
  return (
    <>
      <PageHeader title={t('Staff')} />
      <DataTable
        rows={staff.data}
        rowKey={(row) => `${row.id}-${row.role}`}
        columns={[
          { key: 'fullName', label: t('Name') },
          { key: 'role', label: t('Role') },
          { key: 'email', label: t('E-mail') },
          { key: 'dateEmployment', label: t('Employed since') },
        ]}
      />
    </>
  );
}

function Employees() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const roles = useLookup('employee-types');

  const employees = useQuery({
    queryKey: ['employees', search, activeOnly, page],
    queryFn: () => api.get<Page>('/employees', { search, activeOnly, page }),
    placeholderData: keepPreviousData,
  });

  const editing = form !== 'new' && form ? form : null;

  return (
    <>
      <PageHeader title={t('Staff')}>
        <FormControlLabel
          control={
            <Switch
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPage(0);
              }}
            />
          }
          label={t('Active only')}
        />
        <TextField
          size="small"
          label={t('Search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <Button variant="contained" onClick={() => setForm('new')}>
          {t('New employee')}
        </Button>
      </PageHeader>

      <DataTable
        rows={employees.data?.items}
        rowKey={(row) => row.id}
        page={page}
        hasMore={employees.data?.hasMore}
        onPage={setPage}
        columns={[
          { key: 'name', label: t('Name'), render: (row) => `${row.firstName} ${row.lastName}` },
          { key: 'roles', label: t('Roles') },
          { key: 'email', label: t('E-mail') },
          { key: 'dateEmployment', label: t('Employed since') },
          {
            key: 'active',
            label: t('Status'),
            render: (row) =>
              row.active ? (
                <Chip size="small" color="success" label={row.dateResignation ? `${t('Leaving')} ${row.dateResignation}` : t('Active')} />
              ) : (
                <Chip size="small" variant="outlined" label={`${t('Resigned')} ${row.dateResignation}`} />
              ),
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
                  title={`${t('Delete')} ${row.firstName} ${row.lastName}?`}
                  message={t('Their past orders and reservations stay but lose the link to them. Setting a resignation date is usually the better choice.')}
                  onConfirm={() => run(() => api.delete(`/employees/${row.id}`), t('Employee deleted'))}
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
        title={editing ? t('Edit employee') : t('New employee')}
        initial={
          editing
            ? {
                ...editing,
                dateResignation: editing.dateResignation ?? '',
                password: '',
                roleIds: editing.roleIds ? String(editing.roleIds).split(',').map(Number) : [],
              }
            : { sex: 'O', dateEmployment: isoDate(), roleIds: [] }
        }
        fields={[
          { name: 'firstName', label: t('First name'), required: true },
          { name: 'lastName', label: t('Last name'), required: true },
          { name: 'ssn', label: t('SSN (up to 13 characters)'), required: true },
          {
            name: 'sex',
            label: t('Sex'),
            type: 'select',
            required: true,
            options: [
              { value: 'F', label: t('Female') },
              { value: 'M', label: t('Male') },
              { value: 'O', label: t('Other') },
            ],
          },
          { name: 'email', label: t('E-mail'), required: true },
          {
            name: 'password',
            label: t('Password'),
            type: 'password',
            required: !editing,
            helperText: editing ? t('Leave empty to keep the current password') : t('At least 6 characters'),
          },
          { name: 'roleIds', label: t('Roles'), type: 'multiselect', options: toOptions(roles) },
          { name: 'dateEmployment', label: t('Employed since'), type: 'date', required: true },
          {
            name: 'dateResignation',
            label: t('Resignation date'),
            type: 'date',
            helperText: t('From this date on the employee cannot sign in or create orders'),
          },
        ]}
        onClose={() => setForm(null)}
        onSubmit={async (values) => {
          const body = {
            firstName: values.firstName,
            lastName: values.lastName,
            ssn: values.ssn,
            sex: values.sex,
            email: values.email,
            password: values.password || null,
            dateEmployment: values.dateEmployment,
            dateResignation: values.dateResignation || null,
            roleIds: values.roleIds ?? [],
          };
          if (editing) await api.put(`/employees/${editing.id}`, body);
          else await api.post('/employees', body);
          await queryClient.invalidateQueries();
        }}
      />
    </>
  );
}
