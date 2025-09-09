#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the project root directory (one level up from server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from .env.local first, then .env  
// Use override: true to prioritize .env.local over system variables
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = path.join(projectRoot, '.env');

console.log(`[sip-webhook] 🔍 Loading .env.local from: ${envLocalPath}`);
console.log(`[sip-webhook] 🔍 Loading .env from: ${envPath}`);

dotenv.config({ path: envLocalPath, override: true });
dotenv.config({ path: envPath });
import http from 'http';
import WebSocket from 'ws';  // Native ws should work fine in pure Node.js
import fs from 'fs';
import { createRequire } from 'module';
import nodemailer from 'nodemailer';

// Import CommonJS shared instructions
const require = createRequire(import.meta.url);
const { FANCITA_UNIFIED_INSTRUCTIONS, replaceInstructionVariables: sharedReplaceVariables } = require('./shared-instructions.cjs');

const PORT = parseInt(process.env.SIP_WEBHOOK_PORT || '3003', 10);

// Email konfiguracija za urgentna obvestila
const URGENT_ERROR_EMAIL = process.env.URGENT_ERROR_EMAIL;
let emailTransporter = null;

// Inicializacija email transporterja
if (URGENT_ERROR_EMAIL) {
  try {
    emailTransporter = nodemailer.createTransporter({
      service: 'gmail', // Lahko spremenite na drug servis
      auth: {
        user: process.env.EMAIL_USER, // dodajte v .env.local
        pass: process.env.EMAIL_PASS  // dodajte v .env.local (app password)
      }
    });
    console.log('[sip-webhook] 📧 Email alerts enabled for:', URGENT_ERROR_EMAIL);
  } catch (error) {
    console.log('[sip-webhook] ⚠️ Email setup failed:', error.message);
  }
} else {
  console.log('[sip-webhook] 📧 URGENT_ERROR_EMAIL not set - email alerts disabled');
}

// Funkcija za pošiljanje urgentnih emailov
async function sendUrgentErrorEmail(errorType, errorDetails, callId, suggestions = []) {
  if (!emailTransporter || !URGENT_ERROR_EMAIL) return;
  
  const timestamp = new Date().toLocaleString('sl-SI');
  const subject = `🚨 FANČITA URGENTNO: ${errorType} - ${timestamp}`;
  
  const htmlContent = `
    <h2>🚨 URGENTNA NAPAKA V FANČITA SISTEMU</h2>
    <p><strong>Čas:</strong> ${timestamp}</p>
    <p><strong>Tip napake:</strong> ${errorType}</p>
    <p><strong>ID klica:</strong> ${callId || 'N/A'}</p>
    
    <h3>📋 Podrobnosti napake:</h3>
    <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${JSON.stringify(errorDetails, null, 2)}</pre>
    
    <h3>🛠️ Priporočene rešitve:</h3>
    <ul>
      ${suggestions.map(s => `<li>${s}</li>`).join('')}
    </ul>
    
    <hr>
    <p><small>Avtomatsko obvestilo iz Fančita SIP webhook sistema</small></p>
  `;
  
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: URGENT_ERROR_EMAIL,
      subject: subject,
      html: htmlContent
    });
    console.log('[sip-webhook] 📧 Urgent error email sent!');
  } catch (error) {
    console.error('[sip-webhook] 📧 Failed to send urgent email:', error.message);
  }
}

// Constants
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;
const MODEL = process.env.GPT_REALTIME_MODEL || 'gpt-realtime';

// Debug environment variables
console.log('[sip-webhook] 🔧 Environment loaded:');
console.log(`[sip-webhook] 🔑 API Key: ${OPENAI_API_KEY ? 'SET' : 'MISSING'}`);
console.log(`[sip-webhook] 🏗️  Project ID: ${OPENAI_PROJECT_ID || 'MISSING'}`);
console.log(`[sip-webhook] 🏗️  Project ID raw: ${process.env.OPENAI_PROJECT_ID || 'NOT_FOUND'}`);
console.log(`[sip-webhook] 🤖 Model: ${MODEL}`);
console.log(`[sip-webhook] 📧 Email: ${process.env.URGENT_ERROR_EMAIL || 'NOT_SET'}`);

const VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
// Use G.711 μ-law for guaranteed SIP compatibility
const SIP_CODEC = process.env.SIP_AUDIO_CODEC || 'g711_ulaw';

// Deduplicate accepts per call_id within this process
const acceptedCallIds = new Set();

// Track calls that should hangup after final message
const pendingHangups = new Map();

// Track detected language per call for dynamic transcription
const callLanguages = new Map(); // callId -> language code (hr, sl, en, de, it, nl)

// Track pending tool results to prevent premature hangup
const pendingToolResults = new Map(); // callId -> Set of pending tool call IDs

// Function to update transcription language dynamically
function updateTranscriptionLanguage(ws, callId, newLanguage) {
  const validLanguages = ['hr', 'sl', 'en', 'de', 'it', 'nl'];
  if (!validLanguages.includes(newLanguage)) return;
  
  const currentLang = callLanguages.get(callId);
  if (currentLang === newLanguage) return; // No change needed
  
  callLanguages.set(callId, newLanguage);
  console.log(`[sip-webhook] 🌍 Updating transcription language to: ${newLanguage} for call ${callId}`);
  
  // Log language change to transcript
  logTranscriptEvent(callId, {
    type: 'language_change',
    content: `Jezik spremenjen iz "${currentLang || 'hr'}" v "${newLanguage}"`,
    from_language: currentLang || 'hr',
    to_language: newLanguage,
    timestamp: new Date().toISOString(),
    metadata: {
      callId: callId,
      previousLanguage: currentLang || 'hr',
      newLanguage: newLanguage,
      transcriptionModel: 'gpt-4o-mini-transcribe'
    }
  });
  
  // Language detection is now handled automatically by OpenAI
  console.log(`[sip-webhook] 🌍 Language detected and logged: ${newLanguage}`);
}

// DISABLED: Language detection based on transcript is unreliable
// Only agent (Maja) should decide language changes based on conversation context
function detectUserLanguage_DISABLED(ws, callId, userTranscript) {
  const text = userTranscript.toLowerCase();
  
  // Language detection patterns based on USER speech patterns
  const userLanguagePatterns = {
    'sl': [
      'rezervirati mizo',
      'za nocoj',
      'dobro vecer',
      'hvala lepa',
      'dve osebi',
      'tri osebe'
    ],
    'hr': [
      'htio bih',
      'htjela bih', 
      'izabrati stol',
      'rezervirati stol',
      'za večeras',
      'dobro veče',
      'hvala vam',
      'dvije osobe',
      'tri osobe'
    ],
    'en': [
      'restaurant fančita, maja speaking',
      'how can i help you',
      'would you like to make',
      'for how many people',
      'at what time',
      'is that correct'
    ],
    'de': [
      'restaurant fančita, maja am telefon',
      'wie kann ich ihnen helfen',
      'möchten sie einen tisch',
      'für wie viele personen',
      'um welche uhrzeit',
      'ist das korrekt'
    ],
    'it': [
      'ristorante fančita, maja al telefono',
      'come posso aiutarla',
      'vuole prenotare un tavolo',
      'per quante persone',
      'a che ora',
      'è corretto'
    ],
    'nl': [
      'restaurant fančita, maja aan de telefoon',
      'hoe kan ik u helpen',
      'wilt u een tafel reserveren',
      'voor hoeveel personen',
      'hoe laat',
      'is dat correct'
    ],
    'hr': [
      'restoran fančita, maja kod telefona',
      'kako vam mogu pomoći',
      'želite li rezervirati',
      'za koliko osoba',
      'u koje vrijeme',
      'je li točno'
    ]
  };
  
  // Check for language patterns
  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    const matchedPattern = patterns.find(pattern => text.includes(pattern));
    if (matchedPattern) {
      console.log(`[sip-webhook] 🔍 Language detected: ${lang} (matched: "${matchedPattern}")`);
      updateTranscriptionLanguage(ws, callId, lang);
      return;
    }
  }
  
  // Log if no language pattern matched
  console.log(`[sip-webhook] 🤷 No language pattern matched for: "${text.substring(0, 100)}..."`);
}

// Use shared function for replacing instruction variables
// (imported as sharedReplaceVariables from shared-instructions.cjs)

// File-based transcript logging with bridge integration
function logTranscriptEvent(sessionId, event) {
  try {
    // 1. Log to file (as before)
    const transcriptsDir = path.join(process.cwd(), 'logs', 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const logFile = path.join(transcriptsDir, `${sessionId}.log`);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.log(`[sip-webhook] 📝 Logged ${event.type} for ${sessionId}`);
    
    // 2. Send to transcript bridge for real-time display
    sendToTranscriptBridge(sessionId, event);
  } catch (error) {
    console.warn('[sip-webhook] Failed to log transcript:', error.message);
  }
}

// WebSocket connection to transcript bridge
let bridgeWs = null;

function connectToBridge() {
  if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN) return;
  
  try {
    bridgeWs = new WebSocket('ws://localhost:3002');
    
    bridgeWs.on('open', () => {
      console.log('[sip-webhook] 🌉 Connected to transcript bridge');
    });
    
    bridgeWs.on('error', (error) => {
      console.warn('[sip-webhook] 🌉 Bridge connection error:', error.message);
      bridgeWs = null;
    });
    
    bridgeWs.on('close', () => {
      console.log('[sip-webhook] 🌉 Bridge connection closed');
      bridgeWs = null;
      // Reconnect after delay
      setTimeout(connectToBridge, 5000);
    });
  } catch (error) {
    console.warn('[sip-webhook] 🌉 Failed to connect to bridge:', error.message);
  }
}

// Send events to transcript bridge for real-time display
function sendToTranscriptBridge(sessionId, event) {
  try {
    if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) {
      connectToBridge();
      return; // Skip this event, will work for next ones
    }
    
    const data = {
      type: 'transcript_event',
      sessionId,
      event
    };
    
    bridgeWs.send(JSON.stringify(data));
    console.log(`[sip-webhook] 📡 Sent ${event.type} to bridge for ${sessionId}`);
  } catch (error) {
    console.warn('[sip-webhook] Failed to send to bridge:', error.message);
    bridgeWs = null; // Reset connection
  }
}

// Initialize bridge connection
connectToBridge();

// Unified instructions are now loaded from shared file

// Tool definitions
const FANCITA_RESERVATION_TOOL = {
  type: 'function',
  name: 's6792596_fancita_rezervation_supabase',
  description: 'Create a table reservation for restaurant Fančita',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the guest' },
      date: { type: 'string', description: 'Date of reservation (YYYY-MM-DD)' },
      time: { type: 'string', description: 'Time of reservation (HH:MM)' },
      guests_number: { type: 'number', description: 'Number of guests' },
      location: { type: 'string', description: 'Location: vrt, terasa, or unutra' },
      notes: { type: 'string', description: 'Additional notes' },
      tel: { type: 'string', description: 'Phone number' },
      source_id: { type: 'string', description: 'Source conversation ID' }
    },
    required: ['name', 'date', 'time', 'guests_number', 'tel', 'source_id']
  }
};

const FANCITA_ORDER_TOOL = {
  type: 'function',
  name: 's6798488_fancita_order_supabase',
  description: 'Create a food/drink order for restaurant Fančita',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the customer' },
      date: { type: 'string', description: 'Delivery/pickup date (YYYY-MM-DD)' },
      delivery_time: { type: 'string', description: 'Delivery/pickup time (HH:MM)' },
      delivery_type: { type: 'string', description: 'delivery or pickup' },
      delivery_address: { type: 'string', description: 'Delivery address or "-" for pickup' },
      items: { 
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            price: { type: 'number' },
            notes: { type: 'string' }
          },
          required: ['name', 'qty', 'price']
        }
      },
      total: { type: 'number', description: 'Total amount' },
      notes: { type: 'string', description: 'Additional notes' },
      tel: { type: 'string', description: 'Phone number' },
      source_id: { type: 'string', description: 'Source conversation ID' }
    },
    required: ['name', 'date', 'delivery_time', 'delivery_type', 'delivery_address', 'items', 'total', 'tel', 'source_id']
  }
};

const FANCITA_HANDOFF_TOOL = {
  type: 'function',
  name: 'transfer_to_staff',
  description: 'Transfer call to restaurant staff',
  parameters: {
    type: 'object',
    properties: {
      problem_summary: { type: 'string', description: 'Summary of the guest problem' },
      guest_number: { type: 'string', description: 'Guest phone number' }
    },
    required: ['guest_number', 'problem_summary']
  }
};

const FANCITA_HANGUP_TOOL = {
  type: 'function',
  name: 'end_call',
  description: 'End the phone call when conversation is naturally completed',
  parameters: {
    type: 'object',
    properties: {
      reason: { 
        type: 'string', 
        description: 'Reason for ending call (e.g., "reservation_completed", "order_completed", "goodbye_exchanged")' 
      }
    },
    required: ['reason']
  }
};

// HTTP server for webhook
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      console.log('[sip-webhook] 📞 RAW REQUEST DEBUG:');
      console.log('  Method:', req.method);
      console.log('  URL:', req.url);
      console.log('  Headers:', JSON.stringify(req.headers, null, 2));
      console.log('  Body length:', body.length);
      console.log('  Body content:', body);
      console.log('  Body JSON:', body ? 'parsing...' : 'EMPTY!');
      
      const event = JSON.parse(body);
      const callId = event?.data?.call_id;

      if (!callId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'No call_id found' }));
        return;
      }

      if (event.type !== 'realtime.call.incoming') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ignored' }));
        return;
      }

      // Prevent duplicate accepts
      if (acceptedCallIds.has(callId)) {
        console.log('[sip-webhook] ⚠️ Call already accepted:', callId);
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'already_accepted' }));
        return;
      }

      // Extract caller info
      const callerFrom = event?.data?.sip_headers?.find(h => h.name === 'From')?.value || 'unknown';
      const callerPhone = callerFrom.includes('+') ? callerFrom : '+' + callerFrom.match(/\d+/)?.[0] || callerFrom;

      // Accept the call
      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`;
      const sharedInstructions = FANCITA_UNIFIED_INSTRUCTIONS();
      const instructions = sharedReplaceVariables(sharedInstructions, callerFrom, callId);
      
      // Debug: Check if instructions contain Croatian greeting
      const hasCroatianGreeting = instructions.includes('Restoran Fančita, Maja kod telefona');
      console.log(`[sip-webhook] 🔍 Instructions loaded: ${instructions.length} chars, Croatian greeting: ${hasCroatianGreeting}`);

      // Poenostavljen payload, ki deluje z OpenAI SIP integracijo
      const acceptPayload = {
        instructions: instructions,
        type: 'realtime',
        model: MODEL,
        audio: {
          output: { voice: VOICE }
        }
      };

      console.log('[sip-webhook] 🔄 Accepting call with payload:', JSON.stringify(acceptPayload, null, 2));

      const resAccept = await fetch(acceptUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          ...(OPENAI_PROJECT_ID ? { 'OpenAI-Project': OPENAI_PROJECT_ID } : {})
        },
        body: JSON.stringify(acceptPayload)
      });

      // Preberi odgovor kot text - KLJUČNO ZA DEBUGGING
      try {
        const responseText = await resAccept.text();
        console.log('[sip-webhook] 📄 Accept response text:', responseText);
        
        // Poskusi parsirati JSON
        let acceptResponse = null;
        try {
          acceptResponse = JSON.parse(responseText);
          console.log('[sip-webhook] 📄 Accept response parsed:', JSON.stringify(acceptResponse, null, 2));
        } catch (parseError) {
          console.log('[sip-webhook] ⚠️ Could not parse accept response JSON:', parseError.message);
        }

      if (!resAccept.ok) {
          console.error('[sip-webhook] ❌ Accept failed:', resAccept.status, resAccept.statusText);
          console.error('[sip-webhook] ❌ Accept response:', responseText);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Accept failed' }));
          return;
        }
      } catch (error) {
        console.error('[sip-webhook] ❌ Accept response error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Accept response error' }));
        return;
      }

      acceptedCallIds.add(callId);
      callLanguages.set(callId, 'hr'); // Initialize with Croatian
      console.log('\n\n[SIP-WEBHOOK] 📞📞📞 CALL ACCEPTED:', callId, '📞📞📞\n');

      // Dodaj Authorization header v odgovor - pomembno za SIP integracijo
      res.writeHead(200, {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ status: 'accepted', call_id: callId }));

      // Process call in background after responding to webhook - KOT V DELUJOČI VERZIJI
      processCall(callId, event, callerFrom, callerPhone);

    } catch (error) {
      console.error('[sip-webhook] ❌ Request error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

// Process call in background after responding to webhook - ENAKO KOT V DELUJOČI VERZIJI
async function processCall(callId, event, callerFrom, callerPhone) {
  try {
    // Wait for OpenAI to process the accept before connecting WebSocket
    console.log('[sip-webhook] ⏳ Waiting 1000ms for OpenAI to process accept...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Connect to WebSocket
    // Pravilen URL format za OpenAI SIP integracijo
    const wsUrl = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
    console.log('\n[SIP-WEBHOOK] 🔗🔗🔗 CONNECTING WEBSOCKET:', wsUrl, '🔗🔗🔗\n');
    
    const headers = {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
      'Content-Type': 'application/json',
      'origin': 'https://api.openai.com' // Ključen header za SIP integracijo
    };
    
    if (OPENAI_PROJECT_ID) headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
    console.log('[sip-webhook] 🔗 WebSocket headers:', JSON.stringify(headers, null, 2));
    
    const ws = new WebSocket(wsUrl, { headers });
    
    // Add more detailed error handling and unexpected-response handler
    ws.on('unexpected-response', (request, response) => {
      console.log(`\n\n[SIP-WEBHOOK] ❌❌❌ WEBSOCKET ERROR: ${response.statusCode} ❌❌❌\n`);
      // Try to read response body
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        console.log(`\n[SIP-WEBHOOK] ❌❌❌ ERROR DETAILS: ${body} ❌❌❌\n`);
      });
      });

      ws.on('open', () => {
        console.log('\n\n[SIP-WEBHOOK] ✅✅✅ WEBSOCKET CONNECTED:', callId, '✅✅✅\n');
        
        // Initialize language tracking to Croatian
        callLanguages.set(callId, 'hr');
        
        // Log session start with enhanced metadata
        const startTime = new Date();
        const initialLanguage = 'hr';
        
        logTranscriptEvent(callId, {
          type: 'session_start',
          sessionId: callId,
          content: `📞 Klic iz: ${callerPhone} | 📅 ${startTime.toLocaleDateString('sl-SI')} ${startTime.toLocaleTimeString('sl-SI')} | 🌍 Jezik: ${initialLanguage}`,
          metadata: { 
            callerPhone,
            startTime: startTime.toISOString(),
            startTimeFormatted: `${startTime.toLocaleDateString('sl-SI')} ${startTime.toLocaleTimeString('sl-SI')}`,
            model: MODEL,
            voice: VOICE,
            codec: SIP_CODEC,
            initialLanguage: initialLanguage,
            transcriptionModel: 'gpt-4o-transcribe',
            apiVersion: 'GA (gpt-realtime)',
            userTranscription: 'Enabled with GA audio.input.transcription'
          }
        });

        // GA VERZIJA: Nova struktura za SIP transkripcije
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            model: 'gpt-realtime',
            audio: {
              input: {
                format: { type: 'audio/pcmu' },
                transcription: {
                  model: 'gpt-4o-transcribe',
                  language: 'hr'
                },
                turn_detection: { type: 'server_vad' }
              },
              output: {
                format: { type: 'audio/pcmu' },
                voice: VOICE
              }
            }
          }
        }));

        console.log('[sip-webhook] 🎧 Audio format configured');
        
        // Takoj pošljemo response.create za začetni pozdrav
        ws.send(JSON.stringify({
          "type": "response.create"
        }));
        
        console.log('[sip-webhook] 🎤 Initial response triggered');
        
        // Počakamo dlje pred dodajanjem tools - KOT V DELUJOČI VERZIJI
        setTimeout(() => {
          const tools = [FANCITA_RESERVATION_TOOL, FANCITA_ORDER_TOOL, FANCITA_HANDOFF_TOOL, FANCITA_HANGUP_TOOL];
          
          // Pošljemo session.update s tools po uspešni vzpostavitvi osnovne povezave
          ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              tools: tools
            }
          }));
          
          console.log('[sip-webhook] ⚙️ Session configured with tools');
        }, 5000); // Počakamo 5 sekund pred dodajanjem tools
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('[sip-webhook] 📨 Message:', message.type);
          
          // Debug response events
          if (message.type && message.type.startsWith('response.')) {
            console.log('[sip-webhook] 🎭 Response event:', message.type, JSON.stringify(message, null, 2));
          }
          
          // Debug user message detection
          if (message.type === 'conversation.item.created' && message.item?.type === 'message' && message.item?.role === 'user') {
            console.log('[sip-webhook] 🐛 User message item:', JSON.stringify(message.item, null, 2));
          }
          
          // Catch any user-related events for debugging
          if (message.type && message.type.includes('conversation.item') && message.item?.role === 'user') {
            console.log('[sip-webhook] 👤 User event:', message.type, JSON.stringify(message.item, null, 2));
          }
          
          // Debug transcription events
          if (message.type === 'conversation.item.input_audio_transcription.completed') {
            console.log('[sip-webhook] 🐛 Audio transcription completed:', JSON.stringify(message, null, 2));
          }

          // Log transcript events - Enhanced logging
          if (message.type === 'conversation.item.input_audio_transcription.completed') {
            // User speech completed - log only once with metadata
            console.log('[sip-webhook] 🔄 User transcript received:', message.transcript);
            
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'user',
              content: message.transcript,
              timestamp: new Date().toISOString(),
              metadata: {
                currentLanguage: callLanguages.get(callId) || 'hr',
                transcriptionModel: 'gpt-4o-mini-transcribe',
                transcriptionComplete: true
              }
            });
            
          } else if (message.type === 'conversation.item.created' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Skip logging here - we'll log only when transcription is completed
            console.log('[sip-webhook] 🎤 User audio received, waiting for transcription...');
          } else if (message.type === 'conversation.item.added' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Check if user message has transcript
            console.log('[sip-webhook] 🔍 User item added:', JSON.stringify(message.item, null, 2));
            
            // Extract transcript from user message content if available
            const userContent = message.item?.content?.[0];
            if (userContent?.type === 'input_audio' && userContent.transcript) {
              console.log('[sip-webhook] 🔄 User transcript from item:', userContent.transcript);
              
              logTranscriptEvent(callId, {
                type: 'message',
                role: 'user',
                content: userContent.transcript,
                timestamp: new Date().toISOString(),
                metadata: {
                  currentLanguage: callLanguages.get(callId) || 'hr',
                  transcriptionModel: 'whisper-1',
                  source: 'conversation.item.added'
                }
              });
            }
          } else if (message.type === 'conversation.item.done' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Check conversation.item.done for user transcripts (alternative for SIP)
            console.log('[sip-webhook] 🔍 User item done:', JSON.stringify(message.item, null, 2));
            
            // Extract transcript from user message content if available
            const userContent = message.item?.content?.[0];
            if (userContent?.type === 'input_audio' && userContent.transcript) {
              console.log('[sip-webhook] 🔄 User transcript from done:', userContent.transcript);
              
              logTranscriptEvent(callId, {
                type: 'message',
                role: 'user',
                content: userContent.transcript,
                timestamp: new Date().toISOString(),
                metadata: {
                  currentLanguage: callLanguages.get(callId) || 'hr',
                  transcriptionModel: 'auto-sip',
                  source: 'conversation.item.done'
                }
              });
            }
          } else if (message.type === 'response.output_audio_transcript.done') {
            // Assistant speech completed
            const transcript = message.transcript || '';
            console.log('[sip-webhook] 🔄 Assistant transcript received:', transcript);
            
            // Do NOT detect language from assistant responses - only from user input
            
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'assistant', 
              content: transcript,
              timestamp: new Date().toISOString(),
              metadata: {
                currentLanguage: callLanguages.get(callId) || 'hr',
                transcriptionModel: 'gpt-4o-mini-transcribe'
              }
            });
          } else if (message.type === 'response.function_call_arguments.done') {
            // Tool call completed - track it as pending
            const parsedArgs = JSON.parse(message.arguments || '{}');
            
            // Track this tool call as pending
            if (!pendingToolResults.has(callId)) {
              pendingToolResults.set(callId, new Set());
            }
            pendingToolResults.get(callId).add(message.call_id);
            console.log(`[sip-webhook] 🔧 Tool call ${message.call_id} started, tracking as pending`);
            
            logTranscriptEvent(callId, {
              type: 'tool_call',
              tool_name: message.name,
              arguments: parsedArgs,  // ← ACTUAL VALUES, not JSON string
              call_id: message.call_id,
              timestamp: new Date().toISOString(),
              metadata: {
                toolName: message.name,
                callId: message.call_id,
                argumentCount: Object.keys(parsedArgs).length,
                argumentKeys: Object.keys(parsedArgs),
                fullArguments: parsedArgs  // ← FULL DATA for debugging
              }
            });
          } else if (message.type === 'conversation.item.created' && message.item?.type === 'function_call_output') {
            // Tool call result
            const output = message.item.output || {};
            // No need to parse - output is already an object now
            const parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
            
            logTranscriptEvent(callId, {
              type: 'tool_result',
              tool_call_id: message.item.call_id,
              result: parsedOutput,  // ← ACTUAL RESULT OBJECT, not JSON string
              timestamp: new Date().toISOString(),
              metadata: {
                callId: message.item.call_id,
                status: parsedOutput.success ? 'success' : 'error',
                resultType: typeof parsedOutput,
                hasData: !!(parsedOutput.data || parsedOutput.content),
                fullResult: parsedOutput,  // ← FULL RESULT for debugging
                mode: parsedOutput.mode || 'mcp',
                mcpSuccess: parsedOutput.success === true
              }
            });
            
            // Tool result is already sent by handleToolCall function
            // No need to send it again here to avoid conflicts
            
            // Mark this tool call as completed
            if (pendingToolResults.has(callId)) {
              pendingToolResults.get(callId).delete(message.item.call_id);
              console.log(`[sip-webhook] ✅ Tool call ${message.item.call_id} completed, ${pendingToolResults.get(callId).size} remaining`);
            }
            
            console.log(`[sip-webhook] 🔧 Tool result sent back to OpenAI for call ${message.item.call_id}`);
          } else if (message.type === 'error') {
            // Errors - include full error details and send urgent emails
            const errorDetails = message.error || message;
            const errorType = errorDetails.type || 'unknown_error';
            const errorCode = errorDetails.code || 'no_code';
            const errorMessage = errorDetails.message || 'No error message';
            
            console.warn('[sip-webhook] 🚨 OpenAI Error:', JSON.stringify(errorDetails, null, 2));
            
            // Pripravimo človeško berljiv opis napake
            let humanReadableError = '';
            let urgentSuggestions = [];
            let isUrgent = false;
            
            if (errorCode === 'insufficient_quota') {
              humanReadableError = 'ZMANJKALO JE KREDITA NA OPENAI RAČUNU';
              urgentSuggestions = [
                'Pojdite na https://platform.openai.com/account/billing',
                'Preverite Balance in dodajte kredit',
                'Preverite da ni API key zastarel',
                'Maja se ne bo odzvala dokler ni dodanega kredita!'
              ];
              isUrgent = true;
            } else if (errorCode === 'unknown_parameter') {
              humanReadableError = `NAPAČEN PARAMETER V API KLICU: ${errorDetails.param}`;
              urgentSuggestions = [
                'Parameter ni podprt za SIP klice',
                'Preverite dokumentacijo OpenAI Realtime API za SIP',
                'Odstranite ali popravite parameter v kodi'
              ];
              isUrgent = true;
            } else if (errorType === 'invalid_request_error') {
              humanReadableError = `NAPAČNA API ZAHTEVA: ${errorMessage}`;
              urgentSuggestions = [
                'Preverite parametre v session.update',
                'Preverite da uporabljate pravilno verzijo API',
                'Preverite dokumentacijo za SIP klice'
              ];
              isUrgent = true;
            } else {
              humanReadableError = `NEZNANA NAPAKA: ${errorType} - ${errorMessage}`;
              urgentSuggestions = [
                'Preverite OpenAI status stran',
                'Preverite internetno povezavo',
                'Ponovno zaženite sistem'
              ];
              isUrgent = false;
            }
            
            // Beležimo v transkript z detajlnim opisom
            logTranscriptEvent(callId, {
              type: 'error',
              role: 'system',
              content: humanReadableError,
              error_details: {
                type: errorType,
                code: errorCode,
                message: errorMessage,
                full_error: errorDetails
              },
              timestamp: new Date().toISOString(),
              metadata: {
                urgent: isUrgent,
                suggestions: urgentSuggestions
              }
            });
            
            // Pošljemo urgentni email če je napaka kritična
            if (isUrgent) {
              sendUrgentErrorEmail(
                humanReadableError,
                errorDetails,
                callId,
                urgentSuggestions
              ).catch(err => console.error('[sip-webhook] Email send failed:', err));
            }
          } else if (message.type === 'session.updated') {
            // Session updates
            logTranscriptEvent(callId, {
              type: 'session_update',
              session: message.session,
              timestamp: new Date().toISOString()
            });
          }

          // Handle tool calls
          if (message.type === 'response.function_call_arguments.done') {
            // Handle the actual tool call directly
            handleToolCall(ws, message, callerPhone, callId);
          }

          // Agent-controlled hangup - no more phrase detection
          // Maja will use the end_call tool when conversation is complete

        } catch (error) {
          console.error('[sip-webhook] ❌ Message parse error:', error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log('[sip-webhook] 🔚 WebSocket closed for', callId, 'Code:', code, 'Reason:', reason?.toString());
        
        // Cleanup tracking
        callLanguages.delete(callId);
        pendingToolResults.delete(callId);
        pendingHangups.delete(callId);
        
        logTranscriptEvent(callId, { 
          type: 'session_end', 
          sessionId: callId,
          endTime: new Date().toISOString(),
          closeCode: code,
          closeReason: reason?.toString()
        });
        acceptedCallIds.delete(callId);
        pendingHangups.delete(callId);
      });

      ws.on('error', (error) => {
        console.error('[sip-webhook] ❌ WebSocket error:', error);
        logTranscriptEvent(callId, {
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      console.error('[sip-webhook] ❌ Process call error:', error);
    }
  }

// Tool call handler
async function handleToolCall(ws, message, callerPhone, callId) {
  try {
    console.log('[sip-webhook] 🔧 Tool call:', message.name, message.arguments);
    
    // Execute tool call directly without processing message

    let result;
    if (message.name === 's6792596_fancita_rezervation_supabase' || message.name === 's6798488_fancita_order_supabase') {
      // Call MCP endpoint
      const mcpUrl = process.env.MCP_SERVER_URL;
      if (!mcpUrl) {
        throw new Error('MCP_SERVER_URL not configured in environment');
      }
      
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: message.name,
          data: JSON.parse(message.arguments)
        })
      });

      if (response.ok) {
        const mcpResponse = await response.json();
        console.log('[sip-webhook] ✅ MCP call successful:', mcpResponse);
        
        // Extract the actual result from MCP API wrapper
        if (mcpResponse.success && mcpResponse.data) {
          result = mcpResponse.data; // Use the actual MCP result
        } else {
          result = mcpResponse; // Fallback to full response
        }
      } else {
        result = { success: false, error: 'MCP call failed' };
      }
    } else if (message.name === 'transfer_to_staff') {
      // Simulate staff handoff
      result = { success: true, message: 'Transfer initiated' };
    } else if (message.name === 'end_call') {
      // Handle call termination - DO NOT send result back to avoid Maja saying it
      const args = JSON.parse(message.arguments);
      console.log(`[sip-webhook] 📞 Agent requested call end: ${args.reason}`);
      
      // Immediate hangup without sending tool result to Maja
      console.log('[sip-webhook] 📞 Agent-initiated hangup (immediate)');
      
      try {
        // Direktno zapremo povezavo brez spreminjanja session parametrov
        
        // Try to hangup via OpenAI API
        setTimeout(async () => {
          try {
            const hangupUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`;
            const hangupResponse = await fetch(hangupUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (hangupResponse.ok) {
              console.log('[sip-webhook] ✅ SIP call hung up via API');
            } else {
              console.log('[sip-webhook] ⚠️ API hangup failed, closing WebSocket');
              ws.close(1000, 'Agent ended call');
            }
          } catch (apiError) {
            console.error('[sip-webhook] ❌ API hangup error:', apiError);
            ws.close(1000, 'Agent ended call');
          }
        }, 4000); // Wait 3.2 seconds for Maja to finish speaking
        
      } catch (error) {
        console.error('[sip-webhook] ❌ Agent hangup error:', error);
        ws.close(1000, 'Agent ended call');
      }
      
      // Return early - don't send tool result back to OpenAI
      return;
    }

    // Send result back to OpenAI
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: message.call_id,
        output: JSON.stringify(result) // Stringify for OpenAI Realtime API
      }
    }));

    // Obnovimo GA transkripcijo po tool klicu
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: {
              model: 'gpt-4o-transcribe',
              language: callLanguages.get(callId) || 'hr'
            },
            turn_detection: { type: 'server_vad' }
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: 'marin'
          }
        }
      }
    }));
    
    // Trigger response so Maja can react to the tool result
    ws.send(JSON.stringify({ type: 'response.create' }));
    
    console.log(`[sip-webhook] 🔧 Tool result sent for call ${message.call_id}:`, result);
    console.log(`[sip-webhook] 🔧 Tool result type:`, typeof result, 'Success:', result?.success);
    console.log(`[sip-webhook] 🔧 Input audio transcription re-enabled for call ${callId}`);

  } catch (error) {
    console.error('[sip-webhook] ❌ Tool call error:', error);
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: message.call_id,
        output: { success: false, error: error.message } // Don't double-stringify
      }
    }));
  }
}

server.listen(PORT, () => {
  console.log(`[sip-webhook] 🚀 Pure Node.js SIP webhook server listening on port ${PORT}`);
  console.log(`[sip-webhook] 🔗 Configure Twilio webhook to: http://your-domain:${PORT}/webhook`);
});