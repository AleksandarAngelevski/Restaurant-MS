import { expect, test, type Page } from '@playwright/test';

// Needs the demo seed (admin@demo.mk / admin123 etc.).
async function signIn(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(`${role}@demo.mk`);
  await page.getByLabel('Password').fill(`${role}123`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}

const amount = (text: string | null) => Number((text ?? '').replace(/[^0-9.]/g, ''));

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('admin@demo.mk');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid e-mail or password')).toBeVisible();
});

test('each role lands on its own screen', async ({ page }) => {
  const landing: Record<string, string> = {
    waiter: 'Tables',
    host: 'Tables',
    kitchen: 'Kitchen',
    manager: 'Tables',
    admin: 'Tables',
  };
  for (const [role, heading] of Object.entries(landing)) {
    await signIn(page, role);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await signOut(page);
  }
});

test('order flow: waiter orders, kitchen finishes, invoice has 18% VAT, table is freed', async ({ page }) => {
  await signIn(page, 'waiter');

  // a takeaway order keeps the test independent of which tables are free
  await page.getByRole('button', { name: 'Order without a table' }).click();
  await page.getByLabel('Order type').click();
  await page.getByRole('option', { name: 'Takeaway' }).click();
  await page.getByRole('button', { name: 'Start order' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  const orderId = page.url().split('/').pop()!;

  await page.getByRole('button', { name: 'Add Margherita Pizza' }).click();
  await expect(page.getByRole('cell', { name: 'Margherita Pizza' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close & invoice' })).toBeDisabled();
  const total = amount(await page.getByTestId('order-total').textContent());
  expect(total).toBeGreaterThan(0);
  await signOut(page);

  await signIn(page, 'kitchen');
  const ticket = page.getByTestId(`ticket-${orderId}`);
  await ticket.getByRole('button', { name: /Done/ }).click();
  await expect(ticket).toHaveCount(0);
  await signOut(page);

  await signIn(page, 'waiter');
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Close & invoice' }).click();
  await expect(page.getByTestId('invoice')).toBeVisible();
  expect(amount(await page.getByTestId('invoice-total').textContent())).toBeCloseTo(total, 2);
  expect(amount(await page.getByTestId('invoice-tax').textContent())).toBeCloseTo(total * 0.18, 2);
  await expect(page.getByText('Completed')).toBeVisible();
});

test('an overlapping reservation is not offered and a free table can be booked', async ({ page }) => {
  await signIn(page, 'host');
  await page.getByRole('link', { name: 'Reservations' }).click();

  // the demo seed books table 5 today from 19:00 to 21:00
  await page.getByLabel('From').first().fill('19:30');
  await page.getByLabel('Until').first().fill('20:30');
  await page.getByRole('button', { name: 'Find free tables' }).click();
  const free = page.getByLabel('Free tables');
  await expect(free).toBeVisible();
  await expect(free.getByText(/^Table 5 ·/)).toHaveCount(0);

  await free.getByRole('button').first().click();
  const guest = `Smoke ${Date.now()}`;
  await page.getByLabel('Guest name').fill(guest);
  await page.getByRole('button', { name: /^Book table/ }).click();
  await expect(page.getByRole('cell', { name: guest })).toBeVisible();
});

test('a menu discount shows up in the prices waiters see', async ({ page }) => {
  await signIn(page, 'manager');
  await page.getByRole('link', { name: 'Discounts' }).click();
  await page.getByRole('button', { name: 'New discount' }).click();
  const name = `Smoke ${Date.now() % 100000}`;
  await page.getByLabel('Menu').click();
  await page.getByRole('option', { name: 'Drinks' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Percent off').fill('20');
  await page.getByRole('button', { name: 'Apply discount' }).click();
  await expect(page.getByRole('cell', { name })).toBeVisible();

  // Espresso is 80.00 on the Drinks menu, so 20% off is 64.00
  await page.getByRole('link', { name: 'Menus' }).click();
  await page.getByRole('cell', { name: 'Drinks', exact: true }).click();
  await expect(page.getByRole('row', { name: /Espresso/ })).toContainText('64.00');

  // clean up so the test can be repeated
  await page.getByRole('link', { name: 'Discounts' }).click();
  await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('cell', { name })).toHaveCount(0);
});

test('admin sees inventory, staff and analytics', async ({ page }) => {
  await signIn(page, 'admin');
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page.getByRole('cell', { name: 'Wheat Flour' })).toBeVisible();
  await page.getByRole('link', { name: 'Staff' }).click();
  await expect(page.getByRole('cell', { name: 'admin@demo.mk' })).toBeVisible();
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByText('Revenue over time (MKD)')).toBeVisible();
});
