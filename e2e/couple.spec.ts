import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Set SCREENSHOTS=1 to save screenshots of each step to docs/screenshots.
const SHOTS = process.env.SCREENSHOTS ? 'docs/screenshots' : null;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
};

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${name}`) });

async function newPage(browser: Browser, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ colorScheme, serviceWorkers: 'block' });
  const page = await context.newPage();
  const apiBodies: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/')) apiBodies.push(await res.text().catch(() => ''));
  });
  return { page, apiBodies };
}

/** The local-only test sign-in form, which can create any number of accounts. */
async function devSignIn(page: Page, name: string, email: string) {
  const form = page.locator('.devsignin');
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Email').fill(email);
  await form.getByRole('button', { name: 'Sign in' }).click();
}

async function write(page: Page, text: string, button: RegExp) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: button }).click();
}

test('two partners pair up, write privately, and talk about their answers', async ({ browser }) => {
  const stamp = Date.now();
  const alex = await newPage(browser);
  const sam = await newPage(browser);

  // Alex signs in and gets an invite code.
  await alex.page.goto('/');
  await expect(alex.page.getByRole('heading', { name: 'Relationshipper' })).toBeVisible();
  await shot(alex.page, '01-welcome');
  await devSignIn(alex.page, 'Alex', `alex.${stamp}@example.com`);
  const code = alex.page.locator('.invite__code');
  await expect(code).toHaveText(/^[A-Z0-9]{3} [A-Z0-9]{3}$/);
  await shot(alex.page, '02-invite');
  const inviteCode = (await code.textContent())!.replace(' ', '');

  // Sam opens the invite link, signs in, joins, and describes their stage.
  await sam.page.goto(`/join/${inviteCode}`);
  await expect(sam.page.getByRole('heading', { name: 'Alex invited you' })).toBeVisible();
  await shot(sam.page, '03-join');
  await devSignIn(sam.page, 'Sam', `sam.${stamp}@example.com`);
  await sam.page.getByRole('button', { name: 'Join Alex' }).click();
  await expect(sam.page.getByRole('heading', { name: 'About the two of you' })).toBeVisible();
  await sam.page.getByRole('radio', { name: 'Not married' }).click();
  await sam.page.getByRole('radio', { name: 'Not yet' }).click();
  await sam.page.getByRole('radio', { name: 'No children' }).click();
  await shot(sam.page, '04-stage');
  await sam.page.getByRole('button', { name: 'Continue' }).click();
  await expect(sam.page.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Alex's invite screen notices the pairing; the stage is already set by Sam.
  await expect(alex.page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 });
  await expect(alex.page.locator('.source')).toContainText('Research-based');
  await shot(alex.page, '05-today');

  // Alex writes. Sam learns *that* Alex answered — but not what.
  const secret = `Alex’s private reflection ${stamp}`;
  await write(alex.page, `${secret}\n\nA second paragraph.`, /^Save answer$/);
  await expect(alex.page.getByText('Waiting for Sam.')).toBeVisible();
  await shot(alex.page, '06-waiting');

  await sam.page.reload();
  await expect(sam.page.getByText('Alex has written their answer. Write yours to read it.')).toBeVisible();
  await expect(sam.page.locator('body')).not.toContainText(secret);
  expect(sam.apiBodies.some((b) => b.includes(secret))).toBe(false);
  await shot(sam.page, '07-partner-answered');

  // Sam writes; both entries are revealed. Then they talk.
  await write(sam.page, `Sam’s reflection ${stamp}`, /Save & read Alex’s/);
  await expect(sam.page.locator('.entry--partner')).toContainText(secret);
  await sam.page.getByLabel('Respond to Alex').fill('I didn’t know that. What made you think of it?');
  await sam.page.getByRole('button', { name: 'Send' }).click();
  await expect(sam.page.locator('.message--me')).toContainText('What made you think of it?');
  await shot(sam.page, '08-revealed');

  await alex.page.reload();
  await expect(alex.page.locator('.entry--partner')).toContainText(`Sam’s reflection ${stamp}`);
  await expect(alex.page.locator('.message--partner')).toContainText('What made you think of it?');
  await alex.page.getByLabel('Respond to Sam').fill('It came up when we were cooking on Sunday.');
  await alex.page.getByRole('button', { name: 'Send' }).click();
  await expect(alex.page.locator('.message--me')).toContainText('cooking on Sunday');

  // The library, a theme, and a question Alex writes for them both.
  await tab(alex.page, 'Questions').click();
  await expect(alex.page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  await shot(alex.page, '09-library');
  await alex.page.getByRole('link', { name: /^Marriage/ }).click();
  await expect(alex.page.getByRole('heading', { name: 'Marriage' })).toBeVisible();
  await expect(alex.page.locator('.qrow').first()).toBeVisible();
  await shot(alex.page, '10-theme');
  await tab(alex.page, 'Questions').click();
  await alex.page.getByRole('link', { name: 'Write a question' }).click();
  await alex.page.getByLabel('Your question').fill('What is one thing you want us to protect, no matter how busy life gets?');
  await alex.page.getByRole('button', { name: 'Add question' }).click();
  await expect(alex.page.locator('.source')).toContainText('Written by you');
  await write(alex.page, 'Our Sunday mornings.', /^Save answer$/);

  await tab(sam.page, 'Answers').click();
  await sam.page.getByRole('tab', { name: /Your turn/ }).click();
  await expect(sam.page.getByText('What is one thing you want us to protect')).toBeVisible();
  await sam.page.getByText('What is one thing you want us to protect').click();
  await expect(sam.page.locator('.source')).toContainText('Written by Alex');

  await tab(alex.page, 'Answers').click();
  await expect(alex.page.locator('.hcard')).toHaveCount(1);
  await shot(alex.page, '11-answers');

  await tab(alex.page, 'Settings').click();
  await expect(alex.page.getByText('Alex & Sam')).toBeVisible();
  await shot(alex.page, '12-settings');
});

/** Settings from .dev.vars, which the preview server reads too. */
function devVars(): Record<string, string> {
  try {
    const lines = readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l));
    return Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  } catch {
    return {};
  }
}

test('simple sign-in takes the two configured people straight in, already paired', async ({ browser }) => {
  const { LOGIN_USERS = '', LOGIN_PASSWORD = '' } = devVars();
  const names = LOGIN_USERS.split(',').map((n) => n.trim()).filter(Boolean);
  test.skip(names.length !== 2 || !LOGIN_PASSWORD, 'Needs two LOGIN_USERS names and a LOGIN_PASSWORD in .dev.vars');
  const { page } = await newPage(browser);
  await page.goto('/');
  const form = page.locator('.signin__form');
  await form.getByLabel('Name').fill(names[0]!.toLowerCase());
  await form.getByLabel('Password', { exact: true }).fill(LOGIN_PASSWORD);
  await shot(page, '00-sign-in');
  await form.getByRole('button', { name: 'Sign in' }).click();
  // No invite code: straight to setting up the couple (or Today, once that's done).
  await expect(page.getByRole('heading', { name: 'About the two of you' }).or(page.getByRole('heading', { name: 'Today' }))).toBeVisible();
});

test('admin console', async ({ browser }) => {
  const { page } = await newPage(browser);
  await page.goto('/');
  await devSignIn(page, 'Admin', 'admin@example.com');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Relationshipper console' })).toBeVisible();
  await expect(page.getByText('Bank: active / retired')).toBeVisible();
  await shot(page, '13-admin');
  await page.getByRole('tab', { name: 'Questions' }).click();
  await expect(page.locator('.admin-item').first()).toBeVisible();
  await shot(page, '14-admin-questions');
});

test('research page and dark mode', async ({ browser }) => {
  const { page } = await newPage(browser, 'dark');
  await page.goto('/');
  await shot(page, '15-welcome-dark');
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: 'Why Relationshipper works the way it does' })).toBeVisible();
  await shot(page, '16-research-dark');
});
