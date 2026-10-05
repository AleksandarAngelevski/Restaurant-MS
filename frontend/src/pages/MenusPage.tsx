import { useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import FormDialog, { type Values } from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { money } from '../format';
import { toOptions, useLookup } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

export default function MenusPage() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [menuForm, setMenuForm] = useState<Row | 'new' | null>(null);
  const [memberForm, setMemberForm] = useState<Row | 'new' | null>(null);

  const menus = useQuery({ queryKey: ['menus'], queryFn: () => api.get('/menus') });
  const menuTypes = useLookup('menu-types');
  const memberTypes = useLookup('menu-member-types');
  const menuItems = useQuery({ queryKey: ['menu-items'], queryFn: () => api.get('/menu-items') });
  const current = (menus.data ?? []).find((menu) => menu.id === selected) ?? null;
  const members = useQuery({
    queryKey: ['menus', selected, 'members'],
    queryFn: () => api.get(`/menus/${selected}/members`),
    enabled: selected !== null,
  });

  const saved = () => queryClient.invalidateQueries();

  const saveMenu = async (values: Values) => {
    const body = { name: values.name, active: !!values.active, wallpaper: values.wallpaper ?? '', typeId: values.typeId };
    if (menuForm === 'new') await api.post('/menus', body);
    else await api.put(`/menus/${(menuForm as Row).id}`, body);
    await saved();
  };

  const saveMember = async (values: Values) => {
    if (memberForm === 'new') {
      await api.post(`/menus/${selected}/members`, {
        menuItemId: values.menuItemId,
        price: values.price,
        typeId: values.typeId,
      });
    } else {
      const member = memberForm as Row;
      await api.put(`/menu-members/${member.menuMemberId}/${member.menuItemId}`, {
        price: values.price,
        typeId: values.typeId,
      });
    }
    await saved();
  };

  return (
    <>
      <PageHeader title={t('Menus')}>
        <Button variant="contained" onClick={() => setMenuForm('new')}>
          {t('New menu')}
        </Button>
      </PageHeader>

      <DataTable
        rows={menus.data}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelected(row.id)}
        columns={[
          {
            key: 'name',
            label: t('Menu'),
            render: (row) => <Box sx={{ fontWeight: row.id === selected ? 700 : 400 }}>{row.name}</Box>,
          },
          { key: 'type', label: t('Type') },
          {
            key: 'active',
            label: t('Status'),
            render: (row) => (
              <Chip
                size="small"
                label={row.active ? t('Active') : t('Inactive')}
                color={row.active ? 'success' : 'default'}
                variant={row.active ? 'filled' : 'outlined'}
              />
            ),
          },
          { key: 'items', label: t('Items'), align: 'right' },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuForm(row);
                  }}
                >
                  {t('Edit')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Delete menu')} "${row.name}"?`}
                  message={t('Its items and discounts are removed with it. Menus that appear in orders cannot be deleted.')}
                  onConfirm={() => run(() => api.delete(`/menus/${row.id}`), t('Menu deleted'))}
                >
                  {t('Delete')}
                </ConfirmButton>
              </Stack>
            ),
          },
        ]}
      />

      {current ? (
        <>
          <Stack direction="row" sx={{ mt: 4, mb: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              {current.name} — {t('items')}
            </Typography>
            <Button variant="outlined" onClick={() => setMemberForm('new')}>
              {t('Add item')}
            </Button>
          </Stack>
          <DataTable
            rows={members.data}
            rowKey={(row) => `${row.menuMemberId}-${row.menuItemId}`}
            empty={t('This menu has no items yet')}
            columns={[
              { key: 'product', label: t('Product') },
              { key: 'memberType', label: t('Kind') },
              { key: 'price', label: t('Price'), align: 'right', render: (row) => money(row.price) },
              {
                key: 'discountedPrice',
                label: t('Discounted today'),
                align: 'right',
                render: (row) => (row.discountedPrice !== null ? money(row.discountedPrice) : '—'),
              },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (row) => (
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => setMemberForm(row)}>
                      {t('Edit')}
                    </Button>
                    <ConfirmButton
                      size="small"
                      color="error"
                      title={`${t('Remove')} ${row.product} ${t('from the menu')}?`}
                      confirmLabel={t('Remove')}
                      onConfirm={() =>
                        run(() => api.delete(`/menu-members/${row.menuMemberId}/${row.menuItemId}`), t('Item removed'))
                      }
                    >
                      {t('Remove')}
                    </ConfirmButton>
                  </Stack>
                ),
              },
            ]}
          />
        </>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          {t('Select a menu to manage its items and prices.')}
        </Typography>
      )}

      <FormDialog
        open={!!menuForm}
        title={menuForm === 'new' ? t('New menu') : t('Edit menu')}
        initial={menuForm === 'new' || !menuForm ? { active: true } : { ...menuForm, wallpaper: menuForm.wallpaper ?? '' }}
        fields={[
          { name: 'name', label: t('Name'), required: true },
          { name: 'typeId', label: t('Type'), type: 'select', required: true, options: toOptions(menuTypes) },
          { name: 'wallpaper', label: t('Wallpaper URL') },
          { name: 'active', label: t('Active (shown to waiters)'), type: 'checkbox' },
        ]}
        onClose={() => setMenuForm(null)}
        onSubmit={saveMenu}
      />

      <FormDialog
        open={!!memberForm}
        title={memberForm === 'new' ? t('Add item') : `${t('Edit')} ${(memberForm as Row | null)?.product ?? ''}`}
        initial={
          memberForm === 'new' || !memberForm
            ? { typeId: memberTypes[0]?.id }
            : { price: memberForm.price, typeId: memberForm.memberTypeId }
        }
        fields={[
          ...(memberForm === 'new'
            ? [
                {
                  name: 'menuItemId',
                  label: t('Product'),
                  type: 'select' as const,
                  required: true,
                  options: toOptions(menuItems.data ?? [], 'id', 'name'),
                  helperText: t('Only products marked as sellable are listed'),
                },
              ]
            : []),
          { name: 'price', label: t('Price (MKD)'), type: 'number', step: '0.01', required: true },
          { name: 'typeId', label: t('Kind'), type: 'select', required: true, options: toOptions(memberTypes) },
        ]}
        onClose={() => setMemberForm(null)}
        onSubmit={saveMember}
      />
    </>
  );
}
