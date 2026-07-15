/**
 * Automate Squarespace DNS so lanehollingsworth.com points at Vercel.
 *
 * Required env vars (put in /workspace/.env — never commit this file):
 *   SQUARESPACE_EMAIL=
 *   SQUARESPACE_PASSWORD=
 *
 * Optional:
 *   HEADLESS=false          # watch the browser (default true)
 *   DOMAIN=lanehollingsworth.com
 *   VERCEL_A=76.76.21.21
 *   VERCEL_WWW_CNAME=cname.vercel-dns.com
 *
 * Run:
 *   npm run dns:squarespace
 *
 * If you use 2FA on Squarespace, this script will pause and fail with a
 * screenshot — turn 2FA off temporarily or complete DNS once by hand.
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const email = process.env.SQUARESPACE_EMAIL;
const password = process.env.SQUARESPACE_PASSWORD;
const domain = process.env.DOMAIN || 'lanehollingsworth.com';
const vercelA = process.env.VERCEL_A || '76.76.21.21';
const vercelWww = process.env.VERCEL_WWW_CNAME || 'cname.vercel-dns.com';
const headless = process.env.HEADLESS !== 'false';
const outDir = path.resolve('scripts/output');

function requireEnv() {
  if (!email || !password) {
    console.error(`
Missing Squarespace credentials.

Create /workspace/.env with:

  SQUARESPACE_EMAIL=you@example.com
  SQUARESPACE_PASSWORD=your-password

Then run: npm run dns:squarespace
`);
    process.exit(1);
  }
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot: ${file}`);
}

async function clickFirst(page, selectors, label) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 4000 });
        console.log(`Clicked ${label} via: ${selector}`);
        return true;
      } catch {
        // try next
      }
    }
  }
  return false;
}

async function fillFirst(page, selectors, value, label) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.fill(value);
      console.log(`Filled ${label}`);
      return true;
    }
  }
  return false;
}

async function login(page) {
  console.log('Opening Squarespace login…');
  await page.goto('https://login.squarespace.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await fillFirst(
    page,
    [
      'input[type="email"]',
      'input[name="email"]',
      'input[autocomplete="username"]',
      '#email',
    ],
    email,
    'email',
  );

  // Some Squarespace flows are email-first
  await clickFirst(
    page,
    [
      'button:has-text("Continue")',
      'button[type="submit"]',
      'button:has-text("Log In")',
      'button:has-text("Sign In")',
    ],
    'continue/login',
  );

  await page.waitForTimeout(1500);

  await fillFirst(
    page,
    [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      '#password',
    ],
    password,
    'password',
  );

  await clickFirst(
    page,
    [
      'button[type="submit"]',
      'button:has-text("Log In")',
      'button:has-text("Sign In")',
      'button:has-text("Continue")',
    ],
    'submit login',
  );

  await page.waitForTimeout(4000);
  await shot(page, '01-after-login');

  const body = (await page.textContent('body').catch(() => '')) || '';
  if (/verification|two-factor|authenticator|enter code|2fa/i.test(body)) {
    throw new Error(
      'Squarespace is asking for 2FA / verification. Complete that in a normal browser, or temporarily disable 2FA, then re-run.',
    );
  }
}

async function openDomainDns(page) {
  console.log('Opening Domains…');
  await page.goto('https://account.squarespace.com/domains', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);
  await shot(page, '02-domains-list');

  // Click the domain row / link
  const domainClicked = await clickFirst(
    page,
    [
      `a:has-text("${domain}")`,
      `text=${domain}`,
      `[href*="${domain}"]`,
    ],
    'domain',
  );

  if (!domainClicked) {
    // Try domains.squarespace.com
    await page.goto(`https://domains.squarespace.com/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
    await clickFirst(page, [`a:has-text("${domain}")`, `text=${domain}`], 'domain alt');
  }

  await page.waitForTimeout(2500);
  await shot(page, '03-domain-detail');

  const dnsOpened = await clickFirst(
    page,
    [
      'a:has-text("DNS")',
      'button:has-text("DNS")',
      'a:has-text("DNS Settings")',
      'button:has-text("DNS Settings")',
      'text=DNS Settings',
      'text=DNS records',
      '[href*="dns"]',
    ],
    'DNS settings',
  );

  if (!dnsOpened) {
    // Direct-ish URLs used by some Squarespace domain UIs
    const candidates = [
      `https://account.squarespace.com/domains/managed/${domain}/dns`,
      `https://domain-management.squarespace.com/domains/${domain}/dns`,
    ];
    for (const url of candidates) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);
        const t = (await page.textContent('body')) || '';
        if (/DNS|Records|CNAME|Host/i.test(t)) break;
      } catch {
        // continue
      }
    }
  }

  await page.waitForTimeout(2000);
  await shot(page, '04-dns-panel');
}

async function upsertRecords(page) {
  console.log('Ensuring Vercel DNS records…');

  // Prefer "Custom records" area if present
  await clickFirst(
    page,
    [
      'button:has-text("Add record")',
      'button:has-text("Add Record")',
      'a:has-text("Add record")',
      'button:has-text("Add")',
    ],
    'add record opener',
  ).catch(() => false);

  await shot(page, '05-before-edit');

  /**
   * Squarespace’s DNS UI varies. We try a structured form flow; if selectors
   * fail, screenshots in scripts/output/ show exactly what the page looks like
   * so we can adjust quickly.
   */
  async function addRecord({ type, host, data }) {
    console.log(`Adding ${type} ${host} -> ${data}`);

    await clickFirst(
      page,
      [
        'button:has-text("Add record")',
        'button:has-text("Add Record")',
        'button:has-text("Add")',
      ],
      `add ${type}`,
    );

    await page.waitForTimeout(800);

    // Type dropdown
    const typeSelect = page.locator('select').filter({ hasText: /A|CNAME|MX/i }).first();
    if (await typeSelect.count()) {
      await typeSelect.selectOption({ label: type }).catch(async () => {
        await typeSelect.selectOption(type);
      });
    } else {
      await clickFirst(page, [`text=${type}`, `button:has-text("${type}")`], `${type} type`);
    }

    // Host / Name
    await fillFirst(
      page,
      [
        'input[name="host"]',
        'input[placeholder*="Host" i]',
        'input[aria-label*="Host" i]',
        'input[name="name"]',
        'input[placeholder="@"]',
      ],
      host,
      'host',
    );

    // Data / Points to
    await fillFirst(
      page,
      [
        'input[name="data"]',
        'input[name="value"]',
        'input[placeholder*="Points" i]',
        'input[aria-label*="Data" i]',
        'input[aria-label*="Value" i]',
        'input[placeholder*="Value" i]',
      ],
      data,
      'value',
    );

    await clickFirst(
      page,
      [
        'button:has-text("Save")',
        'button:has-text("Add")',
        'button[type="submit"]',
      ],
      `save ${type}`,
    );

    await page.waitForTimeout(1500);
  }

  // Remove conflicting apex A / www CNAME if UI exposes delete near those rows
  const bodyText = (await page.textContent('body')) || '';
  console.log('DNS panel text sample:', bodyText.slice(0, 400).replace(/\s+/g, ' '));

  const hasApex = bodyText.includes(vercelA);
  const hasWww =
    bodyText.includes(vercelWww) || bodyText.includes('cname.vercel-dns.com');

  if (!hasApex) {
    await addRecord({ type: 'A', host: '@', data: vercelA });
  } else {
    console.log('Apex A record already mentions Vercel IP — leaving as-is.');
  }

  if (!hasWww) {
    await addRecord({ type: 'CNAME', host: 'www', data: vercelWww });
  } else {
    console.log('www CNAME already mentions Vercel — leaving as-is.');
  }

  await shot(page, '06-after-edit');
}

async function main() {
  requireEnv();
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await login(page);
    await openDomainDns(page);
    await upsertRecords(page);
    console.log(`
Done attempting DNS update for ${domain}.

Expected records:
  A     @    ${vercelA}
  CNAME www  ${vercelWww}

Wait 15–60 minutes, then visit https://${domain}
Screenshots saved under scripts/output/
`);
  } catch (err) {
    await shot(page, 'error');
    console.error('\nDNS automation failed:', err.message || err);
    console.error('See scripts/output/error.png for the page state.');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
