import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Page, type Row } from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { toOptions, useLookup } from '../hooks/useLookup';
import { useAction } from '../hooks/useNotify';

export default function ProductsPage() {
  const { t } = useTranslation();
  const run = useAction();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const [recipeOf, setRecipeOf] = useState<Row | null>(null);

  const products = useQuery({
    queryKey: ['products', search, page],
    queryFn: () => api.get<Page>('/products', { search, page }),
    placeholderData: keepPreviousData,
  });
  const productTypes = useLookup('product-types');
  const units = useLookup('units');

  return (
    <>
      <PageHeader title={t('Products')}>
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
          {t('New product')}
        </Button>
      </PageHeader>

      <DataTable
        rows={products.data?.items}
        rowKey={(row) => row.id}
        page={page}
        hasMore={products.data?.hasMore}
        onPage={setPage}
        columns={[
          { key: 'name', label: t('Product') },
          { key: 'type', label: t('Type') },
          { key: 'baseUnit', label: t('Base unit') },
          {
            key: 'menuItem',
            label: t('Sellable'),
            render: (row) => (row.menuItem ? <Chip size="small" color="primary" label={t('Menu item')} /> : '—'),
          },
          { key: 'recipeSize', label: t('Recipe lines'), align: 'right' },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (row) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setRecipeOf(row)}>
                  {t('Recipe')}
                </Button>
                <Button size="small" onClick={() => setForm(row)}>
                  {t('Edit')}
                </Button>
                <ConfirmButton
                  size="small"
                  color="error"
                  title={`${t('Delete')} ${row.name}?`}
                  message={t('Products with stock movements, recipes or order history cannot be deleted.')}
                  onConfirm={() => run(() => api.delete(`/products/${row.id}`), t('Product deleted'))}
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
        title={form === 'new' ? t('New product') : t('Edit product')}
        initial={form === 'new' || !form ? { menuItem: false } : { ...form, url: form.url ?? '' }}
        fields={[
          { name: 'name', label: t('Name'), required: true },
          { name: 'typeId', label: t('Type'), type: 'select', required: true, options: toOptions(productTypes) },
          {
            name: 'baseUnitId',
            label: t('Base unit'),
            type: 'select',
            required: true,
            options: toOptions(units),
            helperText: t('Stock is counted in this unit'),
          },
          { name: 'url', label: t('Image URL') },
          { name: 'menuItem', label: t('Sellable (can be put on a menu)'), type: 'checkbox' },
        ]}
        onClose={() => setForm(null)}
        onSubmit={async (values) => {
          const body = {
            name: values.name,
            url: values.url ?? '',
            typeId: values.typeId,
            baseUnitId: values.baseUnitId,
            menuItem: !!values.menuItem,
          };
          if (form === 'new') await api.post('/products', body);
          else await api.put(`/products/${(form as Row).id}`, body);
          await queryClient.invalidateQueries();
        }}
      />

      {recipeOf && <RecipeDialog product={recipeOf} units={units} onClose={() => setRecipeOf(null)} />}
    </>
  );
}

function RecipeDialog({ product, units, onClose }: { product: Row; units: Row[]; onClose: () => void }) {
  const { t } = useTranslation();
  const run = useAction();
  const [line, setLine] = useState({ componentId: '', amount: '', unitId: '' });

  const recipe = useQuery({
    queryKey: ['products', product.id, 'recipe'],
    queryFn: () => api.get(`/products/${product.id}/recipe`),
  });
  const components = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => api.get<Page>('/products', { size: 200 }),
  });

  const add = async () => {
    const ok = await run(() =>
      api.put(`/products/${product.id}/recipe/${line.componentId}`, {
        amount: Number(line.amount),
        unitId: Number(line.unitId),
      }),
    );
    if (ok) setLine({ componentId: '', amount: '', unitId: '' });
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t('Recipe')}: {product.name}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            {t('When the kitchen finishes this item, these amounts are deducted from stock (converted to each base unit).')}
          </Alert>
          <DataTable
            rows={recipe.data}
            rowKey={(row) => row.componentId}
            empty={t('No recipe: nothing is deducted from stock')}
            columns={[
              { key: 'component', label: t('Ingredient') },
              { key: 'amount', label: t('Amount'), align: 'right' },
              { key: 'unit', label: t('Unit') },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (row) => (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => run(() => api.delete(`/products/${product.id}/recipe/${row.componentId}`))}
                  >
                    {t('Remove')}
                  </Button>
                ),
              },
            ]}
          />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              select
              size="small"
              label={t('Ingredient')}
              value={line.componentId}
              onChange={(e) => setLine({ ...line, componentId: e.target.value })}
              sx={{ minWidth: 180, flex: 1 }}
            >
              {(components.data?.items ?? [])
                .filter((candidate) => candidate.id !== product.id)
                .map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label={t('Amount')}
              value={line.amount}
              onChange={(e) => setLine({ ...line, amount: e.target.value })}
              sx={{ width: 110 }}
            />
            <TextField
              select
              size="small"
              label={t('Unit')}
              value={line.unitId}
              onChange={(e) => setLine({ ...line, unitId: e.target.value })}
              sx={{ minWidth: 120 }}
            >
              {units.map((unit) => (
                <MenuItem key={unit.id} value={unit.id}>
                  {unit.label}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" disabled={!line.componentId || !line.amount || !line.unitId} onClick={add}>
              {t('Add')}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
