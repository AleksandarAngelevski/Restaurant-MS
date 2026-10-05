import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';

type Severity = 'success' | 'error' | 'warning' | 'info';

interface Notify {
  notify: (message: string, severity?: Severity) => void;
}

const NotifyContext = createContext<Notify | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<{ message: string; severity: Severity } | null>(null);
  const notify = useCallback((message: string, severity: Severity = 'success') => setNote({ message, severity }), []);
  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        open={!!note}
        autoHideDuration={note?.severity === 'error' ? 8000 : 3500}
        onClose={() => setNote(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={note?.severity ?? 'info'} variant="filled" onClose={() => setNote(null)} role="status">
          {note?.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const context = useContext(NotifyContext);
  if (!context) throw new Error('useNotify must be used inside NotifyProvider');
  return context.notify;
}

/**
 * Runs a write against the API: on success refreshes every query (the database
 * triggers touch several screens at once) and returns true; on failure shows the
 * server's message, which is usually the RAISE EXCEPTION text from Postgres.
 */
export function useAction() {
  const notify = useNotify();
  const queryClient = useQueryClient();

  return useCallback(
    async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await action();
        await queryClient.invalidateQueries();
        if (success) notify(success);
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Something went wrong', 'error');
        return false;
      }
    },
    [notify, queryClient],
  );
}
