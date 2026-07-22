import path from "path";
import fs from "fs/promises";
import { chromium } from "playwright";

const BOT_TIMEOUT_MS = 7 * 60 * 1000;      // 7 min global timeout per task
const SLOT_RETRY_WINDOW_MS = 5 * 60 * 1000; // retry for up to 5 min waiting for slot to open
const SLOT_RETRY_INTERVAL_MS = 2 * 1000;    // check every 2 seconds

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

/**
 * Extract the start time from a slot label like "10:00 AM – 10:40 AM".
 * Returns normalized string like "10:00 am" or null if parsing fails.
 */
function extractStartTime(slotLabel) {
  const normalized = normalizeText(slotLabel);
  // Match patterns like "10:00 am", "5:00 pm", etc. at the start of the string
  const match = normalized.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/);
  return match ? match[1].replace(/\s+/g, ' ') : null;
}

function getSportVariants(sport) {
  const base = normalizeText(sport);
  const variants = new Set([base]);

  const stripped = base
    .replace(/\b(pool|court|ground|center|centre|court-\d+[a-z]?)\b/g, "")
    .replace(/\s*-\s*\d+[a-z]?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped) variants.add(stripped);

  const firstToken = base.split(" ")[0];
  if (firstToken) variants.add(firstToken);

  return Array.from(variants).filter(Boolean);
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

async function logDomProbe(page, log, label) {
  const visibleText = async (selector, limit = 12) => {
    const nodes = page.locator(selector);
    const count = Math.min(await nodes.count(), limit);
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const node = nodes.nth(i);
      const visible = await node.isVisible().catch(() => false);
      if (!visible) continue;
      const text = normalizeText(await node.innerText().catch(() => ""));
      if (text) items.push(text.slice(0, 120));
    }
    return items;
  };

  const headings = [
    ...(await visibleText("h1")),
    ...(await visibleText("h2")),
    ...(await visibleText("h3")),
  ];
  const buttons = await visibleText("button");
  const links = await visibleText("a");

  log(`[DEBUG] DOM probe (${label}) URL: ${page.url()}`);
  log(`[DEBUG] DOM probe headings: ${headings.slice(0, 8).join(" | ") || "none"}`);
  log(`[DEBUG] DOM probe buttons: ${buttons.slice(0, 12).join(" | ") || "none"}`);
  log(`[DEBUG] DOM probe links: ${links.slice(0, 12).join(" | ") || "none"}`);
}

function getSportsListingUrl(websiteUrl) {
  try {
    const parsed = new URL(websiteUrl);
    return `${parsed.origin}/sports`;
  } catch {
    return "https://sports.mitwpu.edu.in/sports";
  }
}

async function navigateToSportsListing(page, websiteUrl, log) {
  const sportsUrl = getSportsListingUrl(websiteUrl);
  const currentUrl = page.url();

  // Check the URL PATHNAME, not the full URL (the domain 'sports.mitwpu.edu.in' contains 'sports').
  let pathname;
  try {
    pathname = new URL(currentUrl).pathname;
  } catch {
    pathname = "";
  }

  // Already on /sports (but not /sports/<uuid>/slots).
  if (pathname === "/sports" || pathname === "/sports/") {
    log(`Already on sports listing: ${currentUrl}`);
    return;
  }

  log(`Navigating directly to sports listing: ${sportsUrl}`);
  await page.goto(sportsUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
  // Wait for the sport cards / search bar to render (SPA hydration).
  await page.waitForTimeout(2000);
  log(`Navigation complete, now at: ${page.url()}`);
}

async function searchAndFilterSport(page, sport, log) {
  const searchSelectors = [
    'input[placeholder*="Search" i]',
    'input[placeholder*="sport" i]',
    'input[type="search"]',
    'input[aria-label*="search" i]',
  ];

  for (const selector of searchSelectors) {
    const searchInput = page.locator(selector).first();
    if (!(await searchInput.count())) continue;
    if (!(await searchInput.isVisible().catch(() => false))) continue;

    log(`Found search bar (${selector}), typing: ${sport}`);
    await searchInput.click({ timeout: 2000 }).catch(() => null);
    await searchInput.fill("");
    await searchInput.fill(sport);
    // Wait for the SPA to filter results.
    await page.waitForTimeout(1200);
    log(`Search bar filled with "${sport}", waiting for results`);
    return true;
  }

  log("No search bar found on the page, will scan cards directly");
  return false;
}

async function openSportCardAndSlotList(page, sport, log) {
  const variants = getSportVariants(sport);
  const targetSport = normalizeText(sport);
  const sportTextMatchers = [targetSport, ...variants].filter(Boolean);

  // Step 1: Use search bar to filter sports (works for all sports).
  await searchAndFilterSport(page, sport, log);

  // Step 2: Find the matching card's "View Slots" button.
  const viewSlotsSelectors = [
    'button:has-text("View Slots")',
    'a:has-text("View Slots")',
    'button:has-text("View slot")',
    'a:has-text("View slot")',
    '[role="button"]:has-text("View Slots")',
    '[role="button"]:has-text("View slot")',
  ];

  // Strategy A: Walk up from each "View Slots" button to its parent card and match text.
  for (const selector of viewSlotsSelectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count();

    for (let i = 0; i < count; i += 1) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;

      // Walk up 1-3 ancestor containers to check card text.
      for (let depth = 1; depth <= 3; depth += 1) {
        const ancestor = btn.locator(`xpath=ancestor::*[self::div or self::article or self::section][${depth}]`).first();
        if (!(await ancestor.count().catch(() => 0))) continue;

        const cardText = normalizeText(await ancestor.innerText().catch(() => ""));
        if (!cardText) continue;

        if (sportTextMatchers.some((token) => token && cardText.includes(token))) {
          await btn.click({ timeout: 3000 }).catch(() => null);
          log(`Opened slot list for "${sport}" via search + card match`);
          await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
          return true;
        }
      }
    }
  }

  // Strategy B: Scan all container elements for matching text + View Slots button.
  const cards = page.locator(':is(div,article,section)');
  for (let i = 0; i < (await cards.count()); i += 1) {
    const card = cards.nth(i);
    const cardText = normalizeText(await card.innerText().catch(() => ""));

    if (!sportTextMatchers.some((token) => token && cardText.includes(token))) continue;

    const viewSlotsButton = card.locator(viewSlotsSelectors.join(", ")).first();
    if (!(await viewSlotsButton.count())) continue;

    await viewSlotsButton.click({ timeout: 3000 });
    log(`Opened slot list for "${sport}" via card scan`);
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
    return true;
  }

  await logDomProbe(page, log, `sport-not-found:${sport}`);
  return false;
}

async function openRequestedSlotSpots(page, slotLabel, log) {
  // Wait for the slot cards to actually render (SPA network request delay)
  await page.waitForTimeout(2000);

  const normalizedTarget = normalizeText(slotLabel);
  const targetStartTime = extractStartTime(slotLabel);

  // Scroll through the page in steps so lazy-loaded / off-screen cards enter the DOM.
  // We do multiple passes: scroll down incrementally, then check all buttons found so far.
  const scrollSteps = 6;   // scroll up to ~3000px total
  const scrollStep  = 500; // px per step

  for (let step = 0; step <= scrollSteps; step++) {
    if (step > 0) {
      await page.evaluate((px) => window.scrollBy(0, px), scrollStep);
      await page.waitForTimeout(500); // let lazy content render
    }

    // Re-query every time so newly rendered cards are included.
    const viewSpotsButtons = page.locator('button:has-text("View Spots"), a:has-text("View Spots")');
    const count = await viewSpotsButtons.count();

    for (let i = 0; i < count; i++) {
      const btn = viewSpotsButtons.nth(i);

      const cardContainer = btn.locator('xpath=./ancestor::div[contains(@class, "border") or contains(@class, "rounded")][1]');
      const text = normalizeText(await cardContainer.innerText().catch(() => ""));

      // Fuzzy match: exact match first, then fall back to start-time match.
      let matched = text.includes(normalizedTarget);
      if (!matched && targetStartTime) {
        const cardStartTime = extractStartTime(text);
        if (cardStartTime && cardStartTime === targetStartTime) {
          log(`Fuzzy match: user entered "${slotLabel}" → matched card starting at "${targetStartTime}"`);
          matched = true;
        }
      }

      if (!matched) continue;

      // Skip cards that are ended or full — keep scrolling for a fresh one.
      if (text.includes("ended")) {
        log(`Skipping matched card — slot is marked Ended. Looking for today's open card...`);
        continue;
      }
      if (text.includes("full")) {
        log(`Skipping matched card — slot is Full. Looking for another...`);
        continue;
      }

      // Detect "0/N spots available" — slot is fully booked, stop immediately.
      const zeroSpotsMatch = text.match(/(\d+)\/(\d+)\s+spots?\s+available/);
      if (zeroSpotsMatch && zeroSpotsMatch[1] === "0") {
        log(`Slot "${slotLabel}" is fully booked (0/${zeroSpotsMatch[2]} spots). Cannot book.`, "warn");
        return { outcome: "unavailable" };
      }

      // Log the full card status for diagnostics.
      log(`Matched slot card text: "${text.substring(0, 120)}"`);

      const isDisabled = await btn.isDisabled().catch(() => false);
      if (isDisabled) {
        // Button disabled = outside booking hours. Signal caller to keep polling.
        log(`Slot "${slotLabel}" found but button is disabled (Outside Booking Hours). Polling...`);
        return { outcome: "slot-not-visible" };
      }

      // Scroll button into view before clicking (avoids "element not in viewport" errors).
      await btn.scrollIntoViewIfNeeded().catch(() => null);
      await page.waitForTimeout(300);

      await btn.click({ timeout: 3000 }).catch(() => null);
      log(`Clicked "View Spots" for slot: ${slotLabel}`);

      // Wait for the seats/spots page to fully load (SPA navigation + data fetch).
      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(2000);

      log(`Spots page loaded, now at: ${page.url()}`);
      return { outcome: "opened" };
    }
  }

  // Scroll back to top for next retry attempt.
  await page.evaluate(() => window.scrollTo(0, 0));
  return { outcome: "slot-not-visible" };
}


async function chooseAnyAvailableSpotAndConfirm(page, log) {
  // Wait for the numbered spot buttons to appear (they load via SPA fetch).
  // Retry a few times since the page may still be rendering.
  let spotButtons;
  for (let attempt = 1; attempt <= 5; attempt++) {
    spotButtons = page
      .locator("button")
      .filter({ hasText: /^\s*\d+\s*$/ });
    
    const count = await spotButtons.count();
    if (count > 0) {
      log(`Found ${count} spot buttons on attempt ${attempt}`);
      break;
    }
    
    log(`No spot buttons found (attempt ${attempt}/5), waiting 2s...`);
    await page.waitForTimeout(2000);
  }

  if (!(await spotButtons.count())) {
    log("No numbered spot buttons found after 5 attempts", "warn");
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
    log(`Clicking spot ${candidateText}...`);
    await button.click({ timeout: 3000 }).catch(() => null);

    // Wait for the confirmation modal to appear.
    await page.waitForTimeout(1500);

    const modal = page
      .locator(':is(div,section,article,dialog):has-text("Confirm Your Booking")')
      .first();

    const modalVisible = await modal.isVisible().catch(() => false);
    if (!modalVisible) {
      log(`No confirmation modal appeared for spot ${candidateText}, trying next`);
      continue;
    }

    log(`Confirmation modal appeared for spot ${candidateText}`);

    // Check the "I agree to Terms & Conditions" checkbox.
    const termsCheckbox = page
      .locator(
        'button[role="checkbox"], input[type="checkbox"], [role="checkbox"]'
      )
      .first();

    if (await termsCheckbox.count()) {
      await termsCheckbox.click({ timeout: 2000 }).catch(() => null);
      log("Checked terms & conditions checkbox");
      await page.waitForTimeout(500);
    }

    const confirmButton = page.locator('button:has-text("Confirm")').first();
    if (!(await confirmButton.count())) {
      log("Confirm button not found in modal", "warn");
      continue;
    }

    // Wait for Confirm button to become enabled after checkbox.
    await page.waitForTimeout(500);
    if (!(await confirmButton.isEnabled().catch(() => false))) {
      log("Confirm button is disabled even after checking terms", "warn");
      continue;
    }

    await confirmButton.click({ timeout: 3000 });
    log(`Booked spot number ${candidateText}`);
    await page.waitForTimeout(2000);
    return { outcome: "booked" };
  }

  return { outcome: "unavailable" };
}

async function tryBookSlot(page, sport, slotTime, log) {
  const openedSport = await openSportCardAndSlotList(page, sport, log);
  if (!openedSport) {
    // Check if the page shows "no sports available" — this means the sport is closed today
    // (e.g. facility maintenance, weekend closure). This is permanent for today — stop retrying.
    const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
    if (bodyText.includes("no sports available")) {
      log(`Sport "${sport}" is not available today (website shows 'No Sports Available'). Stopping.`, "warn");
      return { outcome: "unavailable" };
    }
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
  const browser = await chromium.launch({ headless: options.headless !== false });
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

    let loginButton = await firstVisibleLocator(page, LOGIN_BUTTON_SELECTORS);
    if (!loginButton) {
      throw new Error("Unable to locate login button");
    }

    logger.push("Submitting login form");

    // Login with retries — GitHub Actions runners can be slow.
    let loginSuccess = false;
    for (let loginAttempt = 1; loginAttempt <= 3; loginAttempt++) {
      await Promise.allSettled([
        page.waitForLoadState("networkidle", { timeout: 15_000 }),
        loginButton.click({ timeout: 3000 }),
      ]);

      // Give SPA auth flows time to redirect.
      await page.waitForTimeout(3000);

      const postLoginUrl = page.url();
      const stillOnLoginRoute = /\/login(?:[/?#]|$)/i.test(postLoginUrl);
      const hasVisiblePasswordInput = await page.locator('input[type="password"], input[name*="pass" i], #password').first().isVisible().catch(() => false);

      if (!stillOnLoginRoute || !hasVisiblePasswordInput) {
        loginSuccess = true;
        break;
      }

      logger.push(`Login attempt ${loginAttempt} — still on login page, retrying...`, "warn");
      await page.waitForTimeout(2000);

      // Re-locate and re-click the login button for retry.
      const retryLoginBtn = await firstVisibleLocator(page, LOGIN_BUTTON_SELECTORS);
      if (retryLoginBtn) {
        loginButton = retryLoginBtn;
      }
    }

    if (!loginSuccess) {
      // Check for explicit error messages before giving up.
      const loginFailureSignals = ["invalid", "incorrect", "try again", "failed"];
      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (loginFailureSignals.some((word) => bodyText.includes(word))) {
        throw new Error("Login failed: website reported invalid credentials");
      }
      throw new Error("Login did not complete after 3 attempts: still on login page");
    }

    logger.push("Authentication check passed");
    await navigateToSportsListing(page, task.websiteUrl, (msg, level) => logger.push(msg, level));

    // PRE-NAVIGATE STRATEGY: If we woke up early (cron fired before trigger time),
    // navigate to the sport's slot page NOW and wait there. This way at exactly
    // 5:00 AM the bot is already on the page and can click the moment booking opens —
    // instead of wasting those precious seconds on login + navigation at 5:00 AM.
    const preWaitMs = options.preWaitMs || 0;
    if (preWaitMs > 0) {
      logger.push(`Pre-navigating to slot page ${Math.round(preWaitMs / 60000)} min early. Will wait until trigger time before booking.`);
      // Open the sport card so we're already on the slots listing page.
      await openSportCardAndSlotList(page, task.sport, (msg, level) => logger.push(msg, level));
      // Sleep here — we're inside the browser, session stays alive.
      logger.push(`Waiting ${Math.round(preWaitMs / 1000)}s for booking window to open at trigger time...`);
      await page.waitForTimeout(preWaitMs);
      logger.push(`Booking window should now be open — starting booking attempts.`);
      // Navigate back to sports listing to start fresh retry loop.
      await navigateToSportsListing(page, task.websiteUrl, (msg, level) => logger.push(msg, level));
    }

    const retryDeadline = Date.now() + SLOT_RETRY_WINDOW_MS;
    let result = { outcome: "slot-not-visible" };
    let attemptNum = 0;

    while (Date.now() <= retryDeadline) {
      if (Date.now() - startedAt > BOT_TIMEOUT_MS) {
        throw new Error("Booking aborted due to 5 minute global timeout");
      }

      attemptNum += 1;
      logger.push(`Checking sport ${task.sport} and slot ${task.slotTime} at epoch ${Date.now()}`);
      // Navigate directly to the sports listing URL — never click nav buttons.
      await navigateToSportsListing(page, task.websiteUrl, (msg, level) => logger.push(msg, level));
      result = await tryBookSlot(page, task.sport, task.slotTime, (msg, level) => logger.push(msg, level));

      // Take a screenshot only on the FIRST attempt so you can see exactly
      // what the slot page looked like when the bot arrived.
      if (attemptNum === 1) {
        const label = result.outcome === "booked" ? "success" : result.outcome;
        const shotName = `attempt-01-first-check-${label}.png`;
        await page.screenshot({ path: path.join(screenshotDir, shotName), fullPage: true }).catch(() => null);
        logger.push(`First-check screenshot: ${shotName}`);
      }

      if (result.outcome === "booked") {
        logger.push("Booking interaction executed, verifying confirmation state");
        break;
      }

      if (result.outcome === "unavailable") {
        logger.push("Slot unavailable — stopping retries (fully booked or facility closed today)", "warn");
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
        break;
      }

      if (result.outcome === "slot-not-visible") {
        // Booking window not open yet (Outside Booking Hours).
        // Exit immediately — cron retries in 30 minutes. No point spinning every 2s.
        logger.push("Slot not in booking window yet — exiting. Next cron check in ~30 min.");
        break;
      }

      logger.push("Slot not ready yet, retrying in 2 seconds");
      await page.waitForTimeout(SLOT_RETRY_INTERVAL_MS);
    }

    if (result.outcome !== "booked") {
      const reason =
        result.outcome === "unavailable"
          ? `Slot ${task.slotTime} was marked unavailable`
          : result.outcome === "slot-not-visible"
            ? `Could not find slot ${task.slotTime} on the page`
            : "Booking did not complete";

      let failShot = null;
      try {
        failShot = `task-${task.id}-failure-${Date.now()}.png`;
        const failHtml = `task-${task.id}-failure-${Date.now()}.html`;
        await page.screenshot({ path: path.join(screenshotDir, failShot), fullPage: true }).catch(() => null);
        await fs.writeFile(path.join(screenshotDir, failHtml), await page.content().catch(() => "")).catch(() => null);
        logger.push(`Saved failure screenshot: ${failShot}`);
        logger.push(`Saved failure page HTML: ${failHtml}`);
      } catch {
        failShot = null;
      }

      return {
        status: result.outcome === "unavailable" ? "unavailable" : "failed",
        reason,
        screenshotPath: failShot,
      };
    }

    const screenshotFile = `task-${task.id}-${Date.now()}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotFile);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    logger.push("Booking confirmed and screenshot captured");
    return { status: "success", reason: "Booking confirmed", screenshotPath: screenshotFile };
  } catch (error) {
    logger.push(`Bot error: ${error.message}`, "error");
    try {
      const failShot = `task-${task.id}-failure-${Date.now()}.png`;
      const failHtml = `task-${task.id}-failure-${Date.now()}.html`;
      const shotPath = path.join(screenshotDir, failShot);
      const htmlPath = path.join(screenshotDir, failHtml);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => null);
      const body = await page.content().catch(() => "");
      await fs.writeFile(htmlPath, body).catch(() => null);
      logger.push(`Saved failure screenshot: ${failShot}`);
      logger.push(`Saved failure page HTML: ${failHtml}`);
      return { status: "failed", reason: error.message, screenshotPath: failShot };
    } catch (inner) {
      return { status: "failed", reason: error.message, screenshotPath: null };
    }
  } finally {
    await browser.close();
  }
}
