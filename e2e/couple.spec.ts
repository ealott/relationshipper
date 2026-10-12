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

/** Calls the API from inside a signed-in page, with its cookies. */
const call = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ([m, p, b]) => (await fetch(`/api${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })).json(),
    [method, path, body] as const,
  );

/** A fresh browser signed in through the local-only test route. The same name and stamp is the same account. */
async function signInAs(browser: Browser, name: string, stamp: number, colorScheme: 'light' | 'dark' = 'light') {
  const { page } = await newPage(browser, colorScheme);
  await page.goto(`/api/auth/dev?email=${name}.${stamp}@example.com&name=${name}&returnTo=/`);
  return page;
}

/** Pairs two signed-in partners and answers the questions about their stage. */
async function pair(a: Page, b: Page) {
  const { code } = await call(a, 'POST', '/invite', {});
  await call(b, 'POST', '/pair', { code });
  await call(b, 'PATCH', '/couple', { married: false, livingTogether: false, hasKids: false });
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

  // After the reveal Alex adds to their answer and corrects their reply. Sam sees both edits,
  // and what Alex wrote before.
  await alex.page.locator('.entry--me').getByRole('button', { name: 'Edit', exact: true }).click();
  await alex.page.getByLabel('Your answer').fill(`${secret}\n\nA second paragraph, and a third thought.`);
  await alex.page.getByRole('button', { name: 'Save changes' }).click();
  await expect(alex.page.locator('.entry--me .entry__text')).toContainText('a third thought');
  await expect(alex.page.locator('.entry--me .versions__toggle')).toContainText('Edited');
  await alex.page.locator('.message--me').getByRole('button', { name: 'Edit', exact: true }).click();
  await alex.page.getByLabel('Edit your reply').fill('It came up when we were cooking on Saturday.');
  await alex.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(alex.page.locator('.message--me .message__text')).toContainText('cooking on Saturday');

  await sam.page.reload();
  const alexEntry = sam.page.locator('.entry--partner');
  await expect(alexEntry.locator('.entry__text')).toContainText('a third thought');
  await alexEntry.getByRole('button', { name: /See what changed/ }).click();
  await expect(alexEntry.locator('.versions__text')).toHaveText(`${secret}\n\nA second paragraph.`);
  const alexReply = sam.page.locator('.message--partner');
  await expect(alexReply.locator('.message__text')).toContainText('cooking on Saturday');
  await alexReply.getByRole('button', { name: 'edited', exact: true }).click();
  await expect(alexReply.locator('.versions__text')).toContainText('cooking on Sunday');
  await shot(sam.page, '08b-edited');
  // Only Alex can change Alex's words.
  await expect(alexEntry.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(alexReply.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);

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

test('keeps the line being typed in view as an answer grows on a short screen', async ({ browser }) => {
  const stamp = Date.now();
  const kai = await signInAs(browser, 'Kai', stamp);
  await pair(kai, await signInAs(browser, 'Noor', stamp));

  await kai.goto('/');
  const box = kai.getByLabel('Your answer');
  // Roughly the space left above a phone's on-screen keyboard.
  await kai.setViewportSize({ width: 412, height: 400 });
  await box.click();
  for (let line = 1; line <= 25; line++) {
    await kai.keyboard.type(`Line ${line} of a long answer that keeps going and going`);
    await kai.keyboard.press('Enter');
    const { bottom, height } = await box.evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, height: innerHeight }));
    expect(bottom, `after line ${line}`).toBeLessThanOrEqual(height);
  }
});

test('an unsent draft follows you to another device, and the journal downloads', async ({ browser }) => {
  const stamp = Date.now();
  const phone = await signInAs(browser, 'Ari', stamp);
  const partner = await signInAs(browser, 'Bea', stamp);
  await pair(phone, partner);

  await phone.goto('/');
  await phone.getByLabel('Your answer').fill('Started on my phone, to finish later.');
  await expect(phone.getByText('draft saved')).toBeVisible();
  await phone.waitForResponse((r) => r.url().includes('/drafts/answer') && r.request().method() === 'PUT');

  // Same account, a different device (fresh browser storage).
  const laptop = await signInAs(browser, 'Ari', stamp);
  await laptop.goto('/');
  await expect(laptop.getByLabel('Your answer')).toHaveValue('Started on my phone, to finish later.');
  // …and the partner sees nothing of it.
  await partner.goto('/');
  await expect(partner.getByLabel('Your answer')).toHaveValue('');
  await expect(partner.getByText('has written their answer')).toHaveCount(0);

  await tab(laptop, 'Settings').click();
  const download = laptop.waitForEvent('download');
  await laptop.getByRole('link', { name: 'Download our journal' }).click();
  expect((await download).suggestedFilename()).toMatch(/^relationshipper-journal-\d{4}-\d\d-\d\d\.md$/);
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

test('display preferences apply before the first paint and stay with the device', async ({ browser }) => {
  const stamp = Date.now();
  const page = await signInAs(browser, 'Cam', stamp, 'dark'); // this device is set to dark mode
  const partner = await signInAs(browser, 'Dee', stamp);
  await pair(page, partner);

  // Record the theme as the page's <body> first appears, before anything can be painted.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      document.documentElement.dataset.themeAtBody = document.documentElement.dataset.theme ?? 'unset';
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  const html = page.locator('html');
  const appearance = page.locator('section', { has: page.getByRole('heading', { name: 'Appearance' }) });
  const option = (group: string, name: string) => appearance.getByRole('radiogroup', { name: group }).getByRole('radio', { name });
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const themeColor = page.locator('meta[name="theme-color"]');

  // System follows the device, and Light overrides it, from the first paint after a reload.
  await page.goto('/settings');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(option('Theme', 'System')).toHaveAttribute('aria-checked', 'true');
  expect(await background()).toBe('rgb(21, 18, 15)');
  await option('Theme', 'Light').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await background()).toBe('rgb(248, 244, 238)');
  await expect(themeColor).toHaveAttribute('content', '#f8f4ee');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme-at-body', 'light');
  await expect(option('Theme', 'Light')).toHaveAttribute('aria-checked', 'true');
  await shot(page, '17-appearance');

  // Dark, then back to System, which follows the device as it changes.
  await option('Theme', 'Dark').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(themeColor).toHaveAttribute('content', '#15120f');
  await option('Theme', 'System').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Text size scales the writing, and the writing tips can be hidden.
  await tab(page, 'Today').click();
  const answer = page.getByLabel('Your answer');
  const fontSize = async () => parseFloat(await answer.evaluate((el) => getComputedStyle(el).fontSize));
  expect(await fontSize()).toBe(18);
  await expect(page.locator('.composer__tip')).toBeVisible();
  await tab(page, 'Settings').click();
  await option('Text size', 'Larger').click();
  await appearance.getByRole('switch', { name: 'Writing tips' }).click();
  await tab(page, 'Today').click();
  expect(await fontSize()).toBeCloseTo(23.4, 1);
  await expect(page.locator('.composer__tip')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Save answer' })).toBeVisible();

  // Reduced motion turns off transitions even though the device doesn't ask for it.
  await tab(page, 'Settings').click();
  const tips = appearance.getByRole('switch', { name: 'Writing tips' });
  const transition = () => tips.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(await transition()).toBe(0.2);
  await option('Motion', 'Reduced').click();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  expect(await transition()).toBeLessThan(0.001);

  // All of it survives a reload, and it belongs to this device only.
  await page.reload();
  await expect(html).toHaveAttribute('data-text', 'larger');
  await expect(html).toHaveAttribute('data-tips', 'off');
  await expect(option('Text size', 'Larger')).toHaveAttribute('aria-checked', 'true');
  await expect(tips).toHaveAttribute('aria-checked', 'false');
  await partner.goto('/');
  await expect(partner.locator('html')).toHaveAttribute('data-text', 'default');
  await expect(partner.locator('html')).toHaveAttribute('data-tips', 'on');
});

test('the journal: a few lines about your day, read once you’ve both written', async ({ browser }) => {
  const stamp = Date.now();
  const jo = await signInAs(browser, 'Jo', stamp);
  const lee = await signInAs(browser, 'Lee', stamp);
  await pair(jo, lee);
  const leeBodies: string[] = [];
  lee.on('response', async (res) => {
    if (res.url().includes('/api/')) leeBodies.push(await res.text().catch(() => ''));
  });
  const secret = `JO-GOOD-${stamp}`;

  // Jo writes a few lines about the day, from Today's journal card.
  await jo.goto('/');
  await expect(jo.locator('.journal-card')).toContainText('How was your');
  await jo.locator('.journal-card').click();
  await expect(jo.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
  const good = jo.getByLabel('Something good', { exact: true });
  await good.fill(secret);
  await good.press('Enter');
  await expect(jo.getByLabel('Something good, line 2')).toBeFocused();
  await jo.keyboard.type('Finished early');
  await jo.getByLabel('Something hard', { exact: true }).fill('A long meeting');
  await jo.getByLabel('Something you appreciated about Lee', { exact: true }).fill('The coffee');
  await jo.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(jo.getByText('Waiting for Lee.')).toBeVisible();
  await expect(jo.locator('.entry--me')).toContainText('Finished early');
  await shot(jo, '18-journal-waiting');

  // Lee learns that Jo wrote, but not what.
  await lee.goto('/');
  await expect(lee.locator('.journal-card')).toContainText('Jo has written about their');
  await tab(lee, 'Journal').click();
  await expect(lee.getByText(/Jo has written about their (day|week)\. Write yours to read it\./)).toBeVisible();
  await expect(lee.locator('body')).not.toContainText(secret);
  expect(leeBodies.some((b) => b.includes(secret))).toBe(false);

  // Lee writes; both days show, and they talk about them.
  await lee.getByLabel('Something you appreciated about Jo', { exact: true }).fill('Dinner was ready when I got home');
  await lee.getByRole('button', { name: /Save & read Jo’s/ }).click();
  await expect(lee.locator('.entry--partner')).toContainText(secret);
  await expect(lee.locator('.entry--partner')).toContainText('A long meeting');
  await lee.getByLabel('Respond to Jo').fill('What was the long meeting about?');
  await lee.getByRole('button', { name: 'Send' }).click();
  await expect(lee.locator('.message--me')).toContainText('long meeting');
  await shot(lee, '19-journal-shared');

  await jo.reload();
  await expect(jo.locator('.entry--partner')).toContainText('Dinner was ready');
  await expect(jo.locator('.message--partner')).toContainText('long meeting');
});
