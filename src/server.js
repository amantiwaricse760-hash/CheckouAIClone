/**
 * Standalone Localhost Web Server
 * Run with: npm run web
 * Opens at: http://localhost:3890
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const GeminiService = require('./services/geminiService');

const PORT = parseInt(process.env.COMPANION_PORT || '3890', 10);
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const geminiService = new GeminiService(geminiApiKey);

// Load profile
const defaultProfilePath = path.join(__dirname, 'config/profile.json');
let profile = {
  name: "Candidate",
  targetRole: "Full Stack Software Engineer",
  primarySkills: ["JavaScript", "Python", "React", "Node.js"],
  resumeSummary: "Experienced developer."
};

try {
  if (fs.existsSync(defaultProfilePath)) {
    profile = JSON.parse(fs.readFileSync(defaultProfilePath, 'utf-8'));
  }
} catch (e) {}

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Route: /phone or /companion -> mobile companion
  let targetDir = path.join(__dirname, 'renderer');
  if (urlPath.startsWith('/phone') || urlPath.startsWith('/companion')) {
    targetDir = path.join(__dirname, 'companion');
    urlPath = '/index.html';
  } else if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }

  let filePath = path.join(targetDir, urlPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'renderer/index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

const wss = new WebSocketServer({ server });
const clients = new Set();
let latestState = { question: "", answer: "", status: "idle", mode: "points" };

function broadcast(msg) {
  if (msg.type === 'QUESTION') latestState.question = msg.data;
  if (msg.type === 'TOKEN') latestState.answer = msg.fullText;
  if (msg.type === 'STATUS') latestState.status = msg.data;
  if (msg.type === 'CLEAR') {
    latestState.question = "";
    latestState.answer = "";
    latestState.status = "idle";
  }

  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'SYNC_STATE', data: latestState }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.action === 'ask') {
        const question = msg.question;
        const mode = msg.mode || 'points';

        broadcast({ type: 'QUESTION', data: question });
        broadcast({ type: 'STATUS', data: 'generating' });

        await geminiService.streamAnswer(
          question,
          profile,
          mode,
          (chunk, fullText) => {
            broadcast({ type: 'TOKEN', chunk, fullText });
          },
          (fullText) => {
            broadcast({ type: 'STATUS', data: 'idle' });
          },
          (err) => {
            broadcast({ type: 'ERROR', data: err.message });
          }
        );
      } else if (msg.action === 'clear') {
        broadcast({ type: 'CLEAR' });
      } else if (msg.action === 'update_profile') {
        profile = { ...profile, ...msg.profile };
        fs.writeFileSync(defaultProfilePath, JSON.stringify(profile, null, 2));
      }
    } catch (e) {
      console.error("WS error:", e);
    }
  });

  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`\n=================================================`);
  console.log(`🚀 Copilot Web Server running!`);
  console.log(`💻 Desktop / Browser: http://localhost:${PORT}`);
  console.log(`📱 Mobile / Tablet:  http://${lanIp}:${PORT}/phone`);
  console.log(`=================================================\n`);
});
