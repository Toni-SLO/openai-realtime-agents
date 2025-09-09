#!/usr/bin/env node

/**
 * SIMPLE SIP TEST - Based on Twilio Official Guide
 * https://www.twilio.com/en-us/blog/minimalist-integration-twilio-openai-realtime
 */

import express from 'express';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env' });

const app = express();
const PORT = 3044; // Different port for testing

// Constants
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

console.log('🧪 SIMPLE SIP TEST SERVER');
console.log(`🔑 API Key: ${OPENAI_API_KEY ? 'SET' : 'MISSING'}`);
console.log(`🏗️  Project ID: ${OPENAI_PROJECT_ID || 'MISSING'}`);

// Parse JSON
app.use(express.json());

// Simple webhook handler
app.post('/webhook', async (req, res) => {
  console.log('📞 Incoming webhook:', JSON.stringify(req.body, null, 2));
  
  try {
    const event = req.body;
    
    if (event.type === 'realtime.call.incoming') {
      const callId = event.data?.call_id;
      
      if (!callId) {
        console.error('❌ No call_id in event');
        return res.status(400).json({ error: 'Missing call_id' });
      }
      
      // Check if this is a real call with SIP headers (From header indicates real call)
      const sipHeaders = event.data?.sip_headers || [];
      const fromHeader = sipHeaders.find(h => h.name === 'From');
      
      if (!fromHeader) {
        console.log('🧪 This appears to be a test webhook from OpenAI (no From header) - ignoring');
        return res.status(200).json({ status: 'test webhook received' });
      }
      
      console.log(`📞 Processing REAL call: ${callId} from ${fromHeader.value}`);
      
      // PRAVI OPENAI API KLIC
      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${callId}/accept`;
      const acceptPayload = {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: `# Fančita Restaurant Agent - Poenotene instrukcije

**KRITIČNO: Tvoj prvi odgovor mora biti VEDNO: "Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?" - ne glede na vse ostalo!**

Ti si Maja iz restavracije Fančita. Pozdravi stranko v hrvaščini kot je določeno zgoraj. Odgovarjaj kratko in prijazno. Če te stranka vpraša o rezervaciji, povej da lahko narediš rezervacijo. Če te vpraša o meniju, povej da imaš informacije o meniju.`,
        voice: 'marin',
        modalities: ['text', 'audio'],
        audio: {
          input: { format: 'g711_ulaw', sample_rate: 8000 },
          output: { voice: 'marin', format: 'g711_ulaw', sample_rate: 8000 }
        },
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'hr'
        },
        turn_detection: { type: 'semantic_vad' }
      };
      
      console.log('🔄 Calling OpenAI API...');
      
      // Add delay to prevent race conditions
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const headers = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      };
      
      if (OPENAI_PROJECT_ID) {
        headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
      }
      
      const response = await fetch(acceptUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(acceptPayload)
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Accept failed:', response.status, error);
        return res.status(500).json({ error: 'Accept failed' });
      }
      
      console.log('✅ OpenAI Call accepted!');
      res.json({ status: 'accepted', call_id: callId });
    } else {
      console.log('ℹ️  Other event type:', event.type);
      res.json({ status: 'ignored' });
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Simple WebSocket connection
function connectWebSocket(callId) {
  const wsUrl = `wss://api.openai.com/v1/realtime?call_id=${callId}`;
  
  console.log(`🔗 Connecting WebSocket: ${wsUrl}`);
  
  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1'
  };
  
  if (OPENAI_PROJECT_ID) {
    headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
  }
  
  const ws = new WebSocket(wsUrl, { headers });
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
  });
  
  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data);
      console.log('📨 WebSocket event:', event.type);
    } catch (e) {
      console.log('📨 WebSocket data:', data.toString());
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔚 WebSocket closed: ${code} ${reason}`);
  });
}

// TwiML endpoint for SIP Domain
app.post('/twiml', (req, res) => {
  console.log('🚨🚨🚨 TwiML POST request received! 🚨🚨🚨');
  console.log('📞 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📨 Headers:', JSON.stringify(req.headers, null, 2));
  
  // Return TwiML with Maja greeting
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="hr-HR">Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći? Želite li rezervirati stol ili naručiti hranu?</Say>
</Response>`;
  
  res.type('application/xml');
  res.send(twiml);
});

// GET version za test
app.get('/twiml', (req, res) => {
  console.log('🚨🚨🚨 TwiML GET request received! 🚨🚨🚨');
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>TwiML endpoint is working!</Say>
</Response>`);
});

// Catch all requests za debug
app.use((req, res, next) => {
  console.log(`🔍 Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Simple SIP test server running on port ${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔗 TwiML URL: http://localhost:${PORT}/twiml`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/websocket' });

wss.on('connection', (ws) => {
  console.log('📞 Twilio Media Stream connected');
  
  let openaiWs = null;
  let callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Twilio message:', data.event);
      
      if (data.event === 'start') {
        console.log('🎬 Call started:', data.start.callSid);
        callId = data.start.callSid;
        
        // Initialize OpenAI Realtime connection
        await initializeOpenAI(callId, ws);
        
      } else if (data.event === 'media') {
        // Forward audio to OpenAI
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          const audioEvent = {
            type: 'input_audio_buffer.append',
            audio: data.media.payload // base64 audio
          };
          openaiWs.send(JSON.stringify(audioEvent));
        }
        
      } else if (data.event === 'stop') {
        console.log('🛑 Call ended');
        if (openaiWs) {
          openaiWs.close();
        }
      }
      
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('📞 Twilio Media Stream disconnected');
    if (openaiWs) {
      openaiWs.close();
    }
  });
  
  // Initialize OpenAI connection
  async function initializeOpenAI(callId, twilioWs) {
    try {
      // Accept call first
      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${callId}/accept`;
      const acceptPayload = {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: 'Ti si Maja iz restavracije Fančita. Pozdravi stranko: "Restoran Fančita, Maja kod telefona. Kako vam mogu pomoči?" Odgovarjaj kratko in prijazno v hrvaščini.',
        voice: 'marin',
        modalities: ['text', 'audio'],
        audio: {
          input: { format: 'g711_ulaw', sample_rate: 8000 },
          output: { voice: 'marin', format: 'g711_ulaw', sample_rate: 8000 }
        },
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'hr'
        },
        turn_detection: { type: 'semantic_vad' }
      };
      
      const headers = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      };
      
      if (OPENAI_PROJECT_ID) {
        headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
      }
      
      const response = await fetch(acceptUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(acceptPayload)
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ OpenAI Accept failed:', response.status, error);
        return;
      }
      
      console.log('✅ OpenAI Call accepted!');
      
      // Connect to OpenAI WebSocket
      const wsUrl = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
      openaiWs = new WebSocket(wsUrl, { headers });
      
      openaiWs.on('open', () => {
        console.log('🔗 OpenAI WebSocket connected');
      });
      
      openaiWs.on('message', (data) => {
        try {
          const event = JSON.parse(data);
          
          if (event.type === 'response.audio.delta' && event.delta) {
            // Forward audio back to Twilio
            const mediaMessage = {
              event: 'media',
              media: {
                payload: event.delta
              }
            };
            twilioWs.send(JSON.stringify(mediaMessage));
          }
          
        } catch (error) {
          console.error('❌ OpenAI message error:', error);
        }
      });
      
      openaiWs.on('error', (error) => {
        console.error('❌ OpenAI WebSocket error:', error);
      });
      
    } catch (error) {
      console.error('❌ OpenAI initialization error:', error);
    }
  }
});
