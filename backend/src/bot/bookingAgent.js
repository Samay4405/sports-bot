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

function normalizeText(value) {
  return String(value || "")
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

async function openSportCardAndSlotList(page, sport, log) {
  const cards = page
    .locator(':is(div,article,section)')
    .filter({ has: page.locator('button:has-text("View Slots"), a:has-text("View Slots")') });

  const targetSport = normalizeText(sport);

  for (let i = 0; i < (await cards.count()); i += 1) {
    const card = cards.nth(i);
    const cardText = normalizeText(await card.innerText().catch(() => ""));

    if (!cardText.includes(targetSport)) {
      continue;
    }

    const viewSlotsButton = card.locator('button:has-text("View Slots"), a:has-text("View Slots")').first();
    if (!(await viewSlotsButton.count())) {
      continue;
    }

    await viewSlotsButton.click({ timeout: 3000 });
    log(`Opened slot list for sport card: ${sport}`);
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
    return true;
  }

  return false;
}

async function openRequestedSlotSpots(page, slotLabel, log) {
  const slotCards = page
    .locator(':is(div,article,section)')
    .filter({ has: page.locator('button:has-text("View Spots"), a:has-text("View Spots")') });

  const normalizedTarget = normalizeText(slotLabel);

  for (let i = 0; i < (await slotCards.count()); i += 1) {
    const card = slotCards.nth(i);
    const text = normalizeText(await card.innerText().catch(() => ""));

    if (!text.includes(normalizedTarget)) {
      continue;
    }

    if (text.includes("ended") || text.includes("full") || text.includes("unavailable")) {
      return { outcome: "unavailable" };
    }

    const viewSpotsButton = card.locator('button:has-text("View Spots"), a:has-text("View Spots")').first();
    if (!(await viewSpotsButton.count())) {
      return { outcome: "slot-not-visible" };
    }

    await viewSpotsButton.click({ timeout: 3000 });
    log(`Opened spots for slot label: ${slotLabel}`);
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
    return { outcome: "opened" };
  }

  return { outcome: "slot-not-visible" };
}

async function chooseAnyAvailableSpotAndConfirm(page, log) {
  const spotButtons = page
    .locator("button")
    .filter({ hasText: /^\s*\d+\s*$/ });

  if (!(await spotButtons.count())) {
    return { outcome: "slot-not-visible" };
  }

  for (let i = 0; i < (await spotButtons.count()); i += 1) {
    const button = spotButtons.nth(i);

    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }

    if (!(await button.isEnabled().catch(() => false))) {
      continue;
    }

    const candidateText = (await button.innerText().catch(() => "")).trim();
    await button.click({ timeout: 3000 }).catch(() => null);

    const modal = page
      .locator(':is(div,section,article):has-text("Confirm Your Booking")')
      .first();

    if (!(await modal.count())) {
      continue;
    }

    const termsCheckbox = modal
      .locator(
        'input[type="checkbox"], label:has-text("I agree"):has(input), [role="checkbox"]'
      )
      .first();

    if (await termsCheckbox.count()) {
      await termsCheckbox.click({ timeout: 2000 }).catch(() => null);
    }

    const confirmButton = modal.locator('button:has-text("Confirm")').first();
    if (!(await confirmButton.count())) {
      continue;
    }

    if (!(await confirmButton.isEnabled().catch(() => false))) {
      continue;
    }

    await confirmButton.click({ timeout: 3000 });
    log(`Booked spot number ${candidateText}`);
    await page.waitForTimeout(1500);
    return { outcome: "booked" };
  }

  return { outcome: "unavailable" };
}

async function tryBookSlot(page, sport, slotTime, log) {
  const openedSport = await openSportCardAndSlotList(page, sport, log);
  if (!openedSport) {
    log(`Could not locate sport card: ${sport}`, "warn");
    return { outcome: "slot-not-visible" };
  }

  const openSlotResult = await openRequestedSlotSpots(page, slotTime, log);
  if (openSlotResult.outcome !== "opened") {
    return openSlotResult;
  }

  return chooseAnyAvailableSpotAndConfirm(page, log);
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
      const reason =
        result.outcome === "unavailable"
          ? `Slot ${task.slotTime} was marked unavailable`
          : result.outcome === "slot-not-visible"
            ? `Could not find slot ${task.slotTime} on the page`
            : "Booking did not complete";

      return {
        status: result.outcome === "unavailable" ? "unavailable" : "failed",
        reason,
        screenshotPath: null,
      };
    }

    const screenshotFile = `task-${task.id}-${Date.now()}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotFile);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    logger.push("Booking confirmed and screenshot captured");
    return { status: "success", reason: "Booking confirmed", screenshotPath: screenshotFile };
  } catch (error) {
    logger.push(`Bot error: ${error.message}`, "error");
    return { status: "failed", reason: error.message, screenshotPath: null };
  } finally {
    await browser.close();
  }
}
