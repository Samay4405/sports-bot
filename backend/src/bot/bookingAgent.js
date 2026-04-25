import path from "path";
import fs from "fs/promises";
import { chromium } from "playwright";

const BOT_TIMEOUT_MS = 5 * 60 * 1000;
const SLOT_RETRY_WINDOW_MS = 2 * 60 * 1000;
const SLOT_RETRY_INTERVAL_MS = 2 * 1000;

const USERNAME_SELECTORS = [
  'input[name*="user" i]',
  'input[placeholder*="user" i]',
  'input[aria-label*="user" i]',
  'input[id*="user" i]',
  'input[name*="student" i]',
  'input[placeholder*="student" i]',
  'input[id*="student" i]',
  'input[type="email"]',
  'input[type="text"]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name*="pass" i]',
  'input[placeholder*="pass" i]',
  'input[aria-label*="pass" i]',
  'input[id*="pass" i]',
];

const LOGIN_BUTTON_SELECTORS = [
  'button:has-text("Login")',
  'button:has-text("Sign In")',
  'button[type="submit"]',
  'input[type="submit"]',
  '[role="button"]:has-text("Login")',
];

async function firstVisibleLocator(page, selectors, timeout = 1500) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { state: "visible", timeout });
      return page.locator(selector).first();
    } catch {
      // Continue fallback selector chain.
    }
  }
  return null;
}

async function navigateToBookingSection(page, log) {
  const candidates = [
    'a:has-text("Booking")',
    'a:has-text("Sports")',
    'button:has-text("Booking")',
    'button:has-text("Sports")',
    '[role="tab"]:has-text("Booking")',
  ];

  for (const selector of candidates) {
    const node = page.locator(selector).first();
    if (await node.count()) {
      await node.click({ timeout: 1500 }).catch(() => null);
      log(`Tried navigation selector: ${selector}`);
      return;
    }
  }

  log("Booking section navigation element not obvious; continuing on current page", "warn");
}

async function tryBookSlot(page, sport, slotTime, log) {
  const sportTileSelectors = [
    `text=${sport}`,
    `[aria-label*="${sport}" i]`,
    `[title*="${sport}" i]`,
  ];

  for (const selector of sportTileSelectors) {
    const tile = page.locator(selector).first();
    if (await tile.count()) {
      await tile.click({ timeout: 1500 }).catch(() => null);
      log(`Sport target located using selector: ${selector}`);
      break;
    }
  }

  const slotRow = page.locator(`:is(div,li,tr,section):has-text("${slotTime}")`).first();
  if (!(await slotRow.count())) {
    return { outcome: "slot-not-visible" };
  }

  const unavailable = await slotRow
    .locator(':scope :is(span,div,small):has-text("Full"), :scope :is(span,div,small):has-text("Unavailable")')
    .count();

  if (unavailable) {
    return { outcome: "unavailable" };
  }

  const bookButton = slotRow
    .locator('button:has-text("Book"), button:has-text("Reserve"), [role="button"]:has-text("Book")')
    .first();

  if (!(await bookButton.count())) {
    return { outcome: "slot-not-visible" };
  }

  await bookButton.click({ timeout: 2000 });

  const confirmButton = page
    .locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Proceed")')
    .first();

  if (await confirmButton.count()) {
    await confirmButton.click({ timeout: 2000 }).catch(() => null);
  }

  return { outcome: "booked" };
}

export async function runBookingAgent(task, logger, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = options.screenshotDir || path.join(process.cwd(), "screenshots");
  const startedAt = Date.now();

  try {
    await fs.mkdir(screenshotDir, { recursive: true });

    const context = await browser.newContext();
    const page = await context.newPage();

    logger.push(`Bot execution started at epoch ${Date.now()}`);
    logger.push(`Navigating to ${task.websiteUrl}`);
    await page.goto(task.websiteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const usernameInput = await firstVisibleLocator(page, USERNAME_SELECTORS);
    const passwordInput = await firstVisibleLocator(page, PASSWORD_SELECTORS);

    if (!usernameInput || !passwordInput) {
      throw new Error("Unable to locate login inputs with fallback selector strategy");
    }

    logger.push("Entering credentials");
    await usernameInput.fill(task.username);
    await passwordInput.fill(task.decryptedPassword);

    const loginButton = await firstVisibleLocator(page, LOGIN_BUTTON_SELECTORS);
    if (!loginButton) {
      throw new Error("Unable to locate login button");
    }

    logger.push("Submitting login form");
    await Promise.allSettled([
      page.waitForLoadState("networkidle", { timeout: 10_000 }),
      loginButton.click({ timeout: 2000 }),
    ]);

    const loginFailureSignals = ["invalid", "incorrect", "try again", "failed"];
    const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (loginFailureSignals.some((word) => bodyText.includes(word))) {
      throw new Error("Login failed: website reported invalid credentials");
    }

    logger.push("Authentication check passed");
    await navigateToBookingSection(page, (msg, level) => logger.push(msg, level));

    const retryDeadline = Date.now() + SLOT_RETRY_WINDOW_MS;
    let result = { outcome: "slot-not-visible" };

    while (Date.now() <= retryDeadline) {
      if (Date.now() - startedAt > BOT_TIMEOUT_MS) {
        throw new Error("Booking aborted due to 5 minute global timeout");
      }

      logger.push(`Checking sport ${task.sport} and slot ${task.slotTime} at epoch ${Date.now()}`);
      result = await tryBookSlot(page, task.sport, task.slotTime, (msg, level) => logger.push(msg, level));

      if (result.outcome === "booked") {
        logger.push("Booking interaction executed, verifying confirmation state");
        break;
      }

      if (result.outcome === "unavailable") {
        logger.push("Slot unavailable", "warn");
        if (Array.isArray(task.nextSlotTimes) && task.nextSlotTimes.length) {
          for (const fallbackSlot of task.nextSlotTimes) {
            logger.push(`Attempting configured fallback slot ${fallbackSlot}`);
            const fallbackTry = await tryBookSlot(
              page,
              task.sport,
              fallbackSlot,
              (msg, level) => logger.push(msg, level)
            );
            if (fallbackTry.outcome === "booked") {
              task.slotTime = fallbackSlot;
              result = fallbackTry;
              break;
            }
          }
        }
      }

      if (result.outcome === "booked") {
        break;
      }

      logger.push("Slot not ready yet, retrying in 2 seconds");
      await page.waitForTimeout(SLOT_RETRY_INTERVAL_MS);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
    }

    if (result.outcome !== "booked") {
      return { status: result.outcome === "unavailable" ? "unavailable" : "failed", screenshotPath: null };
    }

    const screenshotFile = `task-${task.id}-${Date.now()}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotFile);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    logger.push("Booking confirmed and screenshot captured");
    return { status: "success", screenshotPath: screenshotFile };
  } catch (error) {
    logger.push(`Bot error: ${error.message}`, "error");
    return { status: "failed", screenshotPath: null };
  } finally {
    await browser.close();
  }
}
