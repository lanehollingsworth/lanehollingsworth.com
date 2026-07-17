/**
 * Automate Squarespace DNS so lanehollingsworth.com points at Vercel.
 *
 * Required in /.env (never commit):
 *   SQUARESPACE_EMAIL=
 *   SQUARESPACE_PASSWORD=
 *
 * Optional:
 *   DOMAIN=lanehollingsworth.com   (or DOMAIN_NAME)
 *   VERCEL_A=76.76.21.21
 *   VERCEL_WWW_CNAME=cname.vercel-dns.com
 *   HEADLESS=false
 *   VERCEL_TOKEN=                  # optional: confirm domain config via Vercel API
 *
 * Run: npm run dns:squarespace
 * Check only: npm run dns:check
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';

const email = process.env.SQUARESPACE_EMAIL;
const password = process.env.SQUARESPACE_PASSWORD;
const domain = process.env.DOMAIN || process.env.DOMAIN_NAME || 'lanehollingsworth.com';
const vercelA = process.env.VERCEL_A || '76.76.21.21';
const vercelWww = process.env.VERCEL_WWW_CNAME || 'cname.vercel-dns.com';
const headless = process.env.HEADLESS !== 'false';
const vercelToken = process.env.VERCEL_TOKEN;
const outDir = path.resolve('scripts/output');
const checkOnly = process.argv.includes('--check-only');

function requireEnv() {
  if (checkOnly) return;
  if (!email || !password) {
    console.error(`
Missing Squarespace credentials.

Create /workspace/.env with:

  SQUARESPACE_EMAIL=you@example.com
  SQUARESPACE_PASSWORD=your-password
  DOMAIN_NAME=lanehollingsworth.com

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
  const looks2fa = /verification|two-factor|authenticator|enter code|2fa|one-time/i.test(
    body,
  );

  if (looks2fa) {
    if (headless) {
      throw new Error(
        'Squarespace is asking for 2FA. Re-run with HEADLESS=false so you can type the code, or disable 2FA temporarily.',
      );
    }
    console.log(
      '2FA detected — enter the code in the browser window. Waiting up to 2 minutes…',
    );
    await page
      .waitForFunction(
        () =>
          !/verification|two-factor|authenticator|enter code|2fa/i.test(
            document.body?.innerText || '',
          ),
        null,
        { timeout: 120000 },
      )
      .catch(() => {
        throw new Error('Timed out waiting for 2FA to be completed.');
      });
    await shot(page, '01b-after-2fa');
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

  const domainClicked = await clickFirst(
    page,
    [`a:has-text("${domain}")`, `text=${domain}`, `[href*="${domain}"]`],
    'domain',
  );

  if (!domainClicked) {
    await page.goto('https://domains.squarespace.com/', {
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

async function deleteConflictingRows(page) {
  console.log('Looking for conflicting @ A / www CNAME rows to remove…');

  // Prefer rows that look like DNS table entries containing A/@ or CNAME/www
  // but NOT already pointing at Vercel targets.
  const rowSelectors = [
    'tr',
    '[role="row"]',
    'li',
    'div[class*="record" i]',
    'div[class*="Record" i]',
  ];

  let deleted = 0;

  for (const rowSel of rowSelectors) {
    const rows = page.locator(rowSel);
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = ((await row.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
      if (!text || text.length > 400) continue;

      const isApexA =
        /\bA\b/.test(text) &&
        /(^|\s)@(\s|$)/.test(text) &&
        !text.includes(vercelA);
      const isWwwCname =
        /CNAME/i.test(text) &&
        /\bwww\b/i.test(text) &&
        !/cname\.vercel-dns\.com/i.test(text);

      if (!isApexA && !isWwwCname) continue;

      const deleteBtn = row
        .locator(
          'button:has-text("Delete"), button:has-text("Remove"), button[aria-label*="Delete" i], button[aria-label*="Remove" i], [data-test*="delete" i]',
        )
        .first();

      if (!(await deleteBtn.count())) continue;

      console.log(`Deleting conflicting row: ${text.slice(0, 120)}`);
      await deleteBtn.click({ timeout: 3000 }).catch(() => null);
      await page.waitForTimeout(500);
      await clickFirst(
        page,
        [
          'button:has-text("Confirm")',
          'button:has-text("Delete")',
          'button:has-text("Remove")',
          'button:has-text("Yes")',
        ],
        'confirm delete',
      );
      await page.waitForTimeout(1000);
      deleted += 1;
    }
  }

  console.log(`Deleted ${deleted} conflicting row(s) (0 is OK if UI hid delete controls).`);
  await shot(page, '05-after-deletes');
}

async function addRecord(page, { type, host, data }) {
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

  const typeSelect = page.locator('select').filter({ hasText: /A|CNAME|MX/i }).first();
  if (await typeSelect.count()) {
    await typeSelect.selectOption({ label: type }).catch(async () => {
      await typeSelect.selectOption(type);
    });
  } else {
    await clickFirst(page, [`text=${type}`, `button:has-text("${type}")`], `${type} type`);
  }

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
    ['button:has-text("Save")', 'button:has-text("Add")', 'button[type="submit"]'],
    `save ${type}`,
  );

  await page.waitForTimeout(1500);
}

async function upsertRecords(page) {
  console.log('Ensuring Vercel DNS records…');
  await deleteConflictingRows(page);

  const bodyText = (await page.textContent('body')) || '';
  console.log('DNS panel text sample:', bodyText.slice(0, 400).replace(/\s+/g, ' '));

  const hasApex = bodyText.includes(vercelA);
  const hasWww =
    bodyText.includes(vercelWww) || bodyText.includes('cname.vercel-dns.com');

  if (!hasApex) {
    await addRecord(page, { type: 'A', host: '@', data: vercelA });
  } else {
    console.log('Apex A already points at Vercel IP — leaving as-is.');
  }

  if (!hasWww) {
    await addRecord(page, { type: 'CNAME', host: 'www', data: vercelWww });
  } else {
    console.log('www CNAME already points at Vercel — leaving as-is.');
  }

  await clickFirst(
    page,
    ['button:has-text("Save")', 'button:has-text("Save Changes")'],
    'final save',
  ).catch(() => false);

  await shot(page, '06-after-edit');
}

async function checkPublicDns() {
  console.log(`\nChecking public DNS for ${domain}…`);
  const result = {
    a: [],
    www: [],
    okA: false,
    okWww: false,
    httpApex: null,
    httpWww: null,
    vercelApp: null,
  };

  try {
    result.a = await dns.resolve4(domain);
  } catch (err) {
    console.log(`A ${domain}: not resolving (${err.code || err.message})`);
  }

  try {
    const cnames = await dns.resolveCname(`www.${domain}`);
    result.www = cnames;
  } catch {
    try {
      result.www = await dns.resolve4(`www.${domain}`);
    } catch (err) {
      console.log(`www.${domain}: not resolving (${err.code || err.message})`);
    }
  }

  result.okA = result.a.includes(vercelA) || result.a.includes('76.76.21.21');
  result.okWww = result.www.some((v) =>
    String(v).toLowerCase().includes('vercel-dns'),
  );

  console.log(`A records: ${result.a.join(', ') || '(none)'}`);
  console.log(`www records: ${result.www.join(', ') || '(none)'}`);
  console.log(`A looks like Vercel: ${result.okA}`);
  console.log(`www looks like Vercel: ${result.okWww}`);

  for (const [label, url] of [
    ['apex', `https://${domain}/`],
    ['www', `https://www.${domain}/`],
    ['vercelApp', 'https://lanehollingsworth-com.vercel.app/'],
  ]) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      result[label === 'apex' ? 'httpApex' : label === 'www' ? 'httpWww' : 'vercelApp'] =
        res.status;
      console.log(`HTTP ${label}: ${res.status}`);
    } catch (err) {
      console.log(`HTTP ${label}: fail (${err.message})`);
    }
  }

  if (vercelToken) {
    try {
      const teams = await fetch('https://api.vercel.com/v2/teams', {
        headers: { Authorization: `Bearer ${vercelToken}` },
      }).then((r) => r.json());
      const team = (teams.teams || []).find((t) => t.slug === 'lanehollingsworth');
      const teamQs = team ? `?teamId=${team.id}` : '';
      const config = await fetch(
        `https://api.vercel.com/v6/domains/${domain}/config${teamQs}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } },
      ).then((r) => r.json());
      console.log(
        `Vercel domain misconfigured: ${config.misconfigured === true ? 'yes' : 'no'}`,
      );
      if (config.nameservers) {
        console.log(`Current nameservers: ${config.nameservers.join(', ')}`);
      }
    } catch (err) {
      console.log(`Vercel API check skipped/failed: ${err.message}`);
    }
  }

  return result;
}

async function main() {
  requireEnv();
  await mkdir(outDir, { recursive: true });

  if (checkOnly) {
    await checkPublicDns();
    return;
  }

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
Squarespace DNS update attempted for ${domain}.

Expected records:
  A     @    ${vercelA}
  CNAME www  ${vercelWww}
`);
  } catch (err) {
    await shot(page, 'error');
    console.error('\nDNS automation failed:', err.message || err);
    console.error('See scripts/output/error.png for the page state.');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }

  await checkPublicDns();
  console.log('\nScreenshots: scripts/output/');
  console.log('Re-check anytime with: npm run dns:check');
}

main();
