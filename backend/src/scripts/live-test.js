// Check what Swimming Pool slot cards exist on the page - uses same nav as bot
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { decryptText } from '../lib/encrypt.js';

const prisma = new PrismaClient();
const allTasks = await prisma.task.findMany({ where: { enabled: true } });
await prisma.$disconnect();
const task = allTasks[0];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setDefaultTimeout(20000);

console.log('Logging in with:', task.username);
await page.goto('https://sports.mitwpu.edu.in/login');
await page.waitForLoadState('networkidle');

await page.locator('input[type="email"], input[type="text"]').first().fill(task.username);
await page.locator('input[type="password"]').first().fill(decryptText(task.password));
await page.locator('button[type="submit"], button:has-text("Login")').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
console.log('Logged in:', page.url());

// Go to sports listing
await page.goto('https://sports.mitwpu.edu.in/sports');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Search Swimming Pool
const sb = page.locator('input[placeholder*="Search" i]').first();
await sb.waitFor({ timeout: 15000 });
await sb.fill('Swimming Pool');
await page.waitForTimeout(2000);

// Click "View Slots" on the sport card (not a slot card - this is the sport-level button)
const viewSlotsBtn = page.locator('button:has-text("View Slots"), a:has-text("View Slots")').first();
if (await viewSlotsBtn.count()) {
  console.log('Clicking "View Slots" on sport card...');
  await viewSlotsBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Now at:', page.url());
}

// NOW get all View Spots buttons (slot-level)
const btns = page.locator('button:has-text("View Spots"), a:has-text("View Spots")');
const count = await btns.count();
console.log(`\nFound ${count} time slot cards:\n`);

for (let i = 0; i < count; i++) {
  const btn = btns.nth(i);
  const card = btn.locator('xpath=./ancestor::div[contains(@class,"border") or contains(@class,"rounded") or contains(@class,"card")][1]');
  const text = (await card.innerText().catch(() => 'N/A')).replace(/\s+/g, ' ').trim();
  const disabled = await btn.isDisabled().catch(() => null);
  console.log(`Slot ${i + 1}: "${text}"`);
  console.log(`  Button disabled: ${disabled}\n`);
}

// Take full page screenshot
await page.screenshot({ path: 'screenshots/pool-slots-now.png', fullPage: true });
console.log('Screenshot saved: screenshots/pool-slots-now.png');
console.log('\nBrowser open 60s for inspection...');
await page.waitForTimeout(60000);
await browser.close();
