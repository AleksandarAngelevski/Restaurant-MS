import { useState, type ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, type ButtonProps } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface Props extends Omit<ButtonProps, 'onClick'> {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => unknown;
  children: ReactNode;
}

/** A button that asks before running a destructive action. */
export default function ConfirmButton({ title, message, confirmLabel, onConfirm, children, ...button }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        {...button}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} onClick={(event) => event.stopPropagation()}>
        <DialogTitle>{title}</DialogTitle>
        {message && (
          <DialogContent>
            <DialogContentText>{message}</DialogContentText>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('Keep')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            {confirmLabel ?? t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
