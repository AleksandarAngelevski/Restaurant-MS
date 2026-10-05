import { useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page, type Row } from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { isoDate, time } from '../format';
import { useAction, useNotify } from '../hooks/useNotify';

const shrink = { inputLabel: { shrink: true } };

export default function ReservationsPage() {
  const { t } = useTranslation();
  const run = useAction();
  const notify = useNotify();
  const queryClient = useQueryClient();

  // day view
  const [day, setDay] = useState(isoDate());
  const [editing, setEditing] = useState<Row | null>(null);
  const reservations = useQuery({
    queryKey: ['reservations', day],
    queryFn: () => api.get<Page>('/reservations', { date: day }),
  });
  const tables = useQuery({ queryKey: ['tables'], queryFn: () => api.get('/tables') });

  // new booking: search availability first, then pick one of the free tables
  const [search, setSearch] = useState({ date: isoDate(), start: '19:00', end: '21:00', guests: 2 });
  const [searched, setSearched] = useState<typeof search | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [guest, setGuest] = useState({ name: '', phone: '' });
  const available = useQuery({
    queryKey: ['availability', searched],
    queryFn: () => api.get('/reservations/availability', searched ?? undefined),
    enabled: !!searched,
  });

  const book = async () => {
    if (!searched || tableNumber === null) return;
    const ok = await run(
      () =>
        api.post('/reservations', {
          guestName: guest.name,
          guestPhone: guest.phone,
          date: searched.date,
          startTime: searched.start,
          endTime: searched.end,
          tableNumber,
        }),
      t('Reservation created'),
    );
    if (ok) {
      setDay(searched.date);
      setTableNumber(null);
      setGuest({ name: '', phone: '' });
    }
  };

  return (
    <>
      <PageHeader title={t('Reservations')} />

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('New reservation')}
        </Typography>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label={t('Date')}
            type="date"
            size="small"
            value={search.date}
            onChange={(e) => setSearch({ ...search, date: e.target.value })}
            slotProps={shrink}
          />
          <TextField
            label={t('From')}
            type="time"
            size="small"
            value={search.start}
            onChange={(e) => setSearch({ ...search, start: e.target.value })}
            slotProps={shrink}
          />
          <TextField
            label={t('Until')}
            type="time"
            size="small"
            value={search.end}
            onChange={(e) => setSearch({ ...search, end: e.target.value })}
            slotProps={shrink}
          />
          <TextField
            label={t('Guests')}
            type="number"
            size="small"
            value={search.guests}
            onChange={(e) => setSearch({ ...search, guests: Math.max(1, Number(e.target.value)) })}
            sx={{ width: 100 }}
          />
          <Button
            variant="outlined"
            onClick={() => {
              setTableNumber(null);
              setSearched({ ...search });
            }}
          >
            {t('Find free tables')}
          </Button>
        </Stack>

        {available.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {available.error.message}
          </Alert>
        )}
        {searched && available.data && (
          <Box sx={{ mt: 2 }}>
            {available.data.length === 0 ? (
              <Alert severity="info">{t('No table is free for that time and party size.')}</Alert>
            ) : (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} aria-label={t('Free tables')}>
                  {available.data.map((table) => (
                    <Chip
                      key={table.tableNumber}
                      label={`${t('Table')} ${table.tableNumber} · ${table.capacity} ${t('seats')} · ${table.tableType}`}
                      color={tableNumber === table.tableNumber ? 'primary' : 'default'}
                      variant={tableNumber === table.tableNumber ? 'filled' : 'outlined'}
                      onClick={() => setTableNumber(table.tableNumber)}
                      sx={{ height: 40 }}
                    />
                  ))}
                </Stack>
                {tableNumber !== null && (
                  <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField
                      label={t('Guest name')}
                      size="small"
                      value={guest.name}
                      onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                    />
                    <TextField
                      label={t('Phone')}
                      size="small"
                      value={guest.phone}
                      onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                    />
                    <Button variant="contained" disabled={!guest.name.trim()} onClick={book}>
                      {t('Book table')} {tableNumber}
                    </Button>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        )}
      </Paper>

      <Stack direction="row" spacing={2} sx={{ mb: 1.5, alignItems: 'center' }}>
        <Typography variant="h6">{t('Day view')}</Typography>
        <TextField
          type="date"
          size="small"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': t('Day') } }}
        />
        <Button size="small" onClick={() => setDay(isoDate())}>
          {t('Today')}
        </Button>
      </Stack>
      <DataTable
        rows={reservations.data?.items}
        rowKey={(row) => row.id}
        empty={t('No reservations on this day')}
        columns={[
          { key: 'time', label: t('Time'), render: (row) => `${time(row.startTime)} – ${time(row.endTime)}` },
          { key: 'tableNumber', label: t('Table') },
          { key: 'guestName', label: t('Guest') },
          { key: 'guestPhone', label: t('Phone') },
          { key: 'handledBy', label: t('Handled by') },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setEditing(row)}>
                  {t('Edit')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Cancel the reservation for')} ${row.guestName}?`}
                  confirmLabel={t('Cancel reservation')}
                  onConfirm={() => run(() => api.delete(`/reservations/${row.id}`), t('Reservation cancelled'))}
                >
                  {t('Cancel')}
                </ConfirmButton>
              </Stack>
            ),
          },
        ]}
      />

      <FormDialog
        open={!!editing}
        title={t('Edit reservation')}
        initial={
          editing
            ? {
                guestName: editing.guestName,
                guestPhone: editing.guestPhone ?? '',
                date: editing.reservationDate,
                startTime: time(editing.startTime),
                endTime: time(editing.endTime),
                tableNumber: editing.tableNumber,
              }
            : undefined
        }
        fields={[
          { name: 'guestName', label: t('Guest name'), required: true },
          { name: 'guestPhone', label: t('Phone') },
          { name: 'date', label: t('Date'), type: 'date', required: true },
          { name: 'startTime', label: t('From'), type: 'time', required: true },
          { name: 'endTime', label: t('Until'), type: 'time', required: true },
          {
            name: 'tableNumber',
            label: t('Table'),
            type: 'select',
            required: true,
            options: (tables.data ?? []).map((table) => ({
              value: table.tableNumber,
              label: `${table.tableNumber} · ${table.capacity} ${t('seats')}`,
            })),
          },
        ]}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          await api.put(`/reservations/${editing?.id}`, values);
          await queryClient.invalidateQueries();
          notify(t('Reservation updated'));
        }}
      />
    </>
  );
}
