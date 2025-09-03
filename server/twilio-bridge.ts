import 'dotenv/config';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';

const PORT = parseInt(process.env.BRIDGE_PORT || '3001', 10);

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Twilio <-> Bridge clients map by streamSid
const streamIdToSocket = new Map<string, WebSocket>();

wss.on('connection', (ws, req) => {
  console.log('[bridge] client connected', req.url);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === 'start') {
        const streamSid = data.start?.streamSid;
        if (streamSid) {
          streamIdToSocket.set(streamSid, ws);
          console.log('[bridge] start stream', streamSid);
        }
      } else if (data.event === 'media') {
        // media.payload (base64 PCMU) — TODO: forward to OpenAI Realtime
      } else if (data.event === 'stop') {
        const streamSid = data.stop?.streamSid;
        if (streamSid) streamIdToSocket.delete(streamSid);
        console.log('[bridge] stop stream', streamSid);
      }
    } catch (err) {
      console.error('[bridge] invalid message', err);
    }
  });

  ws.on('close', () => {
    for (const [sid, sock] of streamIdToSocket.entries()) {
      if (sock === ws) streamIdToSocket.delete(sid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[bridge] listening on ws://localhost:${PORT}`);
});


