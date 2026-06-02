import { chromium } from "playwright";
import fs from "fs/promises";

async function dumpDom() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto("https://sports.mitwpu.edu.in/login");
  await page.fill('input[type="email"]', "samay.gandhi@mitwpu.edu.in");
  await page.fill('input[type="password"]', "Test@@0000");
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(3000);
  
  await page.goto("https://sports.mitwpu.edu.in/sports/d3c367fa-31c3-425c-bc4c-84c709d28a6b/slots");
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  await fs.writeFile("carrom-slots.html", html);
  
  await browser.close();
}
dumpDom();
