import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';

export default function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
    >
      <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </Stack>
    </Stack>
  );
}
