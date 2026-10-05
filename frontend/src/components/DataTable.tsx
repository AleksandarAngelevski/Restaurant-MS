import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Row } from '../api/client';

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: Row) => ReactNode;
}

interface Props {
  columns: Column[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string | number;
  onRowClick?: (row: Row) => void;
  empty?: string;
  /** Server-side paging: omit for short lists. */
  page?: number;
  hasMore?: boolean;
  onPage?: (page: number) => void;
}

export default function DataTable({ columns, rows, rowKey, onRowClick, empty, page, hasMore, onPage }: Props) {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined">
      {/* wide tables scroll inside the card instead of breaking the phone layout */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow
                key={rowKey(row)}
                hover={!!onRowClick}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{ cursor: onRowClick ? 'pointer' : undefined }}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} align={column.align}>
                    {column.render ? column.render(row) : (row[column.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {rows && rows.length === 0 && (
        <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
          {empty ?? t('Nothing to show')}
        </Typography>
      )}
      {onPage && page !== undefined && (page > 0 || hasMore) && (
        <Stack direction="row" spacing={1} sx={{ p: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Button size="small" disabled={page === 0} onClick={() => onPage(page - 1)}>
            {t('Previous')}
          </Button>
          <Box sx={{ fontSize: 14 }}>
            {t('Page')} {page + 1}
          </Box>
          <Button size="small" disabled={!hasMore} onClick={() => onPage(page + 1)}>
            {t('Next')}
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
