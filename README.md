# 🦅 Stealth AI Interview Copilot (Desktop App)

A private, ultra-fast desktop interview assistant designed to run locally during technical and behavioral job interviews. It streams answers directly as punchy bullet points and code snippets without appearing on screen shares.

Inspired by tools like Chiku AI and Parakeet AI, but built for **100% free personal use**, zero monthly subscriptions, and complete stealth.

---

## ✨ Key Features

- 🛡️ **Anti-Screen-Share Protection:** Built with native OS window flags (`setContentProtection(true)`). When you share your screen on Google Meet, Zoom, or Microsoft Teams, **the app window is hidden/omitted from the video feed**.
- 👻 **Click-Through Ghost HUD:** Frameless, semi-transparent overlay that floats above VS Code, LeetCode, or your browser. You can click and type straight through the window (`Ctrl + Shift + G`).
- 📱 **Invisible Phone Companion:** Runs a local Wi-Fi server (`http://<LAN-IP>:3890`). You can open the live answer dashboard on your smartphone propped below your monitor with **zero windows open on your laptop screen**.
- 🇮🇳 **Desi Mode & Multi-Style Answers:**
  - `⚡ Points`: Concise talking points you can read at a glance in 2 seconds.
  - `🇮🇳 Desi Mode`: Natural Indian professional engineering phrasing (polite, confident, conversational).
  - `💻 Code Only`: Clean, optimal algorithmic code with Big-O time and space complexity.
  - `📖 Deep Dive`: System design architecture and trade-offs.
- ⚡ **Sub-Second Streaming:** Direct streaming via Google's low-latency Gemini 2.0 / 1.5 Flash models.
- 📄 **Resume Context Awareness:** Injects your actual projects, years of experience, and tech stack into every answer.

---

## 🚀 Quick Start (Run on Any Laptop)

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **Git**

### 2. Clone & Install
```bash
git clone https://github.com/amantiwaricse760-hash/CheckouAIClone.git
cd CheckouAIClone
npm install
```

### 3. Configure API Key
Create or edit `.env` in the root folder:
```env
GEMINI_API_KEY=your_gemini_api_key_here
COMPANION_PORT=3890
```
*(Your Gemini API key can also be entered or changed anytime via the in-app Settings gear icon `⚙️`)*.

### 4. Run the Desktop App
```bash
npm start
```

---

## ⌨️ Global Stealth Hotkeys

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + H` | **Emergency Panic Hide/Show** | Instantly toggles HUD visibility (0ms delay) |
| `Ctrl + Shift + G` | **Toggle Ghost Mode** | Makes HUD click-through so you can code through it |
| `Ctrl + Shift + C` | **Clear Screen** | Clears the current question and answer |

*(On macOS, use `Command` instead of `Ctrl`)*.

---

## 📱 How to Use Phone Companion (100% Undetectable)

If you have a strict interview where you want **absolute zero windows** on your computer screen:

1. Launch the desktop app (`npm start`).
2. Click the `📱` phone icon on the top bar to get your local network URL (e.g., `http://192.168.1.15:3890`).
3. Open this URL on your phone's browser (both laptop and phone must be on the same Wi-Fi network).
4. Press `Ctrl + Shift + H` on your laptop to hide the desktop HUD completely.
5. Place your phone propped right below your laptop screen.
6. The desktop app will listen to your laptop speakers and stream the answers directly to your phone screen in real time!

---

## ⚙️ Customizing Your Profile & Resume

To make sure the AI answers as **you**:
1. Open the app and click the `⚙️` Settings button.
2. Enter your:
   - Target Role (e.g. *Senior Backend Engineer*, *React Specialist*)
   - Years of Experience
   - Primary Skills (e.g. *Node.js, TypeScript, PostgreSQL, Docker*)
   - Resume Summary & Key Projects
3. Click **Save Profile**. All future answers will weave in your real-world background!

---

## 🎧 Capturing Audio on Different OS

### Linux:
- The app automatically uses the default PulseAudio / PipeWire audio stream.
- Ensure your microphone and desktop audio monitor are active in your sound settings (`pactl` / `pavucontrol`).

### Windows:
- Windows natively allows loopback capture via WASAPI or Stereo Mix. Select your default headphone/speaker device.

### macOS:
- Install a lightweight virtual audio cable (like BlackHole 2ch) to route Google Meet / Zoom audio to the listener.

---

## 🔒 Security & Privacy Notice

- All audio processing and streaming happen locally or securely via encrypted HTTPS/WSS to the Gemini API.
- Your resume and profile are stored strictly on your local machine (`userData/profile.json`).
- Always use responsibly and adhere to your company/interview integrity guidelines.
