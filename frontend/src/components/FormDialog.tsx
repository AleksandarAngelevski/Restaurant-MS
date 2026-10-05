import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

export interface Option {
  value: string | number;
  label: string;
}

export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'password' | 'date' | 'time' | 'select' | 'multiselect' | 'checkbox';
  options?: Option[];
  required?: boolean;
  helperText?: string;
  step?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Values = Record<string, any>;

interface Props {
  open: boolean;
  title: string;
  fields: Field[];
  initial?: Values;
  submitLabel?: string;
  onClose: () => void;
  /** Resolve to close the dialog; throw to keep it open and show the message. */
  onSubmit: (values: Values) => Promise<unknown>;
}

/** Field-driven create/edit dialog used by the admin screens. */
export default function FormDialog({ open, title, fields, initial, submitLabel, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initial ?? {});
      setError(null);
    }
    // re-initialise only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, value: unknown) => setValues((current) => ({ ...current, [name]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {fields.map((field) => {
              if (field.type === 'checkbox') {
                return (
                  <FormControlLabel
                    key={field.name}
                    label={field.label}
                    control={
                      <Checkbox checked={!!values[field.name]} onChange={(e) => set(field.name, e.target.checked)} />
                    }
                  />
                );
              }
              const select = field.type === 'select' || field.type === 'multiselect';
              const multiple = field.type === 'multiselect';
              const native = field.type === 'date' || field.type === 'time';
              return (
                <TextField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={select ? undefined : (field.type ?? 'text')}
                  select={select}
                  required={field.required}
                  helperText={field.helperText}
                  value={values[field.name] ?? (multiple ? [] : '')}
                  onChange={(e) => {
                    const raw: unknown = e.target.value;
                    set(field.name, field.type === 'number' && raw !== '' ? Number(raw) : raw);
                  }}
                  slotProps={{
                    select: multiple ? { multiple: true } : undefined,
                    inputLabel: native ? { shrink: true } : undefined,
                    htmlInput: field.type === 'number' ? { step: field.step ?? '1' } : undefined,
                  }}
                  fullWidth
                >
                  {select &&
                    (field.options ?? []).map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                </TextField>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {submitLabel ?? t('Save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
