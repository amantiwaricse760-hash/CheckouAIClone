/**
 * Mobile Phone Companion Server
 * Allows opening http://<LAN_IP>:3890 on your phone/tablet to view live answers
 * without having ANY window open on your laptop screen during screen sharing!
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');

class CompanionServer {
  constructor(port = 3890) {
    this.port = port;
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.latestState = {
      question: "",
      answer: "",
      mode: "points",
      status: "idle"
    };
  }

  getLanIp() {
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

  start(onActionReceived) {
    const staticDir = path.join(__dirname, '../companion');

    this.server = http.createServer((req, res) => {
      let filePath = path.join(staticDir, req.url === '/' ? 'index.html' : req.url);

      if (!fs.existsSync(filePath)) {
        filePath = path.join(staticDir, 'index.html');
      }

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading companion file');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      });
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      // Immediately send the latest state to the newly connected phone
      ws.send(JSON.stringify({ type: 'SYNC_STATE', data: this.latestState }));

      ws.on('message', (msg) => {
        try {
          const action = JSON.parse(msg.toString());
          if (onActionReceived) onActionReceived(action);
        } catch (e) {
          console.error("Invalid message from companion client:", e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      const lanIp = this.getLanIp();
      console.log(`[Phone Companion] Ready at http://${lanIp}:${this.port}`);
    });
  }

  broadcast(message) {
    if (message.type === 'QUESTION') this.latestState.question = message.data;
    if (message.type === 'TOKEN') this.latestState.answer = message.fullText;
    if (message.type === 'STATUS') this.latestState.status = message.data;
    if (message.type === 'CLEAR') {
      this.latestState.question = "";
      this.latestState.answer = "";
      this.latestState.status = "idle";
    }

    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }
}

module.exports = CompanionServer;
