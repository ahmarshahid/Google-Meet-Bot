# 🤖 Google Meet Automation Bot

A powerful, automated bot to join Google Meetings with specific names and scheduled timing. Built using Playwright.

## ✨ Features

- **Scheduled Join**: Automatically waits until a specific time to join.
- **Custom Name Entry**: Bypasses Google's complex UI to reliably enter your name.
- **Auto-Muting**: Automatically turns off camera and microphone before joining.
- **Auto-Rejoin**: If you get disconnected or accidentally leave, the bot automatically clicks "Rejoin" and re-enters the meeting.
- **Popup Handling**: Dismisses "Got it" and other overlays automatically.
- **Persistent Profile**: Uses a local Chrome profile to remember settings.

---

## 🚀 Installation & Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed on your system.
- Google Chrome installed.

### 2. Clone the Repository
```bash
git clone https://github.com/ahmarshahid/Google-Meet-Bot
cd meet-bot
```

### 3. Install Dependencies
```bash
npm install
npx playwright install chromium
```

---

## 🛠 Usage Instructions

### 1. Configuration
Open `joinMeet.js` and modify the following constants at the top:

```javascript
const MEET_LINK = "https://meet.google.com/xxx-xxxx-xxx"; // Your meeting URL
const JOIN_NAME = "Your Name";                            // Name to display
const JOIN_TIME = "08:30";                                // 24-hour format (HH:MM)
const AUTO_REJOIN = true;                                 // Auto-rejoin on disconnect
```

> [!TIP]
> To join **immediately**, set `JOIN_TIME = null;` (without quotes).

### 2. Running the Bot
```bash
node joinMeet.js
```

### 3. What to Expect
- If a `JOIN_TIME` is set, the terminal will show a **live countdown**.
- At the scheduled time, Chrome will launch.
- The bot will:
  1. Navigate to the link.
  2. Dismiss any "Got it" popups.
  3. Enter your specified name.
  4. Turn off mic/camera.
  5. Click **Ask to Join** or **Join Now**.
- If `AUTO_REJOIN` is enabled:
  - The bot monitors the meeting every 5 seconds.
  - If you get disconnected, it clicks **Rejoin** and re-enters the meeting automatically.
  - If the meeting has ended or you are removed, the bot stops gracefully.

---

## 📁 Project Structure

- `joinMeet.js`: The main logic for the bot.
- `package.json`: Project dependencies and metadata.
- `.gitignore`: Files to exclude from Git (like `node_modules` and your personal `chrome-profile`).
- `chrome-profile/`: Local directory where Chrome saves your login/settings (automatically ignored).

---

## 📝 GitHub Best Practices

Before pushing code to GitHub:
1. Ensure your `.gitignore` is active (so you don't push `node_modules`).
2. **Never** push your personal `chrome-profile` data if it contains logged-in sessions you want to keep private.

---

## 🤝 Contributing
Feel free to open issues or submit pull requests to improve the bot!
