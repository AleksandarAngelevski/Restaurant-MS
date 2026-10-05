import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Row } from '../api/client';
import FormDialog from '../components/FormDialog';
import PageHeader from '../components/PageHeader';
import { dateTime, money } from '../format';
import { useAction } from '../hooks/useNotify';
import { statusColor } from './OrdersPage';

interface OrderDetail {
  order: Row;
  items: Row[];
  total: number;
  invoice: Row | null;
}

export default function OrderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const run = useAction();
  const [menuId, setMenuId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const detail = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`),
    // the kitchen finishes items while the waiter is looking at the order
    refetchInterval: (query) => (query.state.data?.order.open ? 5_000 : false),
  });
  const open = !!detail.data?.order.open;
  const menu = useQuery({ queryKey: ['menu', 'active'], queryFn: () => api.get('/menu/active'), enabled: open });

  const menus = useMemo(() => {
    const byId = new Map<number, string>();
    (menu.data ?? []).forEach((member) => byId.set(member.menuId, member.menu));
    return [...byId.entries()].map(([menuKey, name]) => ({ id: menuKey, name }));
  }, [menu.data]);
  const activeMenuId = menuId ?? menus[0]?.id ?? null;

  if (detail.isError) return <Alert severity="error">{detail.error.message}</Alert>;
  if (!detail.data) return null;

  const { order, items, total, invoice } = detail.data;
  const unfinished = items.filter((item) => !item.finished).length;

  return (
    <>
      <Box className="no-print">
        <PageHeader title={`${t('Order')} #${order.orderId}`}>
          <Chip label={order.status} color={statusColor(order.status)} />
          <Button component={RouterLink} to="/orders">
            {t('All orders')}
          </Button>
        </PageHeader>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {order.orderType}
          {order.tableNumber ? ` · ${t('Table')} ${order.tableNumber}` : ''} · {order.waiter ?? t('No waiter')} ·{' '}
          {dateTime(order.dateCreated)}
        </Typography>
      </Box>

      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: open ? '3fr 2fr' : '1fr' }, alignItems: 'start' }}
      >
        {open && (
          <Paper variant="outlined" className="no-print">
            <Tabs
              value={activeMenuId ?? false}
              onChange={(_, value) => setMenuId(value)}
              variant="scrollable"
              allowScrollButtonsMobile
            >
              {menus.map((entry) => (
                <Tab key={entry.id} value={entry.id} label={entry.name} />
              ))}
            </Tabs>
            <Divider />
            <Box sx={{ p: 2, display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {(menu.data ?? [])
                .filter((member) => member.menuId === activeMenuId)
                .map((member) => (
                  <ButtonBase
                    key={`${member.menuMemberId}-${member.menuItemId}`}
                    aria-label={`${t('Add')} ${member.product}`}
                    onClick={() =>
                      run(() =>
                        api.post(`/orders/${order.orderId}/items`, {
                          menuMemberId: member.menuMemberId,
                          menuItemId: member.menuItemId,
                          quantity: 1,
                        }),
                      )
                    }
                    sx={{ borderRadius: 2, display: 'block', textAlign: 'left' }}
                  >
                    <Paper variant="outlined" sx={{ p: 1.5, minHeight: 88 }}>
                      <Typography sx={{ fontWeight: 600 }}>{member.product}</Typography>
                      {member.discountedPrice !== null ? (
                        <Typography variant="body2">
                          <Box component="s" sx={{ color: 'text.secondary', mr: 1 }}>
                            {money(member.price)}
                          </Box>
                          <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                            {money(member.discountedPrice)}
                          </Box>
                        </Typography>
                      ) : (
                        <Typography variant="body2">{money(member.price)}</Typography>
                      )}
                    </Paper>
                  </ButtonBase>
                ))}
            </Box>
          </Paper>
        )}

        <Stack spacing={2}>
          {!invoice && (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('Item')}</TableCell>
                    <TableCell align="right">{t('Qty')}</TableCell>
                    <TableCell align="right">{t('Price')}</TableCell>
                    <TableCell>{t('Kitchen')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">{money(item.quantity * (item.discountedPrice ?? item.unitPrice))}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.finished ? t('Finished') : t('Preparing')}
                          color={item.finished ? 'success' : 'default'}
                          variant={item.finished ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {items.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                  {t('No items yet. Pick them from the menu.')}
                </Typography>
              )}
              <Stack direction="row" sx={{ p: 2, justifyContent: 'space-between' }}>
                <Typography variant="h6">{t('Total')}</Typography>
                <Typography variant="h6" data-testid="order-total">
                  {money(total)}
                </Typography>
              </Stack>
            </Paper>
          )}

          {open && (
            <Stack direction="row" spacing={1} useFlexGap className="no-print" sx={{ flexWrap: 'wrap' }}>
              {order.status === 'Ready' && (
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => run(() => api.post(`/orders/${order.orderId}/serve`), t('Marked as served'))}
                >
                  {t('Mark served')}
                </Button>
              )}
              <Button
                variant="contained"
                size="large"
                disabled={items.length === 0 || unfinished > 0}
                onClick={() => run(() => api.post(`/orders/${order.orderId}/close`), t('Order closed'))}
              >
                {t('Close & invoice')}
              </Button>
              <Button color="error" size="large" onClick={() => setCancelling(true)}>
                {t('Cancel order')}
              </Button>
            </Stack>
          )}
          {open && unfinished > 0 && (
            <Typography variant="body2" color="text.secondary" className="no-print">
              {t('The order can be closed once the kitchen has finished every item.')}
            </Typography>
          )}

          {invoice && <Invoice invoice={invoice} order={order} />}
        </Stack>
      </Box>

      <FormDialog
        open={cancelling}
        title={`${t('Cancel order')} #${order.orderId}`}
        submitLabel={t('Cancel order')}
        fields={[{ name: 'reason', label: t('Reason') }]}
        onClose={() => setCancelling(false)}
        onSubmit={async (values) => {
          await api.post(`/orders/${order.orderId}/cancel`, { reason: values.reason ?? '' });
          await detail.refetch();
        }}
      />
    </>
  );
}

function Invoice({ invoice, order }: { invoice: Row; order: Row }) {
  const { t } = useTranslation();
  const vatPercent = invoice.totalAmount > 0 ? Math.round((invoice.taxAmount / invoice.totalAmount) * 100) : 0;
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }} data-testid="invoice">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="h6">
          {t('Invoice')} #{invoice.invoiceId}
        </Typography>
        <Button className="no-print" onClick={() => window.print()}>
          {t('Print')}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {dateTime(invoice.invoiceDate)} · {t('Order')} #{order.orderId}
        {order.tableNumber ? ` · ${t('Table')} ${order.tableNumber}` : ''} · {invoice.waiter}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('Item')}</TableCell>
            <TableCell align="right">{t('Qty')}</TableCell>
            <TableCell align="right">{t('Price')}</TableCell>
            <TableCell align="right">{t('Discounted')}</TableCell>
            <TableCell align="right">{t('Amount')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(invoice.items as Row[]).map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.product}</TableCell>
              <TableCell align="right">{line.quantity}</TableCell>
              <TableCell align="right">{money(line.originalPrice)}</TableCell>
              <TableCell align="right">{line.discountedPrice !== null ? money(line.discountedPrice) : '—'}</TableCell>
              <TableCell align="right">{money(line.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Stack spacing={0.5} sx={{ mt: 2, ml: 'auto', maxWidth: 280 }}>
        <TotalLine label={t('Subtotal (net)')} value={money(invoice.netAmount)} />
        <TotalLine label={`${t('VAT')} ${vatPercent}%`} value={money(invoice.taxAmount)} testId="invoice-tax" />
        <Divider />
        <TotalLine label={t('Total')} value={money(invoice.totalAmount)} strong testId="invoice-total" />
      </Stack>
    </Paper>
  );
}

function TotalLine({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }} data-testid={testId}>
        {value}
      </Typography>
    </Stack>
  );
}
