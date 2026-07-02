// Live test: Visit Swimming Pool page and report ALL slot cards exactly as they appear
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { decryptText } from '../lib/encrypt.js';

const prisma = new PrismaClient();
const tasks = await prisma.task.findMany({ where: { enabled: true } });
const task = tasks[0];
await prisma.$disconnect();

const browser = await chromium.launch({ headless: false }); // visible so you can see it
const page = await browser.newPage();
page.setDefaultTimeout(15000);

console.log('Logging in...');
await page.goto('https://sports.mitwpu.edu.in/login');
await page.waitForLoadState('networkidle');

const pw = decryptText(task.password);
await page.locator('input[type="email"], input[type="text"]').first().fill(task.username);
await page.locator('input[type="password"]').first().fill(pw);
await page.locator('button[type="submit"], button:has-text("Login")').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
console.log('Logged in, now at:', page.url());

// Go to sports listing
await page.goto('https://sports.mitwpu.edu.in/sports');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Search Swimming Pool
const sb = page.locator('input[placeholder*="Search" i]').first();
if (await sb.count()) {
  await sb.fill('Swimming Pool');
  await page.waitForTimeout(2000);
}

// Click on the Swimming Pool card to expand it
const poolCard = page.locator('h2:has-text("Swimming Pool"), h3:has-text("Swimming Pool"), [class*="card"]:has-text("Swimming Pool")').first();
if (await poolCard.count()) {
  await poolCard.click();
  await page.waitForTimeout(2000);
}

// Screenshot the current state
await page.screenshot({ path: 'screenshots/pool-slots-now.png', fullPage: true });
console.log('Screenshot saved: screenshots/pool-slots-now.png');

// Get all View Spots buttons and their parent card text
const buttons = page.locator('button:has-text("View Spots"), a:has-text("View Spots")');
const count = await buttons.count();
console.log(`\nFound ${count} View Spots buttons:\n`);

for (let i = 0; i < count; i++) {
  const btn = buttons.nth(i);
  const cardEl = btn.locator('xpath=./ancestor::div[contains(@class,"border") or contains(@class,"rounded") or contains(@class,"card")][1]');
  const text = (await cardEl.innerText().catch(() => 'N/A')).replace(/\s+/g, ' ').trim();
  const disabled = await btn.isDisabled().catch(() => false);
  console.log(`Card ${i+1}:`);
  console.log(`  Text: "${text}"`);
  console.log(`  Button disabled: ${disabled}`);
  console.log();
}

console.log('\nBrowser will stay open for 30 seconds so you can inspect...');
await page.waitForTimeout(30000);
await browser.close();
