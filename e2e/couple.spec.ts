import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Set SCREENSHOTS=1 to save screenshots of each step to docs/screenshots.
const SHOTS = process.env.SCREENSHOTS ? 'docs/screenshots' : null;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
};

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${name}`) });

/** Opens Self once its questionnaires have loaded, since they decide where its cards lead. */
async function openSelf(page: Page) {
  await Promise.all([page.waitForResponse((res) => new URL(res.url()).pathname === '/api/self/questionnaires'), tab(page, 'Self').click()]);
}

/** Settings opens from the top of Self. */
async function openSettings(page: Page) {
  await tab(page, 'Self').click();
  await page.getByRole('link', { name: 'Settings' }).click();
}

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

/**
 * Calls the API as a signed-in page, with its cookies. It goes through the browser context rather
 * than the page, so it can't race the app's own navigation right after signing in.
 */
async function call(page: Page, method: string, path: string, body?: unknown) {
  // The local preview server now and then fails to reach the Worker ("fetch failed" in its log)
  // and answers with the app's HTML page instead. The API never sends HTML, so try again.
  for (let attempt = 1; ; attempt++) {
    const res = await page.request.fetch(new URL(`/api${path}`, page.url()).href, { method, data: body });
    if (res.status() === 204) return null;
    if (!(res.headers()['content-type'] ?? '').includes('text/html')) return res.json();
    if (attempt === 3) throw new Error(`${method} /api${path} got an HTML page ${attempt} times (status ${res.status()})`);
    await page.waitForTimeout(250);
  }
}

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
  await sam.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(sam.page.locator('.message--me')).toContainText('What made you think of it?');
  await shot(sam.page, '08-revealed');

  await alex.page.reload();
  await expect(alex.page.locator('.entry--partner')).toContainText(`Sam’s reflection ${stamp}`);
  await expect(alex.page.locator('.message--partner')).toContainText('What made you think of it?');
  await alex.page.getByLabel('Respond to Sam').fill('It came up when we were cooking on Sunday.');
  await alex.page.getByRole('button', { name: 'Send', exact: true }).click();
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

  // Answers live under Questions, which carries the "your turn" badge. (A push would refresh it;
  // these browsers have no service worker, so reload.)
  await sam.page.reload();
  await expect(tab(sam.page, 'Questions')).toHaveAttribute('aria-label', /Questions, \d+ waiting for you/);
  await tab(sam.page, 'Questions').click();
  await sam.page.getByRole('navigation', { name: 'Your answers' }).getByRole('link', { name: /Your turn/ }).click();
  await expect(sam.page.getByRole('tab', { name: /Your turn/ })).toHaveAttribute('aria-selected', 'true');
  await expect(sam.page.getByText('What is one thing you want us to protect')).toBeVisible();
  await sam.page.getByText('What is one thing you want us to protect').click();
  await expect(sam.page.locator('.source')).toContainText('Written by Alex');

  await tab(alex.page, 'Questions').click();
  await alex.page.getByRole('navigation', { name: 'Your answers' }).getByRole('link', { name: /Shared/ }).click();
  await expect(alex.page.getByRole('heading', { name: 'Answers' })).toBeVisible();
  await expect(alex.page.locator('.hcard')).toHaveCount(1);
  await shot(alex.page, '11-answers');

  await openSettings(alex.page);
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

  await openSettings(laptop);
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
  await openSettings(page);
  await option('Text size', 'Larger').click();
  await appearance.getByRole('switch', { name: 'Writing tips' }).click();
  await tab(page, 'Today').click();
  expect(await fontSize()).toBeCloseTo(23.4, 1);
  await expect(page.locator('.composer__tip')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Save answer' })).toBeVisible();

  // Reduced motion turns off transitions even though the device doesn't ask for it.
  await openSettings(page);
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
  await lee.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(lee.locator('.message--me')).toContainText('long meeting');
  await shot(lee, '19-journal-shared');

  await jo.reload();
  await expect(jo.locator('.entry--partner')).toContainText('Dinner was ready');
  await expect(jo.locator('.message--partner')).toContainText('long meeting');
});

test('date nights: deciding ahead, together', async ({ browser }) => {
  const stamp = Date.now();
  const ana = await signInAs(browser, 'Ana', stamp);
  const ben = await signInAs(browser, 'Ben', stamp);
  await pair(ana, ben);
  const dayIn = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const [first, moved] = [dayIn(3), dayIn(4)];

  // Ana starts the list from a suggestion and plans a date from it, for Ben to plan.
  await ana.goto('/');
  const anaCard = ana.locator('.date-card');
  await expect(anaCard).toContainText('Nothing on the calendar yet');
  await anaCard.click();
  await expect(ana.getByRole('heading', { name: 'Date nights' })).toBeVisible();
  await ana.locator('.suggestions .idea', { hasText: 'Learn a new board or card game' }).getByRole('button', { name: 'Add' }).click();
  const idea = ana.locator('.section .idea-list').first().locator('.idea', { hasText: 'Learn a new board or card game' });
  await idea.getByRole('button', { name: 'Plan this' }).click();
  await expect(ana.getByLabel('What you’ll do')).toHaveValue('Learn a new board or card game');
  await ana.getByLabel('Day', { exact: true }).fill(first);
  await ana.getByLabel('Time (optional)').fill('19:30');
  await ana.getByRole('radio', { name: 'Ben' }).click();
  await ana.getByLabel('Notes (optional)').fill('Ben picks the game');
  await ana.getByRole('button', { name: 'Plan it' }).click();
  const next = ana.locator('.next-date');
  await expect(next).toContainText('Learn a new board or card game');
  await expect(next).toContainText(`${label(first)} · 7:30 PM`);
  await expect(next).toContainText('Ben is planning it');
  await shot(ana, '20-date-nights');

  // Ben sees it on Today, moves it a day, and can put it on his calendar.
  await ben.goto('/');
  const benCard = ben.locator('.date-card');
  await expect(benCard).toContainText('Learn a new board or card game. You’re planning it.');
  await benCard.click();
  await ben.locator('.next-date').getByRole('button', { name: 'Change' }).click();
  await ben.getByLabel('Day', { exact: true }).fill(moved);
  await ben.getByRole('button', { name: 'Save changes' }).click();
  await expect(ben.locator('.next-date')).toContainText(`${label(moved)} · 7:30 PM`);
  const google = new URL((await ben.locator('.next-date').getByRole('link', { name: 'Google Calendar' }).getAttribute('href'))!);
  expect(google.origin + google.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(google.searchParams.get('action')).toBe('TEMPLATE');
  expect(google.searchParams.get('text')).toBe('Date night: Learn a new board or card game');
  expect(google.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  const href = await ben.locator('.next-date').getByRole('link', { name: 'Apple Calendar' }).getAttribute('href');
  const ics = await ben.request.get(href!);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('SUMMARY:Date night: Learn a new board or card game');

  // Date nights have their own tab.
  await tab(ana, 'Today').click();
  await tab(ana, 'Dates').click();
  await expect(ana.getByRole('heading', { name: 'Date nights' })).toBeVisible();
  await expect(ana.locator('.next-date')).toContainText(`${label(moved)} · 7:30 PM`);

  // Ana subscribes to the feed, so dates follow into her calendar app.
  await ana.getByRole('button', { name: 'Set up' }).click();
  const webcal = (await ana.getByRole('link', { name: 'Subscribe in Apple Calendar' }).getAttribute('href'))!;
  expect(webcal).toMatch(/^webcal:\/\/localhost:4173\/api\/calendar\/[\w-]{32}\.ics$/);
  expect(await ana.getByRole('link', { name: 'Subscribe in Google Calendar' }).getAttribute('href')).toBe(`https://www.google.com/calendar/render?cid=${webcal}`);
  const feed = await ana.request.get(webcal.replace('webcal:', 'http:'));
  expect(feed.headers()['content-type']).toContain('text/calendar');
  expect(await feed.text()).toContain('SUMMARY:Date night: Learn a new board or card game');
  await ana.reload();
  await expect(ana.locator('.feed-card')).toContainText('Your calendar last checked just now.');
  await shot(ana, '21-calendar-feed');
  await ana.locator('.feed-card').getByRole('button', { name: 'Show' }).click();
  ana.once('dialog', (dialog) => void dialog.accept());
  await ana.getByRole('button', { name: 'Turn off' }).click();
  await expect(ana.locator('.feed-card')).toContainText('Put date nights in your calendar');
  expect((await ana.request.get(webcal.replace('webcal:', 'http:'))).status()).toBe(404);
});

test('a snuggle, sent with one tap and returned', async ({ browser }) => {
  const stamp = Date.now();
  const kim = await signInAs(browser, 'Kim', stamp);
  const noor = await signInAs(browser, 'Noor', stamp);
  await pair(kim, noor);

  await kim.goto('/');
  const send = kim.locator('.snuggle');
  await expect(send).toContainText('Thinking of Noor?');
  await send.getByRole('button', { name: 'Snuggle', exact: true }).click();
  await expect(kim.getByText('Snuggle sent to Noor.')).toBeVisible();
  await expect(send).toContainText('You sent a snuggle just now.');

  // Noor finds it at the top of Today and snuggles back.
  await noor.goto('/');
  const received = noor.locator('.snuggle--received');
  await expect(received).toContainText('Kim sent you a snuggle');
  await shot(noor, '21-snuggle');
  await received.getByRole('button', { name: 'Snuggle back' }).click();
  await expect(received).toHaveCount(0);
  await expect(noor.locator('.snuggle')).toContainText('You sent a snuggle just now.');

  await kim.reload();
  const back = kim.locator('.snuggle--received');
  await expect(back).toContainText('Noor sent you a snuggle');
  await back.getByRole('button', { name: 'Thanks' }).click();
  await expect(back).toHaveCount(0);
  await expect(kim.locator('.snuggle')).toContainText('Thinking of Noor?');
});

test('our timeline: milestones, both memories, and the day they come back', async ({ browser }) => {
  const stamp = Date.now();
  const mae = await signInAs(browser, 'Mae', stamp);
  const ivo = await signInAs(browser, 'Ivo', stamp);
  await pair(mae, ivo);

  // Mae starts the timeline from Today, with a suggestion.
  await mae.goto('/');
  const card = mae.locator('.timeline-card');
  await expect(card).toContainText('Start with the day you met.');
  await card.click();
  await expect(mae.getByRole('heading', { name: 'Our timeline' })).toBeVisible();
  await expect(mae.getByRole('button', { name: 'First chat', exact: true })).toBeVisible();
  await mae.getByRole('button', { name: 'First date', exact: true }).click();
  await expect(mae.getByLabel('Title')).toHaveValue('Our first date');
  await mae.getByLabel('Day', { exact: true }).fill('2019-06-14');
  await mae.getByLabel('Where (optional)').fill('The pier');
  await mae.getByRole('button', { name: 'Add it' }).click();

  // She lands on it and writes what she remembers, with a song.
  await expect(mae.getByRole('heading', { name: 'Our first date' })).toBeVisible();
  await expect(mae.locator('.milestone')).toContainText('June 14, 2019');
  await mae.getByLabel('Your memory').fill('You were ten minutes late.');
  await mae.getByRole('button', { name: 'Add a song' }).click();
  await mae.getByLabel('Song', { exact: true }).fill('Dreams');
  await mae.getByLabel('Artist').fill('Fleetwood Mac');
  await mae.getByRole('button', { name: 'Save memory' }).click();
  await expect(mae.locator('.memory')).toContainText('You were ten minutes late.');
  await expect(mae.locator('.song')).toContainText('Dreams · Fleetwood Mac');

  // A month is enough when you don't remember the day.
  await mae.goto('/timeline');
  await mae.getByRole('button', { name: 'Add', exact: true }).click();
  await mae.getByLabel('What happened').selectOption('trip');
  await expect(mae.getByLabel('Title')).toHaveValue('Our first trip together');
  await mae.getByRole('radio', { name: 'Month' }).click();
  await mae.getByLabel('Month', { exact: true }).fill('2021-05');
  await mae.getByRole('button', { name: 'Add it' }).click();
  await expect(mae.getByRole('heading', { name: 'Our first trip together' })).toBeVisible();
  await mae.goto('/timeline');
  await expect(mae.locator('.tl-card__title')).toHaveText(['Our first date', 'Our first trip together']);
  await expect(mae.locator('.tl-year')).toHaveText(['2019', '2021']);

  // Ivo reads hers right away and adds his own.
  await ivo.goto('/timeline');
  await ivo.locator('.tl-card', { hasText: 'Our first date' }).click();
  await expect(ivo.locator('.memory.entry--partner')).toContainText('You were ten minutes late.');
  await ivo.getByLabel('Your memory').fill('I was exactly on time.');
  await ivo.getByRole('button', { name: 'Save memory' }).click();
  await expect(ivo.locator('.memory.entry--me')).toContainText('I was exactly on time.');
  await shot(ivo, '22-milestone');

  // Either of them can change or remove a milestone.
  await ivo.goto('/timeline');
  await ivo.locator('.tl-card', { hasText: 'Our first trip together' }).click();
  await ivo.getByRole('button', { name: 'Change' }).click();
  ivo.once('dialog', (dialog) => void dialog.accept());
  await ivo.getByRole('button', { name: 'Remove' }).click();
  await expect(ivo.getByRole('heading', { name: 'Our timeline' })).toBeVisible();
  await expect(ivo.locator('.tl-card__title')).toHaveText(['Our first date']);
  await shot(ivo, '23-timeline');

  // On its anniversary, a milestone comes back on Today.
  const { today } = await call(mae, 'GET', '/timeline');
  await call(mae, 'POST', '/timeline', { kind: 'first-kiss', title: 'Our first kiss', day: `${Number(today.slice(0, 4)) - 4}${today.slice(4)}` });
  await mae.goto('/');
  const anniversary = mae.locator('.timeline-card--anniversary');
  await expect(anniversary).toContainText('4 years ago today');
  await expect(anniversary).toContainText('Our first kiss');
});

test('fill in the blank: a new word each time, sent back or answered, and either can turn it off', async ({ browser }) => {
  const stamp = Date.now();
  const ada = await signInAs(browser, 'Ada', stamp);
  const leo = await signInAs(browser, 'Leo', stamp);
  await pair(ada, leo);

  // On from the start: Ada fills in the blank; Leo answers from the top of Today.
  await ada.goto('/');
  const card = ada.locator('.bootycall');
  await expect(card).toContainText('Send Leo');
  const send = card.getByRole('button', { name: 'Send to Leo' });
  await expect(send).toBeDisabled();
  await card.getByLabel('What to send Leo').fill('a tiny potato');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(ada, '24-blank');
  await send.click();
  await expect(card).toContainText('You sent Leo a tiny potato');
  await leo.goto('/');
  const asked = leo.locator('.bootycall--asked');
  await expect(asked).toContainText('Ada sent you a tiny potato');
  await expect(asked.getByRole('button')).toHaveText(['A tiny potato back', 'Aww', 'Haha', 'Ew']);
  await asked.scrollIntoViewIfNeeded();
  await shot(leo, '24-blank-asked');
  await asked.getByRole('button', { name: 'A tiny potato back' }).click();
  await expect(asked).toHaveCount(0);
  await ada.reload();
  await expect(ada.locator('.bootycall .link-card__title')).toHaveText('A tiny potato');
  await expect(ada.locator('.bootycall')).toContainText('Leo sent a tiny potato back');
  await ada.locator('.bootycall').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(ada, '28-blank-answered');

  // Once it's answered, either of them can send the next one, with a new word: Leo sends one,
  // Ada says aww, and Leo sends another from the blank under her answer, after a shuffle.
  const leos = leo.locator('.bootycall');
  await leos.getByLabel('What to send Ada').fill('a forehead kiss');
  await leos.getByRole('button', { name: 'Send to Ada' }).click();
  await expect(leos).toContainText('You sent Ada a forehead kiss');
  await ada.reload();
  await ada.locator('.bootycall--asked').getByRole('button', { name: 'Aww' }).click();
  await leo.reload();
  await expect(leos).toContainText('Ada said aww');
  await leos.getByRole('button', { name: 'Fill in an idea' }).click();
  await expect(leos.getByLabel('What to send Ada')).not.toHaveValue('');
  await leos.getByLabel('What to send Ada').fill('one sock');
  await leos.getByRole('button', { name: 'Send to Ada' }).click();
  await expect(leos).toContainText('You sent Ada one sock');

  // Either of them can turn it off, which hides it for both.
  await leo.goto('/settings');
  await leo.getByRole('switch', { name: 'Fill in the blank' }).click();
  await expect(leo.getByText('Off. Turn it back on to send and get them again.')).toBeVisible();
  await ada.goto('/settings');
  await expect(ada.getByText('Leo has turned it off, so it’s hidden for now.')).toBeVisible();
  await tab(ada, 'Today').click();
  await expect(ada.locator('.snuggle')).toBeVisible();
  await expect(ada.locator('.bootycall')).toHaveCount(0);
});

test('past midnight, what you’re writing stays on screen, and you can find it again', async ({ browser }) => {
  const stamp = Date.now();
  const rae = await signInAs(browser, 'Rae', stamp);
  const tom = await signInAs(browser, 'Tom', stamp);
  await pair(rae, tom);
  const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const midnight = () => rae.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  // Rae is partway through today's question.
  await rae.goto('/');
  const card = rae.locator('.qcard').first();
  const question = (await card.locator('.qcard__text').textContent())!;
  await rae.getByLabel('Your answer').fill('Half a thought, still going');
  await rae.waitForTimeout(1500); // it reaches the account a second later

  // Midnight passes: the server has a new day and a new question. (Played from the browser's
  // side, since the server's clock can't be moved.)
  const real = await call(rae, 'GET', '/today');
  const other = await call(rae, 'GET', `/questions/${real.question.id === 'love-maps-001' ? 'love-maps-002' : 'love-maps-001'}`);
  await rae.route('**/api/today', (route) => route.fulfill({ json: { ...real, day: nextDay(real.day), question: other.question, state: other.state, streak: 0 } }));
  await midnight();
  await expect(rae.locator('.new-day')).toContainText('It’s past midnight');
  await expect(card.locator('.qcard__text')).toHaveText(question);
  await expect(card.locator('.chip--daily')).toHaveText('Yesterday’s question');
  await expect(rae.getByLabel('Your answer')).toHaveValue('Half a thought, still going');
  await shot(rae, '25-past-midnight');

  // Moving on shows the new question, and the one she started waits on Today.
  await rae.getByRole('button', { name: 'Go to today’s question' }).click();
  await expect(card.locator('.qcard__text')).not.toHaveText(question);
  await expect(rae.getByLabel('Your answer')).toHaveValue('');
  const unfinished = rae.locator('.unfinished-card');
  await expect(unfinished).toContainText('You started an answer');
  await expect(unfinished).toContainText(question);
  await unfinished.click();
  await expect(rae.getByLabel('Your answer')).toHaveValue('Half a thought, still going');

  // The journal holds its day the same way.
  await tab(rae, 'Journal').click();
  await rae.getByLabel('Something good', { exact: true }).fill('A slow morning');
  const journalDay = await call(rae, 'GET', '/journal/today');
  await rae.route('**/api/journal/today', (route) =>
    route.fulfill({ json: { ...journalDay, day: nextDay(journalDay.day), questionId: `${journalDay.questionId.slice(0, -10)}${nextDay(journalDay.day)}` } }),
  );
  await midnight();
  await expect(rae.locator('.new-day')).toContainText('What you’re writing about yesterday is saved');
  await expect(rae.getByLabel('Something good', { exact: true })).toHaveValue('A slow morning');
});

test('drafts: a hard question left for later, found again on Questions, and discarded everywhere', async ({ browser }) => {
  const stamp = Date.now();
  const kit = await signInAs(browser, 'Kit', stamp);
  const lou = await signInAs(browser, 'Lou', stamp);
  await pair(kit, lou);

  // Kit starts an answer and leaves it.
  await kit.goto('/q/love-maps-002');
  const question = (await kit.locator('.qcard__text').textContent())!;
  const saved = kit.waitForResponse((r) => r.url().includes('/drafts/answer') && r.request().method() === 'PUT');
  await kit.getByLabel('Your answer').fill('Still thinking about this one');
  await saved;

  // Questions counts it, and Drafts lists it, with how far it's got but not the text.
  await tab(kit, 'Questions').click();
  const tile = kit.getByRole('link', { name: /^\d+ Drafts?$/ });
  await expect(tile).toHaveText('1 Draft');
  await shot(kit, '26-drafts-tile');
  await tile.click();
  const row = kit.locator('.draft-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(question);
  await expect(row).toContainText('Answer · 5 words · saved just now');
  await expect(row).not.toContainText('Still thinking');
  await shot(kit, '27-drafts');
  await row.getByRole('link').click();
  await expect(kit.getByLabel('Your answer')).toHaveValue('Still thinking about this one');

  // The same account on another device has it too; Lou has none of it.
  const laptop = await signInAs(browser, 'Kit', stamp);
  await laptop.goto('/q/love-maps-002');
  await expect(laptop.getByLabel('Your answer')).toHaveValue('Still thinking about this one');
  await lou.goto('/drafts');
  await expect(lou.getByText('No drafts.')).toBeVisible();

  // Discarded on one device, it's gone from both, and the laptop doesn't send its copy back up.
  await kit.goto('/drafts');
  kit.once('dialog', (dialog) => void dialog.accept());
  await kit.locator('.draft-row').getByRole('button', { name: 'Discard' }).click();
  await expect(kit.getByText('No drafts.')).toBeVisible();
  await tab(kit, 'Questions').click();
  await expect(tile).toHaveText('0 Drafts');
  await laptop.goto('/q/love-maps-002');
  await expect(laptop.getByLabel('Your answer')).toHaveValue('');
  await laptop.waitForTimeout(1500);
  expect((await call(laptop, 'GET', '/drafts')).drafts).toEqual([]);
});

test('self: a private life calendar, a square for every week', async ({ browser }) => {
  const stamp = Date.now();
  const noa = await signInAs(browser, 'Noa', stamp);
  const eli = await signInAs(browser, 'Eli', stamp);
  await pair(noa, eli);

  await noa.goto('/');
  await tab(noa, 'Self').click();
  await expect(noa.getByRole('heading', { name: 'Self' })).toBeVisible();
  await noa.getByRole('link', { name: /^Your life in weeks/ }).click();
  await noa.getByLabel('Your birthday').fill('1990-10-03');
  await noa.getByRole('button', { name: 'Show my life in weeks' }).click();
  await expect(noa.locator('.life-grid rect')).toHaveCount(90 * 52);
  await expect(noa.locator('.life-stats')).toHaveText(/^Week [\d,]+ of 4,680 · age \d+$/);

  // A chapter of life, colored in, and a plan ahead.
  await noa.getByRole('button', { name: 'Add a chapter' }).click();
  await noa.getByLabel('Name').fill('College');
  await noa.getByLabel('Started').fill('2008-08-25');
  await noa.getByLabel('Ended').fill('2012-05-12');
  await noa.getByRole('radio', { name: 'Violet' }).click();
  await noa.getByRole('button', { name: 'Add it' }).click();
  await expect(noa.locator('.chapter-row')).toContainText('College');
  expect(await noa.locator('.life-grid .ch--violet').count()).toBeGreaterThan(150);
  const note = noa.locator('.note-form');
  await note.getByLabel('When').fill('2031-06-01');
  await note.getByLabel('Note').fill('Walk the Camino');
  await note.getByRole('button', { name: 'Add note' }).click();
  await expect(noa.locator('.life-notes')).toContainText('Walk the Camino');
  await noa.evaluate(() => window.scrollTo(0, 0));
  await shot(noa, '29-self-life');

  // This year, week by week, with a note on this week.
  await noa.getByRole('link', { name: 'Open this year' }).click();
  await expect(noa.locator('.lyw')).toHaveCount(52);
  await expect(noa.locator('.lyw--now')).toHaveCount(1);
  const week = noa.locator('.life-week');
  await week.getByLabel('Note').fill('Started a life calendar');
  await week.getByRole('button', { name: 'Add note' }).click();
  await expect(week.locator('.life-note')).toContainText('Started a life calendar');
  await shot(noa, '30-self-year');

  // Self sums it up.
  await tab(noa, 'Self').click();
  await expect(noa.getByRole('link', { name: /^Your life in weeks/ })).toContainText(/Week [\d,]+ of 4,680 · 1 chapter · 1 ahead/);
  await shot(noa, '31-self');

  // Eli has none of it.
  await eli.goto('/self/life');
  await expect(eli.getByLabel('Your birthday')).toBeVisible();
  await expect(eli.getByText('College')).toHaveCount(0);

  // Settings is one tap from Self, and Self stays lit there.
  await openSettings(noa);
  await expect(noa.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(tab(noa, 'Self')).toHaveAttribute('aria-current', 'page');
});

test('self: the Big Five, private unless shared', async ({ browser }) => {
  const stamp = Date.now();
  const ivy = await signInAs(browser, 'Ivy', stamp);
  const jon = await signInAs(browser, 'Jon', stamp);
  await pair(ivy, jon);

  await ivy.goto('/');
  await openSelf(ivy);
  await ivy.getByRole('link', { name: /^Your personality/ }).click();
  await ivy.getByRole('button', { name: 'Begin' }).click();
  const count = ivy.locator('.take .eyebrow');
  const accurate = ivy.getByRole('radio', { name: 'Moderately accurate' });
  for (let i = 0; i < 3; i++) {
    await expect(count).toHaveText(`${i + 1} of 50`);
    await accurate.click();
  }
  await shot(ivy, '32-big-five-take');

  // Answers stay on the device until the last one, so a reload picks up where it left off.
  await ivy.reload();
  for (let i = 3; i < 50; i++) {
    await expect(count).toHaveText(`${i + 1} of 50`);
    await accurate.click();
  }
  expect((await call(ivy, 'GET', '/self/questionnaires')).mine).toEqual([]);
  await ivy.getByRole('button', { name: 'See your scores' }).click();

  // Every statement answered "Moderately accurate": the reversed ones count as 2, the rest as 4.
  await expect(ivy.getByRole('heading', { name: 'Your personality' })).toBeVisible();
  await expect(ivy.locator('.trait__score')).toHaveText(['30', '32', '32', '24', '34']);
  await expect(ivy.getByRole('img', { name: /^Extraversion: 30/ })).toBeVisible();
  await shot(ivy, '33-big-five');

  // Jon sees none of it until Ivy shares.
  expect((await call(jon, 'GET', '/self/questionnaires')).partner).toEqual([]);
  await jon.goto('/self');
  await expect(jon.getByRole('link', { name: /^Your personality/ })).toContainText('50 short statements');
  await expect(jon.getByText('Ivy’s personality')).toHaveCount(0);

  const share = ivy.getByRole('switch', { name: 'Share with Jon' });
  await expect(share).toHaveAttribute('aria-checked', 'false');
  await share.click();
  await expect(share).toHaveAttribute('aria-checked', 'true');
  await tab(ivy, 'Self').click();
  await expect(ivy.getByRole('link', { name: /^Your personality/ })).toContainText('shared with Jon');

  // Then only the latest scores, never the answers. Self links straight to them, past Jon's own.
  await call(jon, 'POST', '/self/questionnaires/big-five', { answers: Array(50).fill(3) });
  await jon.reload();
  await jon.getByRole('link', { name: /^Ivy’s personality/ }).click();
  await expect(jon.locator('#partner')).toBeInViewport();
  await expect(jon.locator('#partner .trait__score')).toHaveText(['30', '32', '32', '24', '34']);
  await shot(jon, '34-big-five-partner');
  const [theirs] = (await call(jon, 'GET', '/self/questionnaires')).partner;
  expect(Object.keys(theirs).sort()).toEqual(['createdAt', 'instrument', 'scores']);

  // Taken again, it shows what changed, and every result can be deleted.
  await call(ivy, 'POST', '/self/questionnaires/big-five', { answers: Array(50).fill(5) });
  await ivy.goto('/self/big-five');
  await expect(ivy.locator('.trait__score')).toHaveText(['30', '34 +2 since last time', '34 +2 since last time', '18 −6 since last time', '38 +4 since last time']);
  await expect(ivy.locator('.result-row')).toHaveCount(2);
  ivy.once('dialog', (dialog) => void dialog.accept());
  await ivy.locator('.result-row').first().getByRole('button').click();
  await expect(ivy.locator('.result-row')).toHaveCount(1);
  await expect(ivy.locator('.trait__score')).toHaveText(['30', '32', '32', '24', '34']);

  // Turned off, Jon sees nothing again.
  await share.click();
  await expect(share).toHaveAttribute('aria-checked', 'false');
  expect((await call(jon, 'GET', '/self/questionnaires')).partner).toEqual([]);

  // The last result can go too.
  ivy.once('dialog', (dialog) => void dialog.accept());
  await ivy.locator('.result-row').getByRole('button').click();
  await expect(ivy.getByRole('link', { name: 'Start' })).toBeVisible();
  await expect(share).toHaveCount(0);
});

test('self: a check-in on anxiety and mood, private unless shared', async ({ browser }) => {
  const stamp = Date.now();
  const uma = await signInAs(browser, 'Uma', stamp);
  const ted = await signInAs(browser, 'Ted', stamp);
  await pair(uma, ted);

  await uma.goto('/');
  await openSelf(uma);
  await uma.getByRole('link', { name: /^How you’ve been/ }).click();
  await expect(uma.getByRole('link', { name: '988lifeline.org' })).toBeVisible();
  await uma.getByRole('button', { name: 'Begin' }).click();
  const count = uma.locator('.take .eyebrow');
  for (let i = 0; i < 15; i++) {
    await expect(count).toHaveText(`${i + 1} of 15`);
    if (i === 7) {
      // The PHQ-8 has its own question, as printed on its form.
      await expect(uma.locator('.take__prompt')).toHaveText('Over the last 2 weeks, how often have you been bothered by any of the following problems?');
      await shot(uma, '35-check-in-take');
    }
    await uma.getByRole('radio', { name: i < 7 ? 'More than half the days' : 'Several days' }).click();
  }
  await uma.getByRole('button', { name: 'See your scores' }).click();

  // Seven anxiety questions at 2 make 14; eight mood questions at 1 make 8.
  const scores = uma.locator('.check-in .trait__score');
  await expect(scores).toHaveText(['14 Moderate', '8 Mild']);
  await expect(uma.locator('.check-in__closer')).toContainText('talk with a doctor or counselor');
  await expect(uma.getByRole('link', { name: '988lifeline.org' })).toBeVisible();
  await shot(uma, '36-check-in');

  // Checked in again, it shows what changed, and both scores over time.
  await call(uma, 'POST', '/self/questionnaires/check-in', { answers: Array(15).fill(0) });
  await uma.reload();
  await expect(scores).toHaveText(['0 Minimal', '0 Minimal']);
  await expect(uma.locator('.check-in .trait__ends').first()).toContainText('−14 since last time');
  await expect(uma.locator('.check-in__closer')).toHaveCount(0);
  await expect(uma.locator('.trend__chart')).toHaveCount(2);
  const readout = uma.locator('.trend__readout');
  await expect(readout).toContainText('anxiety 0, low mood 0');
  await uma.locator('.trend__chart svg').first().focus();
  await uma.keyboard.press('ArrowLeft');
  await expect(readout).toContainText('anxiety 14, low mood 8');
  await expect(uma.locator('.result-row')).toHaveCount(2);
  await shot(uma, '37-check-in-trend');

  // Ted sees none of it until Uma shares, and then only her latest scores.
  expect((await call(ted, 'GET', '/self/questionnaires')).partner).toEqual([]);
  const share = uma.getByRole('switch', { name: 'Share with Ted' });
  await share.click();
  await expect(share).toHaveAttribute('aria-checked', 'true');
  await ted.goto('/self');
  await ted.getByRole('link', { name: /^Uma’s check-in/ }).click();
  await expect(ted.locator('#partner .trait__score')).toHaveText(['0 Minimal', '0 Minimal']);
  await expect(ted.locator('#partner')).toBeInViewport();
  await shot(ted, '38-check-in-partner');
});

