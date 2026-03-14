const { chromium } = require("playwright");
const path = require("path");

(async () => {

  // ===== CONFIGURATION =====
  const MEET_LINK = "https://meet.google.com/xxx-xxx-xxx";
  const JOIN_NAME = "xxxxx"; // The name to enter
  const JOIN_TIME = "xx:xx"; // Time to join in 24-hour format (HH:MM), e.g. "14:30" for 2:30 PM. Set to null to join immediately.
  const AUTO_REJOIN = true; // Automatically rejoin if disconnected
  const REJOIN_CHECK_INTERVAL = 5000; // How often to check if still in meeting (ms)
  const BOT_PROFILE_DIR = path.join(__dirname, "chrome-profile");
  const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  // ===== HELPER: Wait for Scheduled Time =====
  async function waitForScheduledTime() {
    if (!JOIN_TIME) return;

    const [targetHour, targetMin] = JOIN_TIME.split(":").map(Number);
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(targetHour, targetMin, 0, 0);

    // If the target time has already passed today, schedule for tomorrow
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const diffMs = targetTime - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const remainMins = diffMins % 60;

    console.log(`⏰ Scheduled to join at ${JOIN_TIME}`);
    console.log(`   Current time: ${now.toLocaleTimeString()}`);
    console.log(`   Waiting ${diffHrs}h ${remainMins}m until join time...\n`);

    while (new Date() < targetTime) {
      const remaining = targetTime - new Date();
      const remMins = Math.floor(remaining / 60000);
      const remHrs = Math.floor(remMins / 60);
      const remM = remMins % 60;

      process.stdout.write(`\r   ⏳ Time remaining: ${remHrs}h ${remM}m   `);
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, remaining)));
    }

    console.log(`\n\n🚀 It's ${JOIN_TIME}! Joining the meeting now...\n`);
  }

  // ===== HELPER: Perform Join Sequence =====
  async function performJoin(page) {
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

    await page.waitForTimeout(1000);

    // --- Enter Name ---
    console.log("Checking if name input is present...");
    try {
      const nameEntered = await page.evaluate((name) => {
        let input = document.getElementById('jd.anon_name');
        if (!input) input = document.querySelector('input[placeholder*="name" i]');
        if (!input) input = document.querySelector('input[aria-label*="name" i]');
        if (!input) input = document.querySelector('input[type="text"]');
        if (!input) return { found: false };

        input.focus();
        input.click();
        input.value = '';

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, name);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        return { found: true, id: input.id, placeholder: input.placeholder, newValue: input.value };
      }, JOIN_NAME);

      if (nameEntered.found) {
        console.log(`  -> Found name input (id: ${nameEntered.id}, placeholder: "${nameEntered.placeholder}")`);
        console.log(`  -> Set value to: "${nameEntered.newValue}"`);

        await page.waitForTimeout(500);
        const nameField = page.locator('#jd\\.anon_name, input[placeholder*="name" i]').first();
        try {
          await nameField.click({ force: true, timeout: 3000 });
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(JOIN_NAME, { delay: 120 });
          console.log("  -> Name typed via keyboard too.");
        } catch (kbErr) {
          console.log("  -> Keyboard typing skipped (evaluate method should suffice):", kbErr?.message);
        }

        await page.waitForTimeout(1500);
        console.log("  -> Name entry complete.");
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

    console.log("\n✅ Join sequence complete!\n");
  }

  // ===== HELPER: Monitor Meeting & Auto-Rejoin =====
  async function monitorAndRejoin(page) {
    console.log("=== Bot is running! Monitoring meeting... ===");
    console.log("   Auto-rejoin:", AUTO_REJOIN ? "ENABLED" : "DISABLED");
    console.log("Press Ctrl+C to exit.\n");

    if (!AUTO_REJOIN) {
      // Just keep alive without monitoring
      await new Promise(() => {});
      return;
    }

    let rejoinCount = 0;

    while (true) {
      await new Promise(resolve => setTimeout(resolve, REJOIN_CHECK_INTERVAL));

      try {
        // Check if we're on the "You left the meeting" screen
        const pageState = await page.evaluate(() => {
          const bodyText = document.body.innerText || "";

          // Check for "You left the meeting" screen
          if (bodyText.includes("You left the meeting")) {
            return "left_meeting";
          }

          // Check for "Your meeting code has expired" or similar errors
          if (bodyText.includes("meeting code has expired") || bodyText.includes("Meeting has ended")) {
            return "meeting_ended";
          }

          // Check for "You were removed from the meeting"
          if (bodyText.includes("removed from the meeting")) {
            return "removed";
          }

          // Check if we seem to still be in a meeting (has leave button or meeting controls)
          const leaveBtn = document.querySelector('button[aria-label*="Leave" i]');
          if (leaveBtn) {
            return "in_meeting";
          }

          // Check if we're on the pre-join screen (waiting to be admitted)
          const askJoinBtn = Array.from(document.querySelectorAll("button")).find(
            b => (b.textContent || "").toLowerCase().includes("ask to join")
          );
          if (askJoinBtn) {
            return "pre_join";
          }

          return "unknown";
        });

        if (pageState === "left_meeting") {
          rejoinCount++;
          console.log(`\n🔄 [Rejoin #${rejoinCount}] Detected "You left the meeting" — attempting to rejoin...`);

          // Look for the "Rejoin" button
          try {
            const rejoinBtn = page.locator('button:has-text("Rejoin")').first();
            if (await rejoinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
              await rejoinBtn.click();
              console.log("  -> Clicked 'Rejoin' button!");
              await page.waitForTimeout(3000);
            } else {
              console.log("  -> 'Rejoin' button not found, navigating to meeting link...");
              await page.goto(MEET_LINK, { waitUntil: "domcontentloaded", timeout: 60000 });
            }
          } catch (rejoinErr) {
            console.log("  -> Rejoin button error, navigating to meeting link...");
            await page.goto(MEET_LINK, { waitUntil: "domcontentloaded", timeout: 60000 });
          }

          // Re-run the full join sequence
          await performJoin(page);
          console.log("=== Bot rejoined! Continuing to monitor... ===\n");

        } else if (pageState === "meeting_ended") {
          console.log("\n⛔ Meeting has ended. Stopping bot.");
          break;

        } else if (pageState === "removed") {
          console.log("\n⛔ You were removed from the meeting. Stopping bot.");
          break;
        }
        // "in_meeting", "pre_join", "unknown" — just keep monitoring

      } catch (monitorErr) {
        // Page might have crashed or navigated away — try to recover
        console.log(`\n⚠️  Monitor error: ${monitorErr?.message}`);
        console.log("   Attempting to recover by navigating back to the meeting...");

        try {
          await page.goto(MEET_LINK, { waitUntil: "domcontentloaded", timeout: 60000 });
          rejoinCount++;
          console.log(`🔄 [Rejoin #${rejoinCount}] Navigated back to meeting.`);
          await performJoin(page);
          console.log("=== Bot recovered! Continuing to monitor... ===\n");
        } catch (recoverErr) {
          console.log("   Recovery failed:", recoverErr?.message);
          console.log("   Will retry in next check cycle...");
        }
      }
    }
  }

  // ===== MAIN FLOW =====
  await waitForScheduledTime();

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

  await context.grantPermissions([], { origin: "https://meet.google.com" });
  console.log("Chrome launched (Mic/Camera permissions denied by default)!\n");

  const page = await context.newPage();

  // Initial join
  await performJoin(page);

  // Monitor and auto-rejoin loop
  await monitorAndRejoin(page);

})();
