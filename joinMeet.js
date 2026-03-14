const { chromium } = require("playwright");
const path = require("path");

(async () => {

  const MEET_LINK = "https://meet.google.com/epx-exdr-ehq";
  const JOIN_NAME = "Ahmar Shahid"; // The name to enter
  const BOT_PROFILE_DIR = path.join(__dirname, "chrome-profile");
  const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  console.log("Launching Chrome...");
  console.log("Bot profile:", BOT_PROFILE_DIR);
  console.log("Meet link:", MEET_LINK);
  console.log("");

  let context;
  try {
    context = await chromium.launchPersistentContext(BOT_PROFILE_DIR, {
      executablePath: CHROME_EXE,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
      ],
      // Deny camera and microphone permissions at the browser level
      permissions: [], 
      ignoreDefaultArgs: ["--enable-automation"],
      viewport: null,
      timeout: 60000,
    });
  } catch (err) {
    console.error("Failed to launch Chrome:", err?.message);
    console.log("\nMake sure all Chrome windows are closed first!");
    console.log("Run: taskkill /F /IM chrome.exe");
    return;
  }

  // Explicitly deny camera and microphone for the Google Meet origin
  await context.grantPermissions([], { origin: "https://meet.google.com" });

  console.log("Chrome launched (Mic/Camera permissions denied by default)!\n");

  const page = await context.newPage();

  // --- Navigate to meeting ---
  console.log("Opening meeting...");
  try {
    await page.goto(MEET_LINK, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("Page loaded:", page.url());
  } catch (err) {
    console.log("Navigation error:", err?.message);
  }

  // --- Check for "Continue without microphone and camera" ---
  console.log("Checking for 'Continue without microphone' prompt...");
  try {
    const continueWithoutBtn = page.locator('span:has-text("Continue without microphone and camera"), button:has-text("Continue without microphone and camera")').first();
    if (await continueWithoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueWithoutBtn.click();
      console.log("  -> Clicked 'Continue without microphone and camera'");
      await page.waitForTimeout(2000); 
    }
  } catch (e) {}

  // --- Wait for pre-join page ---
  console.log("Waiting for pre-join screen...");
  try {
    await page.waitForFunction(() => {
      // Look for the name input OR the join button
      const inputs = document.querySelectorAll('input[type="text"]');
      for (const input of inputs) {
        if (input.placeholder && input.placeholder.toLowerCase().includes("name")) return true;
        if (input.getAttribute('aria-label') && input.getAttribute('aria-label').toLowerCase().includes("name")) return true;
      }
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = (btn.textContent || "").toLowerCase();
        if (text.includes("join") || text.includes("ask to join")) return true;
      }
      return false;
    }, {}, { timeout: 30000 });
    console.log("Pre-join screen detected!");
  } catch (e) {
    console.log("Could not detect pre-join screen, continuing...");
  }

  // Give the page a moment to fully render
  await page.waitForTimeout(3000);

  // --- Dismiss popups FIRST ("Got it" overlay can block name input) ---
  for (const text of ["Got it", "Dismiss", "Close"]) {
    try {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        console.log(`Dismissed: "${text}"`);
        await page.waitForTimeout(1000);
      }
    } catch (e) {}
  }

  // Give a moment after dismissing popups
  await page.waitForTimeout(1000);

  // --- Enter Name ---
  console.log("Checking if name input is present...");
  try {
    // Debug: log all visible inputs on the page
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(inp => ({
        type: inp.type,
        placeholder: inp.placeholder,
        ariaLabel: inp.getAttribute('aria-label'),
        visible: inp.offsetParent !== null,
        value: inp.value,
        id: inp.id,
        className: inp.className
      }));
    });
    console.log("  -> All inputs found on page:", JSON.stringify(inputInfo, null, 2));

    // Try multiple strategies to find the name input
    let nameInput = page.locator('input[placeholder*="name" i]').first();
    let found = await nameInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (!found) {
      nameInput = page.locator('input[aria-label*="name" i]').first();
      found = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (!found) {
      // Try any visible text input on the right panel
      nameInput = page.locator('input[type="text"]:visible').first();
      found = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (!found) {
      // Last resort: any visible input that isn't hidden
      nameInput = page.locator('input:visible').first();
      found = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (found) {
      console.log(`  -> Found name input. Typing "${JOIN_NAME}"...`);
      await nameInput.click(); // Click first to ensure focus
      await page.waitForTimeout(500);
      await nameInput.focus();
      await page.keyboard.press('Control+A'); // Select all to overwrite existing text
      await page.keyboard.press('Backspace');
      await page.keyboard.type(JOIN_NAME, { delay: 150 });
      console.log("  -> Name entered.");
      await page.waitForTimeout(1500);
    } else {
      console.log("  -> Name input not found (already logged in?).");
    }
  } catch (e) {
    console.log("  -> Name input error:", e?.message);
  }

  // --- Turn off microphone ---
  console.log("Checking microphone status...");
  try {
    const micBtn = page.locator('button[aria-label*="microphone" i], button[aria-label*="Microphone" i]').first();
    if (await micBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const label = (await micBtn.getAttribute("aria-label")) || "";
      if (label.toLowerCase().includes("turn off")) {
        await micBtn.click();
        console.log("  -> Mic turned off.");
      } else {
        console.log("  -> Mic intentionally left off or already off.");
      }
    }
  } catch (e) {
    console.log("  -> Mic UI check error:", e?.message);
  }

  // --- Turn off camera ---
  console.log("Checking camera status...");
  try {
    const camBtn = page.locator('button[aria-label*="camera" i], button[aria-label*="Camera" i]').first();
    if (await camBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const label = (await camBtn.getAttribute("aria-label")) || "";
      if (label.toLowerCase().includes("turn off")) {
        await camBtn.click();
        console.log("  -> Camera turned off.");
      } else {
        console.log("  -> Camera intentionally left off or already off.");
      }
    }
  } catch (e) {
    console.log("  -> Camera UI check error:", e?.message);
  }

  // --- Click Join ---
  console.log("Looking for join button...");
  try {
    const joinBtn = page.locator(
      'button:has-text("Ask to join"), button:has-text("Join now"), button:has-text("Join")'
    ).first();
    await joinBtn.waitFor({ state: "visible", timeout: 15000 });
    await joinBtn.click();
    const btnText = await joinBtn.textContent().catch(() => "?");
    console.log(`  -> Clicked: "${btnText.trim()}"`);
  } catch (e) {
    console.log("  -> Primary selector failed, trying fallback...");
    try {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, span[role='button'], div[role='button']"));
        for (const b of btns) {
          const t = (b.textContent || "").toLowerCase().trim();
          if (t === "ask to join" || t === "join now" || t === "join") {
            b.click();
            return t;
          }
        }
        return null;
      });
      if (clicked) console.log(`  -> Fallback clicked: "${clicked}"`);
      else console.log("  -> No join button found.");
    } catch (e2) {
      console.log("  -> Fallback failed:", e2?.message);
    }
  }

  console.log("\n=== Bot is running! Staying in meeting... ===");
  console.log("Press Ctrl+C to exit.\n");

  // Keep alive
  await new Promise(() => {});

})();
