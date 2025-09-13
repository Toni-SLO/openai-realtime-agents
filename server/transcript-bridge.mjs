import 'dotenv/config';
import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.TRANSCRIPT_BRIDGE_PORT || '3002', 10);

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Store active transcript sessions
const activeSessions = new Map();
const sessionSubscribers = new Map(); // sessionId -> Set<WebSocket>

console.log(`[transcript-bridge] Starting on port ${PORT}`);

wss.on('connection', (ws, req) => {
  console.log('[transcript-bridge] Client connected');
  
  // Track this client's subscriptions
  const clientSubscriptions = new Set();
  
  ws.on('message', async (msg) => {
    let data;
    try { 
      data = JSON.parse(msg.toString()); 
    } catch (e) { 
      console.warn('[transcript-bridge] Invalid JSON:', msg.toString());
      return; 
    }

    switch (data.type) {
      case 'subscribe': {
        const { sessionId } = data;
        if (!sessionId) return;
        
        console.log(`[transcript-bridge] Client subscribing to session: ${sessionId}`);
        
        // Add client to session subscribers
        if (!sessionSubscribers.has(sessionId)) {
          sessionSubscribers.set(sessionId, new Set());
        }
        sessionSubscribers.get(sessionId).add(ws);
        clientSubscriptions.add(sessionId);
        
        // Send existing transcript if available
        if (activeSessions.has(sessionId)) {
          ws.send(JSON.stringify({
            type: 'transcript_history',
            sessionId,
            transcript: activeSessions.get(sessionId)
          }));
        }
        break;
      }

      case 'unsubscribe': {
        const { sessionId } = data;
        if (!sessionId) return;
        
        console.log(`[transcript-bridge] Client unsubscribing from session: ${sessionId}`);
        
        if (sessionSubscribers.has(sessionId)) {
          sessionSubscribers.get(sessionId).delete(ws);
          if (sessionSubscribers.get(sessionId).size === 0) {
            sessionSubscribers.delete(sessionId);
          }
        }
        clientSubscriptions.delete(sessionId);
        break;
      }

      case 'transcript_event': {
        const { sessionId, event } = data;
        if (!sessionId || !event) return;
        
        console.log(`[transcript-bridge] Transcript event for session ${sessionId}:`, event.type);
        
        // CRITICAL: Also write to file for SIP Transcripts UI
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          const transcriptsDir = path.join(process.cwd(), 'server', 'logs', 'transcripts');
          if (!fs.existsSync(transcriptsDir)) {
            fs.mkdirSync(transcriptsDir, { recursive: true });
          }
          
          const logFile = path.join(transcriptsDir, `${sessionId}.log`);
          const timestamp = new Date().toISOString();
          const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;
          
          fs.appendFileSync(logFile, logEntry);
          console.log(`[transcript-bridge] 📝 Logged ${event.type} to file for ${sessionId}`);
        } catch (error) {
          console.warn('[transcript-bridge] ❌ Failed to log to file:', error.message);
        }
        
        // Store/update transcript in memory
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, {
            sessionId,
            startTime: Date.now(),
            events: [],
            metadata: {}
          });
          
          // Notify all connected clients about new SIP session
          const newSessionMessage = JSON.stringify({
            type: 'new_sip_session',
            sessionId,
            startTime: Date.now()
          });
          
          wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(newSessionMessage);
            }
          });
        }
        
        const session = activeSessions.get(sessionId);
        session.events.push({
          ...event,
          timestamp: Date.now()
        });
        
        // Broadcast to all subscribers of this session
        if (sessionSubscribers.has(sessionId)) {
          const message = JSON.stringify({
            type: 'transcript_update',
            sessionId,
            event: {
              ...event,
              timestamp: Date.now()
            }
          });
          
          sessionSubscribers.get(sessionId).forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        }
        break;
      }

      case 'session_end': {
        const { sessionId } = data;
        if (!sessionId) return;
        
        console.log(`[transcript-bridge] Session ended: ${sessionId}`);
        
        // Broadcast session end
        if (sessionSubscribers.has(sessionId)) {
          const message = JSON.stringify({
            type: 'session_ended',
            sessionId
          });
          
          sessionSubscribers.get(sessionId).forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        }
        
        // Clean up after a delay (to allow last events to be processed)
        setTimeout(() => {
          activeSessions.delete(sessionId);
          sessionSubscribers.delete(sessionId);
        }, 10000); // 10 second grace period
        break;
      }
      
      default:
        console.warn('[transcript-bridge] Unknown message type:', data.type);
    }
  });
  
  ws.on('close', () => {
    console.log('[transcript-bridge] Client disconnected');
    
    // Clean up subscriptions
    clientSubscriptions.forEach((sessionId) => {
      if (sessionSubscribers.has(sessionId)) {
        sessionSubscribers.get(sessionId).delete(ws);
        if (sessionSubscribers.get(sessionId).size === 0) {
          sessionSubscribers.delete(sessionId);
        }
      }
    });
  });
  
  ws.on('error', (e) => {
    console.warn('[transcript-bridge] WebSocket error:', e);
  });
});

server.listen(PORT, () => {
  console.log(`[transcript-bridge] Transcript bridge listening on ws://localhost:${PORT}`);
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const oldSessions = [];
  
  activeSessions.forEach((session, sessionId) => {
    // Remove sessions older than 1 hour
    if (now - session.startTime > 60 * 60 * 1000) {
      oldSessions.push(sessionId);
    }
  });
  
  oldSessions.forEach((sessionId) => {
    console.log(`[transcript-bridge] Cleaning up old session: ${sessionId}`);
    activeSessions.delete(sessionId);
    sessionSubscribers.delete(sessionId);
  });
}, 5 * 60 * 1000); // Check every 5 minutes
