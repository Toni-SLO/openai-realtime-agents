#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import settings from './settings.js';

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

// Conference mappings for warm transfer architecture (following Twilio tutorial)
global.callIDtoConferenceNameMapping = global.callIDtoConferenceNameMapping || {};
global.ConferenceNametoCallerIDMapping = global.ConferenceNametoCallerIDMapping || {};
global.ConferenceNametoCallTokenMapping = global.ConferenceNametoCallTokenMapping || {};

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
  
  const timestamp = new Date().toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' });
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
console.log(`[sip-webhook] 🔗 MCP_SERVER_URL: ${process.env.MCP_SERVER_URL ? 'SET' : 'NOT SET'}`);
console.log(`[sip-webhook] 📞 Staff Phone: ${process.env.STAFF_PHONE_NUMBER ? 'SET' : 'NOT SET'}`);
console.log(`[sip-webhook] 📞 Twilio Account: ${process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET'}`);
console.log(`[sip-webhook] 📞 Twilio Auth: ${process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET'}`);
console.log(`[sip-webhook] 📞 Twilio Phone: ${process.env.TWILIO_PHONE_NUMBER ? 'SET' : 'NOT SET'}`);

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
    console.log(`[sip-webhook] 📡 Attempting to send ${event.type} to bridge...`);
    sendToTranscriptBridge(sessionId, event);
  } catch (error) {
    console.warn('[sip-webhook] ❌ Failed to log transcript:', error.message);
  }
}

// WebSocket connection to transcript bridge
let bridgeWs = null;

function connectToBridge() {
  if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN) return;
  
  try {
    console.log('[sip-webhook] 🌉 Attempting to connect to transcript bridge...');
    bridgeWs = new WebSocket('ws://localhost:3002');
    
    bridgeWs.on('open', () => {
      console.log('[sip-webhook] 🌉 ✅ Connected to transcript bridge');
    });
    
    bridgeWs.on('error', (error) => {
      console.warn('[sip-webhook] 🌉 ❌ Bridge connection error:', error.message);
      bridgeWs = null;
    });
    
    bridgeWs.on('close', () => {
      console.log('[sip-webhook] 🌉 Bridge connection closed, will retry in 5s');
      bridgeWs = null;
      // Reconnect after delay
      setTimeout(connectToBridge, 5000);
    });
  } catch (error) {
    console.warn('[sip-webhook] 🌉 ❌ Failed to connect to bridge:', error.message);
    // Retry after delay
    setTimeout(connectToBridge, 5000);
  }
}

// Send events to transcript bridge for real-time display
function sendToTranscriptBridge(sessionId, event) {
  try {
    if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) {
      console.log(`[sip-webhook] 📡 Bridge not ready, attempting reconnect for ${event.type}`);
      connectToBridge();
      return; // Skip this event, will work for next ones
    }
    
    const data = {
      type: 'transcript_event',
      sessionId,
      event
    };
    
    bridgeWs.send(JSON.stringify(data));
    console.log(`[sip-webhook] 📡 ✅ Sent ${event.type} to bridge for ${sessionId}`);
  } catch (error) {
    console.warn('[sip-webhook] 📡 ❌ Failed to send to bridge:', error.message);
    bridgeWs = null; // Reset connection
    connectToBridge(); // Try to reconnect immediately
  }
}

// Initialize bridge connection
connectToBridge();

// Staff transfer functionality using direct Twilio call (no conference)
async function createStaffConference(callId, guestPhone, staffPhone, problemSummary) {
  try {
    console.log(`[sip-webhook] 🔧 DEBUG: createStaffConference called (direct call mode)`);
    console.log(`[sip-webhook] 🔧 DEBUG: callId = ${callId}`);
    console.log(`[sip-webhook] 🔧 DEBUG: guestPhone = ${guestPhone}`);
    console.log(`[sip-webhook] 🔧 DEBUG: staffPhone = ${staffPhone}`);
    console.log(`[sip-webhook] 🔧 DEBUG: problemSummary = ${problemSummary}`);
    
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    console.log(`[sip-webhook] 🔧 DEBUG: Twilio credentials check:`);
    console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_ACCOUNT_SID = ${twilioAccountSid ? 'SET' : 'NOT SET'}`);
    console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_AUTH_TOKEN = ${twilioAuthToken ? 'SET' : 'NOT SET'}`);
    console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_PHONE_NUMBER = ${twilioPhoneNumber ? 'SET' : 'NOT SET'}`);
    
    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      const error = 'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)';
      console.log(`[sip-webhook] ❌ ${error}`);
      return {
        success: false,
        error: error
      };
    }
    
    // Call staff member with English summary (Twilio voice works better with English)
    const englishSummary = `Call from Fancita Restaurant. Guest issue: ${problemSummary}. Guest is waiting on the line. Press any key to connect.`;
    
    console.log(`[sip-webhook] 📞 Calling staff directly: ${staffPhone}`);
    
    const staffCallResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: twilioPhoneNumber,
        To: staffPhone,
        Url: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/staff-direct-twiml?callId=${encodeURIComponent(callId)}&summary=${encodeURIComponent(englishSummary)}`,
        Method: 'GET',
        StatusCallback: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/call-status`,
        StatusCallbackMethod: 'POST'
      })
    });
    
    if (!staffCallResponse.ok) {
      const errorText = await staffCallResponse.text();
      console.log(`[sip-webhook] ❌ Failed to call staff: ${staffCallResponse.status} ${errorText}`);
      return {
        success: false,
        error: `Failed to call staff: ${staffCallResponse.status} ${errorText}`
      };
    }
    
    const staffCall = await staffCallResponse.json();
    console.log(`[sip-webhook] 📞 Staff call initiated: ${staffCall.sid}`);
    
    // Store the call info for later redirect via TwiML
    console.log(`[sip-webhook] 📞 Staff call initiated, storing call info for redirect...`);
    
    // Store call mapping for TwiML redirect
    if (!global.pendingTransfers) {
      global.pendingTransfers = new Map();
    }
    global.pendingTransfers.set(callId, {
      staffPhone: staffPhone,
      staffCallSid: staffCall.sid,
      guestPhone: guestPhone,
      guestCallSid: null, // Will be set when we have it
      timestamp: Date.now()
    });
    
    console.log(`[sip-webhook] 📞 Call info stored for ${callId}, staff will be connected via TwiML`);
    
    // The actual redirect will happen when staff presses a key via /staff-connect endpoint
    
    return {
      success: true,
      staff_call_sid: staffCall.sid,
      transfer_method: 'direct_call'
    };
    
  } catch (error) {
    console.error('[sip-webhook] ❌ Staff transfer error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// New conference-based approach (following Twilio tutorial)
// NEW: Schedule staff callback after Maja ends call
async function scheduleStaffCallback(callId, problemSummary, guestPhone) {
  console.log(`[sip-webhook] 📞 Scheduling staff callback for ${callId}`);
  console.log(`[sip-webhook] 📞 Guest phone: ${guestPhone}`);
  console.log(`[sip-webhook] 📞 Problem: ${problemSummary}`);
  
  const conferenceName = `callback_${callId}_${Date.now()}`;
  const staffPhone = process.env.STAFF_PHONE_NUMBER;
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (!staffPhone || !twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    console.error(`[sip-webhook] ❌ Missing required credentials for callback`);
    return { success: false, error: 'Missing credentials' };
  }
  
  // Store callback info
  if (!global.pendingCallbacks) {
    global.pendingCallbacks = new Map();
  }
  
  global.pendingCallbacks.set(callId, {
    conferenceName,
    guestPhone,
    staffPhone,
    problemSummary,
    timestamp: Date.now(),
    status: 'scheduled'
  });
  
  try {
    console.log(`[sip-webhook] 📞 Calling staff first: ${staffPhone}`);
    
    // Step 1: Call staff first with summary
    const staffCallResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: twilioPhoneNumber,
        To: staffPhone,
        Url: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/staff-callback-twiml?callId=${callId}&conferenceName=${encodeURIComponent(conferenceName)}`,
        Method: 'GET',
        StatusCallback: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/staff-callback-status`,
        StatusCallbackEvent: 'answered,completed',
        StatusCallbackMethod: 'POST'
      })
    });
    
    if (staffCallResponse.ok) {
      const staffCallData = await staffCallResponse.json();
      console.log(`[sip-webhook] ✅ Staff call initiated: ${staffCallData.sid}`);
      
      // Update callback info
      const callbackInfo = global.pendingCallbacks.get(callId);
      if (callbackInfo) {
        callbackInfo.staffCallSid = staffCallData.sid;
        callbackInfo.status = 'calling_staff';
        global.pendingCallbacks.set(callId, callbackInfo);
      }
      
      return {
        success: true,
        message: 'Staff callback scheduled',
        conference_name: conferenceName,
        staff_call_sid: staffCallData.sid
      };
      
    } else {
      const errorText = await staffCallResponse.text();
      console.error(`[sip-webhook] ❌ Failed to call staff: ${staffCallResponse.status} ${errorText}`);
      return { success: false, error: `Failed to call staff: ${staffCallResponse.status}` };
    }
    
  } catch (error) {
    console.error(`[sip-webhook] ❌ Error scheduling staff callback: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function addHumanToConference(callId, problemSummary) {
  console.log(`[sip-webhook] 🔧 DEBUG: addHumanToConference called (conference mode)`);
  console.log(`[sip-webhook] 🔧 DEBUG: callId = ${callId}`);
  console.log(`[sip-webhook] 🔧 DEBUG: problemSummary = ${problemSummary}`);
  
  // Get conference name from mapping
  const conferenceName = global.callIDtoConferenceNameMapping[callId];
  const callerID = global.ConferenceNametoCallerIDMapping[conferenceName];
  const callToken = global.ConferenceNametoCallTokenMapping[conferenceName];
  
  if (!conferenceName) {
    console.error(`[sip-webhook] ❌ Conference name not found for call ID: ${callId}`);
    return { success: false, error: 'Conference name not found' };
  }
  
  console.log(`[sip-webhook] 📞 Adding human to conference: ${conferenceName}`);
  console.log(`[sip-webhook] 📞 Caller ID: ${callerID}`);
  console.log(`[sip-webhook] 📞 Call Token: ${callToken ? 'SET' : 'NOT SET'}`);
  
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const staffPhone = process.env.STAFF_PHONE_NUMBER;
  
  if (!twilioAccountSid || !twilioAuthToken || !staffPhone) {
    console.error(`[sip-webhook] ❌ Missing Twilio credentials or staff phone`);
    return { success: false, error: 'Missing credentials' };
  }
  
  try {
    // Add human agent to the existing conference
    const participantResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Conferences/${encodeURIComponent(conferenceName)}/Participants.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: callerID || process.env.TWILIO_PHONE_NUMBER,
        To: staffPhone,
        Label: 'human agent',
        EarlyMedia: 'false',
        ...(callToken && { CallToken: callToken })
      })
    });
    
    if (!participantResponse.ok) {
      const errorText = await participantResponse.text();
      console.error(`[sip-webhook] ❌ Failed to add human to conference: ${participantResponse.status} ${errorText}`);
      return { success: false, error: `Failed to add human: ${participantResponse.status}` };
    }
    
    const participantData = await participantResponse.json();
    console.log(`[sip-webhook] ✅ Human agent added to conference: ${participantData.call_sid}`);
    
    // Store transfer info for cleanup
    if (!global.pendingTransfers) {
      global.pendingTransfers = new Map();
    }
    
    global.pendingTransfers.set(callId, {
      conferenceName,
      staffPhone,
      staffCallSid: participantData.call_sid,
      timestamp: Date.now(),
      staffConnected: true
    });
    
    return {
      success: true,
      staff_call_sid: participantData.call_sid,
      conference_name: conferenceName,
      transfer_method: 'conference_participant'
    };
    
  } catch (error) {
    console.error(`[sip-webhook] ❌ Error adding human to conference: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Unified instructions are now loaded from shared file

// Tool definitions with MCP schema validation
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

// MCP Schema validation function
function validateMCPParameters(toolName, parameters) {
  const toolSchemas = {
    's6792596_fancita_rezervation_supabase': {
      required: settings.validation.requiredReservationFields
    },
    's6798488_fancita_order_supabase': {
      required: settings.validation.requiredOrderFields
    }
  };
  
  const schema = toolSchemas[toolName];
  if (!schema) return { valid: true }; // Unknown tool, skip validation
  
  const missing = [];
  const invalid = [];
  
  // 1. Check for missing required fields
  for (const field of schema.required) {
    const value = parameters[field];
    if (settings.validation.forbiddenValues.includes(value)) {
      missing.push(field);
    }
  }
  
  // 2. Business rules validation (only if no missing fields)
  if (missing.length === 0) {
    // RESERVATION VALIDATION
    if (toolName === 's6792596_fancita_rezervation_supabase') {
      // Validate time format and business hours
      const time = parameters.time;
      if (time && !isValidReservationTime(time)) {
        invalid.push(`time: "${time}" - ${settings.businessHours.reservations.description}`);
      }
      
      // Validate number of guests
      const guests = parseInt(parameters.guests_number);
      if (isNaN(guests) || guests < settings.guestLimits.minGuests) {
        invalid.push(`guests_number: "${parameters.guests_number}" - ${settings.guestLimits.minGuestsMessage}`);
      } else if (guests > settings.guestLimits.maxGuests) {
        invalid.push(`guests_number: "${guests}" - ${settings.guestLimits.maxGuestsMessage}`);
      }
    }
    
    // ORDER VALIDATION  
    if (toolName === 's6798488_fancita_order_supabase') {
      // Validate delivery time format and business hours
      const deliveryTime = parameters.delivery_time;
      if (deliveryTime && !isValidDeliveryTime(deliveryTime)) {
        invalid.push(`delivery_time: "${deliveryTime}" - ${settings.businessHours.delivery.description}`);
      }
      
      // Validate total is positive
      const total = parseFloat(parameters.total);
      if (isNaN(total) || total < settings.validation.minOrderTotal) {
        invalid.push(`total: "${parameters.total}" - ${settings.validation.minOrderTotalMessage}`);
      }
      
      // Validate items array
      if (!Array.isArray(parameters.items) || parameters.items.length === 0) {
        invalid.push(`items: ${settings.validation.messages.emptyItemsArray}`);
      }
    }
  }
  
  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing: missing,
    invalid: invalid
  };
}

// Helper function to validate reservation time (uses settings)
function isValidReservationTime(timeStr) {
  const timeMatch = timeStr.match(settings.validation.timeFormatRegex);
  if (!timeMatch) return false;
  
  const hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;
  
  const { startHour, endHour } = settings.businessHours.reservations;
  if (hours < startHour || hours > endHour) return false;
  
  return true;
}

// Helper function to validate delivery time (uses settings)
function isValidDeliveryTime(timeStr) {
  const timeMatch = timeStr.match(settings.validation.timeFormatRegex);
  if (!timeMatch) return false;
  
  const hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;
  
  const { startHour, endHour } = settings.businessHours.delivery;
  if (hours < startHour || hours > endHour) return false;
  
  return true;
}

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
      delivery_address: { type: 'string', description: 'Delivery address or "Fančita" for pickup' },
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

const FANCITA_MENU_TOOL = {
  type: 'function',
  name: 'search_menu',
  description: 'Search restaurant menu for items, prices, and ingredients in the specified language',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term for menu items (e.g. "pizza", "carpaccio", "morski sadeži")' },
      language: { type: 'string', description: 'Language code (hr, sl, en, de, it, nl)', default: 'hr' },
      get_full_menu: { type: 'boolean', description: 'Return complete menu in specified language', default: false }
    },
    required: ['language']
  }
};

const FANCITA_LANGUAGE_TOOL = {
  type: 'function',
  name: 'switch_language',
  description: 'Switch conversation language and update transcription model',
  parameters: {
    type: 'object',
    properties: {
      language_code: { type: 'string', description: 'Language code to switch to (hr, sl, en, de, it, nl)' },
      detected_phrases: { type: 'string', description: 'Phrases that indicated the language switch' }
    },
    required: ['language_code', 'detected_phrases']
  }
};

// HTTP server for webhook
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Handle TwiML endpoints for staff transfer
  if (url.pathname === '/staff-direct-twiml' && req.method === 'GET') {
    const callId = url.searchParams.get('callId');
    const summary = url.searchParams.get('summary') || 'Poziv iz restorana Fančita.';
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">${summary}</Say>
    <Gather numDigits="1" timeout="30" action="${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/staff-connect?callId=${encodeURIComponent(callId)}" method="POST">
        <Say voice="alice" language="en-US">Press any key to connect with the guest.</Say>
    </Gather>
    <Say voice="alice" language="en-US">No response. Call ending.</Say>
    <Hangup/>
</Response>`;
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml);
    console.log(`[sip-webhook] 📞 Staff direct TwiML served for call: ${callId}`);
    return;
  }
  
  if (url.pathname === '/staff-connect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const staffCallSid = params.get('CallSid');
      const callId = url.searchParams.get('callId');
      
      console.log(`[sip-webhook] 📞 Staff pressed key for call: ${callId}, staff call: ${staffCallSid}`);
      
      const transferInfo = global.pendingTransfers?.get(callId);
      if (transferInfo) {
        console.log(`[sip-webhook] 📞 Found transfer info:`, transferInfo);
        
        const conferenceId = `transfer_${callId.replace('rtc_', '')}_${Date.now()}`;
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Connecting you with the guest. Please wait.</Say>
    <Dial>
        <Conference startConferenceOnEnter="true" endConferenceOnExit="true">${conferenceId}</Conference>
    </Dial>
</Response>`;
        
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml);
        console.log(`[sip-webhook] 📞 Staff joining conference: ${conferenceId}`);
        
        // Store conference info and close OpenAI session
        setTimeout(async () => {
          try {
            console.log(`[sip-webhook] 📞 Attempting to end OpenAI session for guest redirect...`);
            
            global.pendingTransfers.set(callId, {
              ...transferInfo,
              conferenceId: conferenceId,
              staffConnected: true
            });
            
            const ws = global.activeSessions?.get(callId);
            if (ws && ws.readyState === 1) {
              console.log(`[sip-webhook] 📞 Closing OpenAI WebSocket for ${callId}`);
              ws.close();
            }
          } catch (error) {
            console.error(`[sip-webhook] ❌ Error handling staff connect:`, error);
          }
        }, 1000);
        
      } else {
        console.error(`[sip-webhook] ❌ No transfer info found for call: ${callId}`);
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="hr-HR">Greška pri povezivanju. Poziv se završava.</Say>
    <Hangup/>
</Response>`;
        
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml);
      }
    });
    return;
  }
  
  // Staff callback TwiML - plays summary and waits for keypress
  if (url.pathname === '/staff-callback-twiml' && req.method === 'GET') {
    const callId = url.searchParams.get('callId');
    const conferenceName = url.searchParams.get('conferenceName');
    
    if (!callId || !conferenceName) {
      res.writeHead(400);
      res.end('Missing callId or conferenceName parameter');
      return;
    }
    
    const callbackInfo = global.pendingCallbacks?.get(callId);
    const problemSummary = callbackInfo?.problemSummary || 'Customer requested to speak with staff';
    
    console.log(`[sip-webhook] 📞 Staff callback TwiML served for ${callId}`);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Hello, this is Fancita restaurant. A customer needs assistance. Problem summary: ${problemSummary.replace(/[<>&"']/g, '')}. Press any key when ready to connect.</Say>
    <Gather numDigits="1" timeout="30" action="${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/staff-ready?callId=${encodeURIComponent(callId)}&amp;conferenceName=${encodeURIComponent(conferenceName)}" method="POST">
        <Say voice="alice" language="en-US">Press any key to connect with the customer.</Say>
    </Gather>
    <Say voice="alice" language="en-US">No response received. Hanging up.</Say>
    <Hangup/>
</Response>`;
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml);
    return;
  }
  
  // Staff ready - staff pressed key, now call guest
  if (url.pathname === '/staff-ready' && req.method === 'POST') {
    // Get parameters from URL query string (Twilio sends them there)
    const callId = url.searchParams.get('callId');
    const conferenceName = url.searchParams.get('conferenceName');
    
    console.log(`[sip-webhook] 🔧 DEBUG: URL params - callId: ${callId}, conferenceName: ${conferenceName}`);
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        console.log(`[sip-webhook] 🔧 DEBUG: Staff ready body:`, body);
        console.log(`[sip-webhook] 📞 Staff ready for ${callId}, calling guest now`);
        
        if (!callId || !conferenceName) {
          console.error(`[sip-webhook] ❌ Missing callId or conferenceName in staff-ready`);
          res.writeHead(400);
          res.end('Missing parameters');
          return;
        }
        
        const callbackInfo = global.pendingCallbacks?.get(callId);
        if (callbackInfo) {
          callbackInfo.status = 'staff_ready';
          global.pendingCallbacks.set(callId, callbackInfo);
          
          // Put staff in conference first
          const staffConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Connecting you with the customer now.</Say>
    <Dial>
        <Conference statusCallback="${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/conference-events" statusCallbackEvent="join,leave" statusCallbackMethod="POST">${conferenceName}</Conference>
    </Dial>
</Response>`;
          
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(staffConferenceTwiml);
          
          // Now call guest to join conference
          setTimeout(() => callGuestToConference(callId, conferenceName), 1000);
        } else {
          res.writeHead(404);
          res.end('Callback info not found');
        }
      } catch (error) {
        console.error(`[sip-webhook] ❌ Error in staff-ready:`, error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    return;
  }
  
  // Staff callback status - monitor staff call status
  if (url.pathname === '/staff-callback-status' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = new URLSearchParams(body);
        const callStatus = params.get('CallStatus');
        const callSid = params.get('CallSid');
        
        console.log(`[sip-webhook] 📞 Staff callback status: ${callStatus} for ${callSid}`);
        
        res.writeHead(200);
        res.end('OK');
      } catch (error) {
        console.error(`[sip-webhook] ❌ Error processing staff callback status:`, error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    return;
  }

  if (url.pathname === '/guest-conference-twiml' && req.method === 'GET') {
    // TwiML to redirect guest to conference
    const conferenceId = url.searchParams.get('conferenceId');
    
    if (!conferenceId) {
      res.writeHead(400);
      res.end('Missing conferenceId');
      return;
    }
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Connecting you with our staff.</Say>
    <Dial>
        <Conference>${conferenceId}</Conference>
    </Dial>
    <Say voice="alice" language="en-US">Call ending.</Say>
    <Hangup/>
</Response>`;
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml);
    console.log(`[sip-webhook] 📞 Guest conference TwiML served for conference: ${conferenceId}`);
    return;
  }
  
  if (url.pathname === '/call-status' && req.method === 'POST') {
    // Twilio call status callback
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const callSid = params.get('CallSid');
      const callStatus = params.get('CallStatus');
      const from = params.get('From');
      const to = params.get('To');
      
      console.log(`[sip-webhook] 📞 Call ${callSid} status: ${callStatus}, from: ${from}, to: ${to}`);
      
      // If this is an incoming call to our Twilio number, try to map it to OpenAI call
      if (callStatus === 'in-progress' && to === process.env.TWILIO_PHONE_NUMBER) {
        // Find the most recent OpenAI call that doesn't have a Twilio call SID yet
        if (global.callSidMapping) {
          for (const [openaiCallId, storedCallSid] of global.callSidMapping.entries()) {
            if (storedCallSid === null || storedCallSid === undefined) {
              console.log(`[sip-webhook] 📞 Mapping Twilio call ${callSid} to OpenAI call ${openaiCallId}`);
              global.callSidMapping.set(openaiCallId, callSid);
              break;
            }
          }
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }
  
  if (url.pathname === '/conference-events' && req.method === 'POST') {
    // Conference events callback (following Twilio tutorial)
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const params = new URLSearchParams(body);
      const participantLabel = params.get('ParticipantLabel');
      const statusCallbackEvent = params.get('StatusCallbackEvent');
      const conferenceSid = params.get('ConferenceSid');
      const callSid = params.get('CallSid');
      
      console.log(`[sip-webhook] 🏗️ Conference event: ${statusCallbackEvent}, participant: ${participantLabel}, conference: ${conferenceSid}`);
      
      // When human agent joins, remove AI agent
      if (participantLabel === 'human agent' && statusCallbackEvent === 'participant-join') {
        console.log(`[sip-webhook] 🤖 Human agent joined, removing AI agent from conference`);
        
        try {
          const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
          const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
          
          if (!twilioAccountSid || !twilioAuthToken) {
            console.error(`[sip-webhook] ❌ Missing Twilio credentials for participant removal`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
          }
          
          // List all participants in the conference
          const participantsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Conferences/${conferenceSid}/Participants.json`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`
            }
          });
          
          if (participantsResponse.ok) {
            const participantsData = await participantsResponse.json();
            console.log(`[sip-webhook] 📋 Found ${participantsData.participants.length} participants in conference`);
            
            // Find and remove virtual agent
            for (const participant of participantsData.participants) {
              if (participant.label === 'virtual agent') {
                console.log(`[sip-webhook] 🤖 Removing AI agent: ${participant.call_sid}`);
                
                // End the AI agent's call
                const removeResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls/${participant.call_sid}.json`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                  },
                  body: new URLSearchParams({
                    Status: 'completed'
                  })
                });
                
                if (removeResponse.ok) {
                  console.log(`[sip-webhook] ✅ AI agent removed successfully`);
                  
                  // Also close the OpenAI WebSocket session
                  if (global.activeWebSockets) {
                    for (const [callId, ws] of global.activeWebSockets.entries()) {
                      const transferInfo = global.pendingTransfers?.get(callId);
                      if (transferInfo && transferInfo.conferenceName === conferenceSid) {
                        console.log(`[sip-webhook] 🔚 Closing OpenAI session for transferred call: ${callId}`);
                        ws.close();
                        global.pendingTransfers.delete(callId);
                        break;
                      }
                    }
                  }
                } else {
                  console.error(`[sip-webhook] ❌ Failed to remove AI agent: ${removeResponse.status}`);
                }
              }
            }
          } else {
            console.error(`[sip-webhook] ❌ Failed to list conference participants: ${participantsResponse.status}`);
          }
        } catch (error) {
          console.error(`[sip-webhook] ❌ Error handling conference event: ${error.message}`);
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }
  
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      console.log('[sip-webhook] 📞 Incoming webhook request');
      
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
      
      // Check if this is a guest redirect to conference after staff transfer
      const transferInfo = global.pendingTransfers?.get(callId);
      console.log(`[sip-webhook] 🔍 Checking transfer info for ${callId}:`, transferInfo);
      
      if (transferInfo && transferInfo.staffConnected && transferInfo.conferenceId) {
        console.log(`[sip-webhook] 📞 Redirecting guest to conference: ${transferInfo.conferenceId}`);
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">Connecting you with our staff.</Say>
    <Dial>
        <Conference>${transferInfo.conferenceId}</Conference>
    </Dial>
    <Say voice="alice" language="en-US">Call ending.</Say>
    <Hangup/>
</Response>`;
        
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml);
        
        // Clean up transfer info
        global.pendingTransfers.delete(callId);
        console.log(`[sip-webhook] 📞 Guest redirected to conference, transfer completed`);
        return;
      }

      // Extract caller info
      const callerFrom = event?.data?.sip_headers?.find(h => h.name === 'From')?.value || 'unknown';
      
      // Extract clean phone number from SIP From header
      // SIP From header can be like: "38641734134" <sip:+38641734134@pstn.twilio.com>;tag=...
      // or: "+38641734134" <sip:+38641734134@pstn.twilio.com>;tag=...
      let callerPhone = 'unknown';
      if (callerFrom !== 'unknown') {
        // Try to extract phone number from various SIP From header formats
        const phoneMatch = callerFrom.match(/(?:^|["\s])(\+?\d{8,15})(?:["\s<>]|$)/);
        if (phoneMatch) {
          callerPhone = phoneMatch[1];
          // Ensure phone number starts with +
          if (!callerPhone.startsWith('+') && callerPhone.match(/^\d{8,15}$/)) {
            callerPhone = '+' + callerPhone;
          }
        } else {
          // Fallback: use original logic but log warning
          console.warn(`[sip-webhook] ⚠️ Could not extract clean phone from SIP header: ${callerFrom}`);
          callerPhone = callerFrom.includes('+') ? callerFrom : '+' + callerFrom.match(/\d+/)?.[0] || callerFrom;
        }
      }
      
      // Extract Twilio call SID from the event - try multiple possible locations
      const twilioCallSid = event?.data?.call_sid || event?.call_sid || event?.data?.sip_headers?.find(h => h.name === 'Call-ID')?.value || null;
      console.log(`[sip-webhook] 📞 Twilio call SID: ${twilioCallSid}`);
      
      // Store Twilio call SID for potential staff transfer
      if (!global.callSidMapping) {
        global.callSidMapping = new Map();
      }
      
      if (twilioCallSid) {
        global.callSidMapping.set(callId, twilioCallSid);
        console.log(`[sip-webhook] 📞 Stored call mapping: ${callId} -> ${twilioCallSid}`);
      } else {
        // Store placeholder - will be updated by status callback
        global.callSidMapping.set(callId, null);
        console.log(`[sip-webhook] 📞 Stored placeholder mapping for ${callId}, waiting for status callback`);
      }

      // Conference-based approach: Create conference and add participants
      const conferenceName = `transfer_${callId}_${Date.now()}`;
      
      // Store conference mappings
      global.callIDtoConferenceNameMapping[callId] = conferenceName;
      global.ConferenceNametoCallerIDMapping[conferenceName] = callerPhone;
      // Note: CallToken will be extracted from OpenAI webhook if available
      
      console.log(`[sip-webhook] 🏗️ Creating conference: ${conferenceName}`);
      console.log(`[sip-webhook] 📞 Mapping ${callId} -> ${conferenceName}`);
      
      // IMPORTANT: For true warm transfer, we need to immediately redirect this call to conference
      // and add AI agent as a participant, but OpenAI Realtime doesn't support this directly
      console.log(`[sip-webhook] ⚠️ Note: Current implementation uses hybrid approach - AI direct + staff conference`);
      
      // Accept the call first
      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`;
      const sharedInstructions = FANCITA_UNIFIED_INSTRUCTIONS();
      const baseInstructions = sharedReplaceVariables(sharedInstructions, callerFrom, callId);
      const nowSl = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Ljubljana' }));
      const nowStr = nowSl.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' });
      const instructions = `${baseInstructions}\n\n[Timezone] Vedno uporabljaj Europe/Ljubljana. Trenutni datum in čas v Sloveniji: ${nowStr}.`;
      
      // Debug: Check if instructions contain Croatian greeting
      const hasCroatianGreeting = instructions.includes('Restoran Fančita, Maja kod telefona');
      console.log(`[sip-webhook] 🔍 Instructions loaded: ${instructions.length} chars, Croatian greeting: ${hasCroatianGreeting}`);

      // Poenostavljen payload, ki deluje z OpenAI SIP integracijo
      const acceptPayload = {
        instructions: instructions,
        type: 'realtime',
        model: MODEL,
        audio: {
          output: { 
            voice: VOICE,
            format: SIP_CODEC // g711_ulaw for SIP compatibility
          }
        }
      };

      console.log('[sip-webhook] 🔄 Accepting call:', callId);
      console.log('[sip-webhook] 🔄 Accept URL:', acceptUrl);
      console.log('[sip-webhook] 🔄 Accept payload:', JSON.stringify(acceptPayload, null, 2));

      const resAccept = await fetch(acceptUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          ...(OPENAI_PROJECT_ID ? { 'OpenAI-Project': OPENAI_PROJECT_ID } : {})
        },
        body: JSON.stringify(acceptPayload)
      });

      console.log('[sip-webhook] 🔄 Accept response status:', resAccept.status);
      
      if (!resAccept.ok) {
        const responseText = await resAccept.text();
        console.error('[sip-webhook] ❌ Accept failed:', resAccept.status, resAccept.statusText);
        console.error('[sip-webhook] ❌ Accept response:', responseText);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Accept failed' }));
        return;
      } else {
        const responseText = await resAccept.text();
        console.log('[sip-webhook] ✅ Accept successful, response:', responseText);
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
    
    const ws = new WebSocket(wsUrl, { headers });
    
    // Add more detailed error handling and unexpected-response handler
    ws.on('unexpected-response', (request, response) => {
      console.log(`\n\n[SIP-WEBHOOK] ❌❌❌ WEBSOCKET ERROR: ${response.statusCode} ❌❌❌\n`);
      console.log(`[SIP-WEBHOOK] ❌ Response headers:`, response.headers);
      // Try to read response body
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        console.log(`\n[SIP-WEBHOOK] ❌❌❌ ERROR DETAILS: ${body} ❌❌❌\n`);
      });
    });
    
    ws.on('error', (error) => {
      console.error(`[SIP-WEBHOOK] ❌ WebSocket connection error:`, error);
    });
    
    // Add timeout for connection
    const connectionTimeout = setTimeout(() => {
      console.error(`[SIP-WEBHOOK] ❌ WebSocket connection timeout after 10 seconds`);
      ws.close();
    }, 10000);

      ws.on('open', () => {
        clearTimeout(connectionTimeout); // Clear the timeout
        console.log('\n\n[SIP-WEBHOOK] ✅✅✅ WEBSOCKET CONNECTED:', callId, '✅✅✅\n');
        
        // Store active session for later reference
        if (!global.activeSessions) {
          global.activeSessions = new Map();
        }
        global.activeSessions.set(callId, ws);
        
        // Initialize language tracking to Croatian
        callLanguages.set(callId, 'hr');
        
        // Log session start with enhanced metadata
        const startTime = new Date();
        const initialLanguage = 'hr';
        
        logTranscriptEvent(callId, {
          type: 'session_start',
          sessionId: callId,
          content: `📞 Klic iz: ${callerPhone} | 📅 ${startTime.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' })} ${startTime.toLocaleTimeString('sl-SI', { timeZone: 'Europe/Ljubljana' })} | 🌍 Jezik: ${initialLanguage}`,
          metadata: { 
            callerPhone,
            startTime: startTime.toISOString(),
            startTimeFormatted: `${startTime.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' })} ${startTime.toLocaleTimeString('sl-SI', { timeZone: 'Europe/Ljubljana' })}`,
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
          const tools = [
            {
              type: 'function',
              name: 'get_slovenian_time',
              description: 'Vrne trenutni datum/uro v Europe/Ljubljana',
              parameters: { type: 'object', properties: {} }
            },
            FANCITA_RESERVATION_TOOL, FANCITA_ORDER_TOOL, FANCITA_HANDOFF_TOOL, FANCITA_HANGUP_TOOL, FANCITA_MENU_TOOL, FANCITA_LANGUAGE_TOOL
          ];
          
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
          
          // Only log important message types to reduce verbosity
          const importantTypes = [
            'conversation.item.input_audio_transcription.completed',
            'response.output_audio_transcript.done',
            'response.output_audio.delta',
            'response.function_call_arguments.done',
            'response.function_call_arguments.delta',
            'conversation.item.created',
            'error',
            'session.updated'
          ];
          
          if (importantTypes.includes(message.type)) {
            console.log('[sip-webhook] 📨', message.type);
          }

          // Log transcript events - Enhanced logging
          if (message.type === 'conversation.item.input_audio_transcription.completed') {
            // User speech completed - log only once with metadata
            console.log('[sip-webhook] 🔄 User transcript received:', message.transcript);
            
            const currentLang = callLanguages.get(callId) || 'hr';
            try { lastUserUtterance.set(callId, (message.transcript || '').toLowerCase()); } catch {}
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'user',
              content: `[${currentLang.toUpperCase()}] ${message.transcript}`,
              timestamp: new Date().toISOString(),
              metadata: {
                currentLanguage: currentLang,
                transcriptionModel: 'gpt-4o-mini-transcribe',
                transcriptionComplete: true
              }
            });
            
          } else if (message.type === 'conversation.item.created' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Skip detailed logging - just note audio received
            console.log('[sip-webhook] 🎤 User audio received');
          } else if (message.type === 'conversation.item.added' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Extract transcript from user message content if available
            const userContent = message.item?.content?.[0];
            if (userContent?.type === 'input_audio' && userContent.transcript) {
              console.log('[sip-webhook] 🔄 User transcript (added):', userContent.transcript);
              
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
            // Extract transcript from user message content if available
            const userContent = message.item?.content?.[0];
            if (userContent?.type === 'input_audio' && userContent.transcript) {
              console.log('[sip-webhook] 🔄 User transcript (done):', userContent.transcript);
              
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
          } else if (message.type === 'response.output_audio.delta') {
            // CRITICAL: Handle audio output from OpenAI - this was MISSING!
            console.log('[sip-webhook] 🔊 AUDIO DELTA EVENT RECEIVED');
            const audioData = message.delta;
            if (audioData) {
              console.log('[sip-webhook] 🔊 Audio delta received, length:', audioData.length);
              console.log('[sip-webhook] 🔊 WebSocket state:', ws ? ws.readyState : 'null');
              console.log('[sip-webhook] 🔊 CallId (streamSid):', callId);
              
              // Forward audio to Twilio via WebSocket
              if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                  const buf = Buffer.from(audioData, 'base64');
                  const frameSize = 160; // 20ms @ 8kHz, 1 byte/sample (G.711 µ-law)
                  
                  for (let i = 0; i < buf.length; i += frameSize) {
                    const chunk = buf.subarray(i, i + frameSize);
                    const chunkB64 = chunk.toString('base64');
                    
                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: callId, // Use callId as streamSid
                      media: { payload: chunkB64 }
                    }));
                  }
                  
                  console.log('[sip-webhook] ✅ Audio forwarded to Twilio, frames:', Math.ceil(buf.length / frameSize));
                } catch (error) {
                  console.error('[sip-webhook] ❌ Audio forwarding error:', error);
                }
              } else {
                console.warn('[sip-webhook] ⚠️ WebSocket not available for audio forwarding');
                console.warn('[sip-webhook] ⚠️ WS state:', ws ? ws.readyState : 'null');
                console.warn('[sip-webhook] ⚠️ WS exists:', !!ws);
              }
            } else {
              console.warn('[sip-webhook] ⚠️ No audio data in delta event');
            }
            
          } else if (message.type === 'response.output_audio_transcript.done') {
            // Assistant speech completed
            const transcript = message.transcript || '';
            console.log('[sip-webhook] 🔄 Assistant transcript received:', transcript);
            
            // DEBUG: Check for "Is that correct?" phrase
            if (transcript.toLowerCase().includes('is that correct') || 
                transcript.toLowerCase().includes('ali je pravilno') ||
                transcript.toLowerCase().includes('je li to točno')) {
              console.log('[sip-webhook] 🚨 DEBUG: CONFIRMATION QUESTION DETECTED IN TRANSCRIPT:', transcript);
            }
            
            // Do NOT detect language from assistant responses - only from user input
            
            const currentLang = callLanguages.get(callId) || 'hr';
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'assistant', 
              content: `[${currentLang.toUpperCase()}] ${transcript}`,
              timestamp: new Date().toISOString(),
              metadata: {
                currentLanguage: currentLang,
                transcriptionModel: 'gpt-4o-mini-transcribe'
              }
            });
          } else if (message.type === 'response.function_call_arguments.delta') {
            // Accumulate streamed function call arguments per call_id
            try {
              if (!global.functionArgBuffers) global.functionArgBuffers = new Map();
              if (!global.functionArgBuffers.has(callId)) {
                global.functionArgBuffers.set(callId, new Map());
              }
              const buffersForCall = global.functionArgBuffers.get(callId);
              const prev = buffersForCall.get(message.call_id) || '';
              const next = prev + (message.delta || '');
              buffersForCall.set(message.call_id, next);
            } catch (e) {
              console.warn('[sip-webhook] ⚠️ Failed to buffer function args delta:', e);
            }
          } else if (message.type === 'response.function_call_arguments.done') {
            // Tool call completed - track it as pending
            let parsedArgs;
            try {
              // If we have buffered deltas for this call, prefer them
              if (global.functionArgBuffers && global.functionArgBuffers.has(callId)) {
                const buffersForCall = global.functionArgBuffers.get(callId);
                const buffered = buffersForCall.get(message.call_id);
                if (buffered && typeof buffered === 'string' && buffered.length > 0) {
                  message.arguments = buffered;
                  buffersForCall.delete(message.call_id);
                }
              }
              parsedArgs = JSON.parse(message.arguments || '{}');
            } catch (parseError) {
              console.error('[sip-webhook] ❌ JSON parse error for tool arguments:', parseError);
              console.error('[sip-webhook] 🔍 Raw arguments:', message.arguments);
              parsedArgs = {}; // Fallback to empty object
            }
            
            // Track this tool call as pending
            if (!pendingToolResults.has(callId)) {
              pendingToolResults.set(callId, new Set());
            }
            pendingToolResults.get(callId).add(message.call_id);
            console.log(`[sip-webhook] 🔧 Tool call: ${message.name}`);
            
            // NOTE: Transcript logging moved to handleToolCall after argument cleaning
          } else if (message.type === 'conversation.item.created' && message.item?.type === 'function_call_output') {
            // Tool call result
            const output = message.item.output || {};
            const parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
            
            // Enhanced result logging with success details
            let resultSummary = '';
            if (parsedOutput.success) {
              if (parsedOutput.data?.reservation_id) {
                resultSummary = `✅ Rezervacija uspješno zavedena (ID: ${parsedOutput.data.reservation_id})`;
              } else if (parsedOutput.data?.order_id) {
                resultSummary = `✅ Narudžba uspješno zavedena (ID: ${parsedOutput.data.order_id})`;
              } else {
                resultSummary = '✅ Uspješno izvršeno';
              }
            } else {
              resultSummary = `❌ Greška: ${parsedOutput.error || 'Nepoznata greška'}`;
            }
            
            logTranscriptEvent(callId, {
              type: 'tool_result',
              tool_call_id: message.item.call_id,
              result: parsedOutput,
              result_summary: resultSummary,
              timestamp: new Date().toISOString(),
              metadata: {
                callId: message.item.call_id,
                status: parsedOutput.success ? 'success' : 'error',
                mode: parsedOutput.mode || 'mcp',
                mcpSuccess: parsedOutput.success === true,
                resultData: parsedOutput.data || null
              }
            });
            
            // Mark this tool call as completed
            if (pendingToolResults.has(callId)) {
              pendingToolResults.get(callId).delete(message.item.call_id);
              console.log(`[sip-webhook] ✅ Tool completed: ${message.item.call_id}`);
            }
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
        
        // Remove from active sessions
        if (global.activeSessions) {
          global.activeSessions.delete(callId);
        }
        
        // Check if this was a staff transfer - if so, redirect guest to conference
        const transferInfo = global.pendingTransfers?.get(callId);
        if (transferInfo && transferInfo.staffConnected && transferInfo.conferenceId) {
          console.log(`[sip-webhook] 📞 OpenAI session ended, redirecting guest to conference: ${transferInfo.conferenceId}`);
          
          // Use Twilio API to redirect the guest call to conference
          setTimeout(async () => {
            try {
              console.log(`[sip-webhook] 📞 Initiating guest callback to conference...`);
              
              // Get Twilio credentials
              const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
              const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
              
              if (!twilioAccountSid || !twilioAuthToken) {
                console.error(`[sip-webhook] ❌ Missing Twilio credentials for callback`);
                return;
              }
              
              // Alternative approach: Call guest back to join conference
              const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
              
              if (!twilioPhoneNumber) {
                console.error(`[sip-webhook] ❌ Missing TWILIO_PHONE_NUMBER for callback`);
                return;
              }
              
              console.log(`[sip-webhook] 📞 Calling guest back to join conference...`);
              
              // Call the guest back and connect them to the conference
              const callbackResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  From: twilioPhoneNumber,
                  To: transferInfo.guestPhone,
                  Url: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/guest-conference-twiml?conferenceId=${encodeURIComponent(transferInfo.conferenceId)}`,
                  Method: 'GET'
                })
              });
              
              if (callbackResponse.ok) {
                const callData = await callbackResponse.json();
                console.log(`[sip-webhook] ✅ Guest callback initiated: ${callData.sid}`);
                console.log(`[sip-webhook] ✅ Guest will be connected to conference: ${transferInfo.conferenceId}`);
                // Clean up transfer info and call mapping
                global.pendingTransfers.delete(callId);
                global.callSidMapping?.delete(callId);
              } else {
                const errorText = await callbackResponse.text();
                console.error(`[sip-webhook] ❌ Failed to call guest back:`, callbackResponse.status, errorText);
              }
              
            } catch (error) {
              console.error(`[sip-webhook] ❌ Error redirecting guest to conference:`, error);
            }
          }, 2000); // Wait 2 seconds for staff to be in conference
        } else {
          // Clean up call mapping if no transfer
          if (global.callSidMapping) {
            global.callSidMapping.delete(callId);
          }
        }
        
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

// Menu search functions - USE NEXT.JS API FOR REAL MENU DATA
async function searchMenuItems(query, language = 'hr') {
  try {
    const nextjsApiUrl = process.env.NEXTJS_API_URL || 'http://localhost:3000';
    const response = await fetch(`${nextjsApiUrl}/api/menu-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        language: language,
        get_full_menu: false
      })
    });

    if (!response.ok) {
      throw new Error(`Menu API error: ${response.status}`);
    }

    const result = await response.json();
    return result.data || `Ni najdenih rezultatov za "${query}".`;
  } catch (error) {
    console.error('[sip-webhook] Menu search error:', error);
    // Fallback to basic menu if API fails
    return `Oprostite, trenutno ne morem dostopati do menija. Pokličite direktno restavracijo za informacije o meniju.`;
  }
}

async function getFullMenu(language = 'hr') {
  try {
    const nextjsApiUrl = process.env.NEXTJS_API_URL || 'http://localhost:3000';
    const response = await fetch(`${nextjsApiUrl}/api/menu-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '',
        language: language,
        get_full_menu: true
      })
    });

    if (!response.ok) {
      throw new Error(`Menu API error: ${response.status}`);
    }

    const result = await response.json();
    return result.data || 'Oprostite, trenutno ne morem prikazati menija.';
  } catch (error) {
    console.error('[sip-webhook] Full menu error:', error);
    return 'Oprostite, trenutno ne morem dostopati do menija. Pokličite direktno restavracijo za informacije o meniju.';
  }
}

// Track last user utterance per call for date keyword detection
const lastUserUtterance = new Map();

// Tool call handler
async function handleToolCall(ws, message, callerPhone, callId) {
  try {
    console.log('[sip-webhook] 🔧 Tool call:', message.name);
    console.log('[sip-webhook] 🔧 DEBUG callerPhone:', callerPhone);
    console.log('[sip-webhook] 🔧 DEBUG callId:', callId);
    
    // Execute tool call directly without processing message

    let result;
    
    // Handle custom tools
    if (message.name === 'search_menu') {
      console.log('[sip-webhook] 🔧 Handling search_menu tool');
      const args = JSON.parse(message.arguments);
      // Get current call language instead of defaulting to Croatian
      const currentLanguage = callLanguages.get(callId) || 'hr';
      const language = args.language || currentLanguage;
      
      if (args.get_full_menu) {
        const fullMenu = await getFullMenu(language);
        result = { success: true, data: fullMenu };
      } else if (args.query) {
        const searchResults = await searchMenuItems(args.query, language);
        result = { success: true, data: searchResults };
      } else {
        const basicMenu = await getFullMenu(language);
        result = { success: true, data: basicMenu };
      }
    } else if (message.name === 'switch_language') {
      console.log('[sip-webhook] 🔧 Handling switch_language tool');
      const args = JSON.parse(message.arguments);
      const languageCode = args.language_code;
      const detectedPhrases = args.detected_phrases;
      
      // Update call language
      callLanguages.set(callId, languageCode);
      
      const languageNames = {
        'hr': 'hrvaščina',
        'sl': 'slovenščina', 
        'en': 'angleščina',
        'de': 'nemščina',
        'it': 'italijanščina',
        'nl': 'nizozemščina'
      };
      
      const languageName = languageNames[languageCode] || languageCode;
      
      // No need for complex contextual logic - let Maja (GPT-4o) handle context analysis herself
      
      // Simple language switch notification - let Maja handle the context herself
      const switchMessage = `🌍 JEZIK PREKLOPLJEN: ${languageCode.toUpperCase()} (${languageName})\n📝 Zaznane fraze: "${detectedPhrases}"\n✅ Transkripcijski model posodobljen na ${languageCode}\n🤖 NAVODILO: Nadaljuj pogovor v jeziku ${languageName} iz konteksta prejšnjega pogovora. Ne sprašuj ponovno "Kako lahko pomagam?" ampak direktno nadaljuj z ustreznim vprašanjem glede na to, kar je gost že omenil.`;
      
      result = { success: true, data: switchMessage };
    } else if (message.name === 'get_slovenian_time') {
      // Return current Slovenian time
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Ljubljana' }));
      result = { success: true, data: {
        now_iso: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        timezone: 'Europe/Ljubljana',
        locale: 'sl-SI',
        formatted: now.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })
      }};
    } else if (message.name === 's7260221_check_availability') {
      // Availability check via MCP
      // Parse args safely
      let args = {};
      try {
        args = JSON.parse(message.arguments || '{}');
      } catch (e) {
        console.warn('[sip-webhook] ⚠️ Availability args parse failed, using empty object');
        args = {};
      }

      // Date normalization is handled by model via instructions + get_slovenian_time tool

      // Load defaults from settings
      const availability = settings.availability || {};
      const durationThreshold = availability.duration?.threshold || 4;

      // Compose request with defaults
      const requestData = {
        date: args.date,
        time: args.time,
        people: args.people || args.guests_number || 2,
        location: args.location,
        duration_min: args.duration_min || ( (args.people || args.guests_number || 2) <= durationThreshold
          ? (availability.duration?.smallGroup || 90)
          : (availability.duration?.largeGroup || 120)
        ),
        slot_minutes: args.slot_minutes || availability.slotMinutes || 15,
        capacity_terasa: args.capacity_terasa || availability.capacity_terasa || 40,
        capacity_vrt: args.capacity_vrt || availability.capacity_vrt || 40,
        suggest_max: args.suggest_max || availability.suggest_max || 6,
        suggest_stepSlots: args.suggest_stepSlots || availability.suggest_stepSlots || 1,
        suggest_forwardSlots: args.suggest_forwardSlots || availability.suggest_forwardSlots || 12
      };

      // Log tool_call to transcript with full request
      logTranscriptEvent(callId, {
        type: 'tool_call',
        tool_name: 's7260221_check_availability',
        tool_description: 'Preverjanje zasedenosti (MCP)',
        arguments: requestData,
        call_id: message.call_id,
        timestamp: new Date().toISOString(),
        metadata: {
          toolName: 's7260221_check_availability',
          callId: message.call_id,
          requestData
        }
      });

      // Call Next.js MCP endpoint which already handles Make.com parsing quirks
      const nextjsApiUrl = process.env.NEXTJS_API_URL || 'http://localhost:3000';
      const mcpApiUrl = `${nextjsApiUrl}/api/mcp`;

      try {
        const response = await fetch(mcpApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 's7260221_check_availability', data: requestData })
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`MCP API error: ${response.status} ${response.statusText} ${text}`);
        }

        const mcpResponse = await response.json();
        // Normalize output
        if (mcpResponse && mcpResponse.success && mcpResponse.data) {
          result = mcpResponse.data;
        } else {
          result = mcpResponse;
        }

        // Build summary for transcript
        let resultSummary = '';
        try {
          const r = result || {};
          const suggestionsCount = Array.isArray(r.suggestions) ? r.suggestions.length : 0;
          const altsCount = Array.isArray(r.alts) ? r.alts.length : 0;
          if (r.status) {
            resultSummary = `status=${r.status}, available=${r.available}, load_pct=${r.load_pct ?? 'n/a'}, suggestions=${suggestionsCount}, alts=${altsCount}`;
          }
        } catch {}

        // Derive request date localized to Slovenia (for clarity)
        let request_date_local = null;
        try {
          const reqDateIso = result?.request?.date;
          if (typeof reqDateIso === 'string') {
            const d = new Date(reqDateIso);
            request_date_local = d.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' });
          }
        } catch {}

        // Build a display-friendly copy of raw response with localized date
        let rawResponse_localized = result;
        try {
          const clone = JSON.parse(JSON.stringify(result));
          if (clone && clone.request && typeof clone.request.date === 'string') {
            const d = new Date(clone.request.date);
            clone.request.date_local = d.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' });
          }
          rawResponse_localized = clone;
        } catch {}

        // Log tool_result to transcript with full response
        logTranscriptEvent(callId, {
          type: 'tool_result',
          tool_call_id: message.call_id,
          result: result,
          result_summary: resultSummary || 'availability result',
          timestamp: new Date().toISOString(),
          metadata: {
            mode: 'mcp',
            endpoint: mcpApiUrl,
            requestData,
            rawResponse_localized,
            request_date_local
          }
        });
      } catch (error) {
        console.error('[sip-webhook] ❌ Availability MCP error:', error);
        result = { success: false, error: `Availability check failed: ${error.message}` };

        // Log error to transcript as tool_result
        logTranscriptEvent(callId, {
          type: 'tool_result',
          tool_call_id: message.call_id,
          result: result,
          result_summary: `error: ${error.message}`,
          timestamp: new Date().toISOString(),
          metadata: {
            mode: 'mcp',
            endpoint: mcpApiUrl,
            requestData
          }
        });
      }

    } else if (message.name === 's6792596_fancita_rezervation_supabase' || message.name === 's6798488_fancita_order_supabase') {
      // CRITICAL: Validate MCP parameters before calling
      const args = JSON.parse(message.arguments);
      console.log('[sip-webhook] 🔧 DEBUG Original args:', JSON.stringify(args, null, 2));
      
      // Add/fix tel (clean phone number) and source_id
      if (callerPhone) {
        if (args.tel && args.tel !== callerPhone) {
          console.log(`[sip-webhook] 📞 Replacing tel parameter: "${args.tel}" -> "${callerPhone}"`);
        } else if (!args.tel) {
          console.log(`[sip-webhook] 📞 Added tel parameter: ${callerPhone}`);
        }
        args.tel = callerPhone; // Always use clean phone number, not SIP header
      }
      if (!args.source_id && callId) {
        args.source_id = callId;
        console.log(`[sip-webhook] 🆔 Added source_id parameter: ${args.source_id}`);
      }
      
      // Ensure duration_min for reservations based on settings
      if (message.name === 's6792596_fancita_rezervation_supabase') {
        try {
          const availability = settings.availability || {};
          const threshold = availability.duration?.threshold || 4;
          const small = availability.duration?.smallGroup || 90;
          const large = availability.duration?.largeGroup || 120;
          const people = Number(args.guests_number || args.people);
          if (!args.duration_min) {
            args.duration_min = people <= threshold ? small : large;
            console.log(`[sip-webhook] ⏱ Added duration_min=${args.duration_min} (people=${people})`);
          }
        } catch (e) {
          if (!args.duration_min) args.duration_min = 90;
        }
      }

      console.log('[sip-webhook] 🔧 DEBUG Final args:', JSON.stringify(args, null, 2));
      
      // Generate transcript with cleaned arguments
      let toolDescription = message.name;
      let reservationSummary = '';
      
      if (message.name === 's6792596_fancita_rezervation_supabase') {
        toolDescription = 'Rezervacija stola';
        // Normalize date expressions to Slovenian timezone (danes/jutri)
        try {
          const { parseDateExpression } = require('../dist/src/app/lib/slovenianTime');
          if (args.date) args.date = parseDateExpression(args.date);
        } catch {}
        reservationSummary = `${args.name || 'N/A'} | ${args.date || 'N/A'} ${args.time || 'N/A'} | ${args.guests_number || 'N/A'} osoba/e | ${args.location || 'N/A'} | Tel: ${args.tel || 'N/A'}`;
      } else if (message.name === 's6798488_fancita_order_supabase') {
        toolDescription = 'Narudžba hrane';
        const itemsCount = args.items?.length || 0;
        reservationSummary = `${args.name || 'N/A'} | ${args.date || 'N/A'} ${args.delivery_time || 'N/A'} | ${itemsCount} stavki | ${args.total || 'N/A'}€ | ${args.delivery_type || 'N/A'}`;
      }
      
      // Log transcript with cleaned arguments
      logTranscriptEvent(callId, {
        type: 'tool_call',
        tool_name: message.name,
        tool_description: toolDescription,
        arguments: args, // Use cleaned arguments
        call_id: message.call_id,
        reservation_summary: reservationSummary,
        timestamp: new Date().toISOString(),
        metadata: {
          toolName: message.name,
          callId: message.call_id,
          argumentCount: Object.keys(args).length,
          reservationData: args // Use cleaned arguments
        }
      });
      
      const validation = validateMCPParameters(message.name, args);
      
      if (!validation.valid) {
        if (settings.debug.logValidation) {
          console.error('[sip-webhook] ❌ MCP Validation failed:', validation);
          console.error('[sip-webhook] 🔍 Missing fields:', validation.missing);
          console.error('[sip-webhook] 🔍 Invalid fields:', validation.invalid);
          if (settings.debug.verboseErrors) {
            console.error('[sip-webhook] 🔍 Provided args:', args);
          }
        }
        
        // Build comprehensive error message using settings
        const templates = settings.validation.errorTemplates;
        let errorMessage = templates.validationError;
        const errors = [];
        
        if (validation.missing.length > 0) {
          errors.push(`${templates.missingFields}${validation.missing.join(', ')}`);
        }
        
        if (validation.invalid.length > 0) {
          errors.push(`${templates.invalidValues}${validation.invalid.join('; ')}`);
        }
        
        errorMessage += errors.join('. ');
        const entityType = message.name.includes('rezervation') ? templates.reservation : templates.order;
        errorMessage += `. ${templates.correctIssues}${entityType}.`;
        
        result = { success: false, error: errorMessage };
        
        // Send error result immediately and return
        const outputString = JSON.stringify(result);
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            id: message.call_id,
            type: 'function_call_output',
            call_id: message.call_id,
            output: outputString
          }
        }));
        return; // Stop processing - do not call MCP
      }
      
      if (settings.debug.logValidation) {
        console.log('[sip-webhook] ✅ MCP Validation passed for', message.name);
      }
      
      // Try Next.js MCP API first (proper MCP protocol), then fallback to direct Make.com
      const nextjsApiUrl = process.env.NEXTJS_API_URL || 'http://localhost:3000';
      const mcpApiUrl = `${nextjsApiUrl}/api/mcp`;
      
      console.log(`[sip-webhook] 🔍 Trying Next.js MCP API`);
      
      try {
        const response = await fetch(mcpApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: message.name,
            data: args
          })
        });

        if (response.ok) {
          const mcpResponse = await response.json();
          console.log('[sip-webhook] ✅ Next.js MCP API call successful');
          
          if (mcpResponse.success && mcpResponse.data) {
            result = mcpResponse.data;
          } else {
            result = mcpResponse;
          }
        } else {
          console.log(`[sip-webhook] ⚠️ Next.js MCP API failed: ${response.status}, trying direct Make.com`);
          throw new Error(`Next.js API failed: ${response.status}`);
        }
      } catch (nextjsError) {
        console.log(`[sip-webhook] 🔄 Fallback to direct Make.com URL`);
        
        // Fallback to direct Make.com call (original approach)
        const mcpUrl = process.env.MCP_SERVER_URL;
        console.log(`[sip-webhook] 🔍 Using direct MCP URL`);
        if (!mcpUrl) {
          throw new Error('Neither Next.js API nor MCP_SERVER_URL available');
        }
        
        const response = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: message.name,
            data: args // Use the same args with added tel and source_id
          })
        });

        if (response.ok) {
          const mcpResponse = await response.json();
          console.log('[sip-webhook] ✅ Direct MCP call successful');
          
          if (mcpResponse.success && mcpResponse.data) {
            result = mcpResponse.data;
          } else {
            result = mcpResponse;
          }
        } else {
          console.log(`[sip-webhook] ❌ Direct MCP call failed: ${response.status} ${response.statusText}`);
          
          let errorText = 'Unknown error';
          try {
            errorText = await response.text();
          } catch (e) {
            // Silent fail for response text
          }
          
          result = { 
            success: false, 
            error: `Both Next.js API and direct MCP failed. Direct: ${response.status} ${response.statusText}`,
            details: errorText
          };
        }
      }
    } else if (message.name === 'transfer_to_staff') {
      // Real staff handoff - call staff and create conference
      const args = JSON.parse(message.arguments);
      const staffPhone = process.env.STAFF_PHONE_NUMBER;
      
      console.log(`[sip-webhook] 🔧 DEBUG: Staff transfer requested`);
      console.log(`[sip-webhook] 🔧 DEBUG: STAFF_PHONE_NUMBER = ${staffPhone || 'NOT SET'}`);
      console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_ACCOUNT_SID = ${process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET'}`);
      console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_AUTH_TOKEN = ${process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET'}`);
      console.log(`[sip-webhook] 🔧 DEBUG: TWILIO_PHONE_NUMBER = ${process.env.TWILIO_PHONE_NUMBER ? 'SET' : 'NOT SET'}`);
      console.log(`[sip-webhook] 🔧 DEBUG: Problem summary = ${args.problem_summary}`);
      
      if (!staffPhone) {
        console.log(`[sip-webhook] ❌ STAFF_PHONE_NUMBER not configured`);
        result = { 
          success: false, 
          error: 'STAFF_PHONE_NUMBER not configured in environment' 
        };
      } else {
        try {
          console.log(`[sip-webhook] 📞 Scheduling staff callback for ${callId}`);
          
          // Extract guest phone from stored conference mapping
          const conferenceName = global.callIDtoConferenceNameMapping[callId];
          const guestPhone = global.ConferenceNametoCallerIDMapping[conferenceName] || '+38641734134';
          
          // Schedule staff callback (new approach - wait for staff to answer)
          const conferenceResult = await scheduleStaffCallback(
            callId, 
            args.problem_summary,
            guestPhone
          );
          
          console.log(`[sip-webhook] 🔧 DEBUG: Conference result:`, conferenceResult);
          
          if (conferenceResult.success) {
            result = { 
              success: true, 
              message: 'Staff callback scheduled successfully. You will be called back when staff is available.',
              conference_name: conferenceResult.conference_name,
              callback_scheduled: true
            };
            
            // Log the transfer
            logTranscriptEvent(callId, {
              type: 'staff_transfer',
              staff_phone: staffPhone,
              problem_summary: args.problem_summary,
              conference_sid: conferenceResult.conference_sid,
              timestamp: new Date().toISOString(),
              metadata: {
                transferInitiated: true,
                staffNumber: staffPhone,
                guestNumber: callerPhone
              }
            });
          } else {
            console.log(`[sip-webhook] ❌ Conference creation failed:`, conferenceResult.error);
            result = { 
              success: false, 
              error: `Staff transfer failed: ${conferenceResult.error}` 
            };
          }
        } catch (error) {
          console.error('[sip-webhook] ❌ Staff transfer error:', error);
          result = { 
            success: false, 
            error: `Staff transfer error: ${error.message}` 
          };
        }
      }
    } else if (message.name === 'end_call') {
      // Handle call termination - DO NOT send result back to avoid Maja saying it
      const args = JSON.parse(message.arguments);
      console.log(`[sip-webhook] 📞 Agent requested call end: ${args.reason}`);
      
      // Check if this is a callback_scheduled end_call - allow it
      if (args.reason === 'callback_scheduled') {
        console.log(`[sip-webhook] 📞 Callback scheduled - allowing call termination`);
        // Continue with normal call termination
      } else {
        // Check if there's a pending staff transfer - if so, don't end the call
        const transferInfo = global.pendingTransfers?.get(callId);
        if (transferInfo && transferInfo.staffConnected) {
          console.log(`[sip-webhook] ⚠️ Staff transfer in progress, keeping guest connected`);
          console.log(`[sip-webhook] 📞 Waiting for staff to join conference: ${transferInfo.conferenceName}`);
          
          // Send a message to Maja to keep talking to the guest
          const keepTalkingMessage = {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'system',
              content: [{
                type: 'text',
                text: 'SYSTEM: Staff transfer initiated. Keep the guest engaged while waiting for staff to join. Do not end the call.'
              }]
            }
          };
          
          // Send to OpenAI to keep Maja active
          if (global.activeWebSockets && global.activeWebSockets.has(callId)) {
            const ws = global.activeWebSockets.get(callId);
            ws.send(JSON.stringify(keepTalkingMessage));
            ws.send(JSON.stringify({ type: 'response.create' }));
          }
          
          // Don't hang up - keep guest connected
          return;
        }
      }
      
      // Normal call termination
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
    let outputString;
    if (message.name === 'search_menu' || message.name === 'switch_language') {
      // For our custom tools, send the data directly as string
      outputString = result.success ? result.data : (result.error || 'Tool failed');
    } else {
      // For MCP tools, use the existing format
      outputString = JSON.stringify(result);
    }
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: message.call_id,
        output: outputString
      }
    }));

    // OPOMBA: session.update po tool klicu odstranjen, ker povzroča "Cannot update voice" napake
    // Transkripcijski jezik se avtomatsko posodobi preko switch_language tool-a
    
    // Trigger response so Maja can react to the tool result
    ws.send(JSON.stringify({ type: 'response.create' }));
    
    console.log(`[sip-webhook] 🔧 Tool result sent: ${message.call_id} (${result?.success ? 'success' : 'failed'})`);

  } catch (error) {
    console.error('[sip-webhook] ❌ Tool call error:', error);
    
    let errorOutput;
    if (message.name === 'search_menu' || message.name === 'switch_language') {
      // For our custom tools, send error as string
      errorOutput = `Tool error: ${error.message}`;
    } else {
      // For MCP tools, use JSON format
      errorOutput = JSON.stringify({ success: false, error: error.message });
    }
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: message.call_id,
        output: errorOutput
      }
    }));
  }
}


server.listen(PORT, () => {
  console.log(`[sip-webhook] 🚀 Pure Node.js SIP webhook server listening on port ${PORT}`);
  console.log(`[sip-webhook] 🔗 Configure Twilio webhook to: http://your-domain:${PORT}/webhook`);
  console.log(`[sip-webhook] 📞 Staff transfer endpoints available (hybrid conference mode):`);
  console.log(`[sip-webhook]   - /staff-callback-twiml (staff callback with summary)`);
  console.log(`[sip-webhook]   - /staff-ready (staff keypress handler)`);
  console.log(`[sip-webhook]   - /staff-callback-status (staff call status)`);
  console.log(`[sip-webhook]   - /guest-conference-twiml (guest redirect to conference)`);
  console.log(`[sip-webhook]   - /call-status (call status callbacks)`);
  console.log(`[sip-webhook]   - /conference-events (conference participant events)`);
});

// Call guest to join conference after staff is ready
async function callGuestToConference(callId, conferenceName) {
  console.log(`[sip-webhook] 📞 Calling guest to join conference: ${conferenceName}`);
  
  const callbackInfo = global.pendingCallbacks?.get(callId);
  if (!callbackInfo) {
    console.error(`[sip-webhook] ❌ No callback info found for ${callId}`);
    return;
  }
  
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  try {
    const guestCallResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: twilioPhoneNumber,
        To: callbackInfo.guestPhone,
        Url: `${process.env.WEBHOOK_BASE_URL || 'https://fancita-webhook.loca.lt'}/guest-conference-twiml?conferenceId=${encodeURIComponent(conferenceName)}`,
        Method: 'GET'
      })
    });
    
    if (guestCallResponse.ok) {
      const guestCallData = await guestCallResponse.json();
      console.log(`[sip-webhook] ✅ Guest callback initiated: ${guestCallData.sid}`);
      
      // Update callback status
      callbackInfo.status = 'guest_called';
      callbackInfo.guestCallSid = guestCallData.sid;
      global.pendingCallbacks.set(callId, callbackInfo);
      
      // Log successful callback
      logTranscriptEvent(callId, {
        type: 'guest_callback',
        guest_phone: callbackInfo.guestPhone,
        conference_name: conferenceName,
        timestamp: new Date().toISOString()
      });
      
    } else {
      const errorText = await guestCallResponse.text();
      console.error(`[sip-webhook] ❌ Failed to call guest: ${guestCallResponse.status} ${errorText}`);
    }
    
  } catch (error) {
    console.error(`[sip-webhook] ❌ Error calling guest to conference: ${error.message}`);
  }
}