const moneyFormat = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Prices are MKD; the API sends NUMERIC values, this only formats them. */
export const money = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : `${moneyFormat.format(Number(value))} MKD`;

export const number = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : new Intl.NumberFormat('en').format(Number(value));

export const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const time = (value: string | null | undefined) => (value ? value.slice(0, 5) : '');

/** Local calendar date as yyyy-mm-dd (toISOString would shift it to UTC). */
export const isoDate = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
};

export const minutesSince = (value: string) => Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
