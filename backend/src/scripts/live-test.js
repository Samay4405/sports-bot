// Check the CURRENT state of all Swimming Pool slots to understand booking window
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { decryptText } from '../lib/encrypt.js';

const prisma = new PrismaClient();
const [task] = await prisma.task.findMany({ where: { enabled: true } });
await prisma.$disconnect();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);

await page.goto('https://sports.mitwpu.edu.in/login');
await page.waitForLoadState('networkidle');
await page.locator('input[type="email"], input[type="text"]').first().fill(task.username);
await page.locator('input[type="password"]').first().fill(decryptText(task.password));
await page.locator('button[type="submit"]').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

await page.goto('https://sports.mitwpu.edu.in/sports');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

const sb = page.locator('input[placeholder*="Search" i]').first();
await sb.fill('Swimming Pool');
await page.waitForTimeout(2000);

await page.locator('button:has-text("View Slots"), a:has-text("View Slots")').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
console.log(`\nChecked at IST: ${now}`);
console.log(`URL: ${page.url()}\n`);

const btns = page.locator('button:has-text("View Spots"), a:has-text("View Spots")');
const count = await btns.count();
console.log(`Found ${count} slot cards:\n`);

for (let i = 0; i < count; i++) {
  const btn = btns.nth(i);
  await btn.scrollIntoViewIfNeeded().catch(() => null);
  const card = btn.locator('xpath=./ancestor::div[contains(@class,"border") or contains(@class,"rounded")][1]');
  const text = (await card.innerText().catch(() => 'N/A')).replace(/\s+/g, ' ').trim();
  const disabled = await btn.isDisabled().catch(() => null);
  const status = disabled ? '🔴 DISABLED' : '🟢 ENABLED';
  console.log(`Slot ${i+1}: ${status}`);
  console.log(`  "${text}"\n`);
}

await browser.close();
