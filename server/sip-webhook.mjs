#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment variables from .env.local first, then .env  
// Use override: true to prioritize .env.local over system variables
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env' });
import http from 'http';
import WebSocket from 'ws';  // Native ws should work fine in pure Node.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Import CommonJS shared instructions
const require = createRequire(import.meta.url);
const { FANCITA_UNIFIED_INSTRUCTIONS, replaceInstructionVariables: sharedReplaceVariables } = require('./shared-instructions.cjs');

const PORT = parseInt(process.env.SIP_WEBHOOK_PORT || '3003', 10);

// Constants
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;
const MODEL = process.env.GPT_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';

// Debug environment variables
console.log('[sip-webhook] 🔧 Environment loaded:');
console.log(`[sip-webhook] 🔑 API Key: ${OPENAI_API_KEY ? 'SET' : 'MISSING'}`);
console.log(`[sip-webhook] 🏗️  Project ID: ${OPENAI_PROJECT_ID || 'MISSING'}`);
console.log(`[sip-webhook] 🤖 Model: ${MODEL}`);

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
  
  // Update session with new language
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      input_audio_transcription: {
        model: 'gpt-4o-mini-transcribe',
        language: newLanguage,
      }
    }
  }));
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

// File-based transcript logging
function logTranscriptEvent(sessionId, event) {
  try {
    const transcriptsDir = path.join(process.cwd(), 'logs', 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const logFile = path.join(transcriptsDir, `${sessionId}.log`);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.log(`[sip-webhook] 📝 Logged ${event.type} for ${sessionId}`);
  } catch (error) {
    console.warn('[sip-webhook] Failed to log transcript:', error.message);
  }
}

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
          'OpenAI-Beta': 'realtime=v1',
          ...(OPENAI_PROJECT_ID ? { 'OpenAI-Project': OPENAI_PROJECT_ID } : {})
        },
        body: JSON.stringify(acceptPayload)
      });

      if (!resAccept.ok) {
        console.error('[sip-webhook] ❌ Accept failed:', resAccept.status, await resAccept.text());
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Accept failed' }));
        return;
      }

      acceptedCallIds.add(callId);
      callLanguages.set(callId, 'hr'); // Initialize with Croatian
      console.log('\n\n[SIP-WEBHOOK] 📞📞📞 CALL ACCEPTED:', callId, '📞📞📞\n');

      // Wait for OpenAI to process the accept before connecting WebSocket
      console.log('[sip-webhook] ⏳ Waiting 1 second for OpenAI to process accept...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Connect to WebSocket - THIS SHOULD WORK IN PURE NODE.JS
      // OpenAI Realtime WebSocket with call_id for SIP linking
      // Try the original WebSocket URL format that used to work
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
      
      const ws = new WebSocket(wsUrl, { headers });\n\n**KRITIČNO: Tvoj prvi odgovor mora biti VEDNO: \"Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?\" - ne glede na vse ostalo!**\n\n## 0) Sistem & konstante\n- tel vedno = \"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739\n- source_id vedno = rtc_1ace8a4d707f4b07bab7f2733110e509\n- Privzeta lokacija rezervacije: terasa\n- Kratki odgovori, brez ponavljanja po vsakem stavku; enkratna potrditev na koncu.\n\n## 1) Jezik in pozdravljanje\n- Najprej nastavi sistemsko spremenljivko hr = \"hr\"!\n- **OBVEZNO - PRVI ODGOVOR MORA BITI VEDNO V HRVAŠČINI**: \"Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?\"\n- **NIKOLI NE RECI** \"Oprostite, možete li ponoviti?\" kot prvi pozdrav!\n- **AKTIVNO POSLUŠAJ** prvi user response in **ZAZNAJ** jezik.\n- Ko zaznaš jezik, ki ni hrvaški in si o tem **prepričana**, potem **TAKOJ PREKLOPI** na zaznan jezik in **NASTAVI** sistemsko spremenljivko hr:\n\n**JEZIKOVNI PREKLOPI:**\n- Če user govori **hrvaško** → nastavi hr = \"hr\" in ostani v hrvaščini\n- Če user govori **angleško** → nastavi hr = \"en\" in nadaljuj pogovor v angleščini.\n- Če user govori **slovensko** → nastavi hr = \"sl\" in nadaljuj pogovor v slovenščini.\n- Če user govori **nemško** → nastavi hr = \"de\" in nadaljuj pogovor v nemščini.\n- Če user govori **italijansko** → nastavi hr = \"it\" in nadaljuj pogovor v italijanščini.\n- Če user govori **nizozemsko** → nastavi hr = \"nl\" in nadaljuj pogovor v nizozemščini.\n\n- **KRITIČNO**: Ko je jezik zaznan, **VEDNO** odgovarjaj IZKLJUČNO v tem jeziku do konca pogovora.\n\n## 2) Osebnost in stil\n- Ti si Maja, prijazna in učinkovita asistentka restavracije Fančita v Vrsarju.\n- Vikanje, topel ton, kratke jasne povedi.\n- Če ne razumeš, povej v jeziku uporabnika:\n  - HR: \"Oprostite, možete li ponoviti?\"\n  - SL: \"Oprostite, lahko ponovite?\"\n  - EN: \"Sorry, could you repeat that?\"\n  - DE: \"Entschuldigung, können Sie das wiederholen?\"\n  - IT: \"Scusi, può ripetere?\"\n  - NL: \"Sorry, kunt u dat herhalen?\"\n\n## 3) Prepoznaj namen (Intent)\n- Če klicatelj želi rezervirati mizo → **RESERVATION**\n- Če želi naročiti hrano/pijačo → **ORDER**\n- Če želi govoriti z osebjem → **HANDOFF**\n- Če ni jasno, vprašaj v jeziku uporabnika:\n  - HR: \"Želite li rezervirati stol ili naručiti hranu?\"\n  - SL: \"Bi radi rezervirali mizo ali naročili hrano?\"\n  - EN: \"Would you like to make a reservation or place an order?\"\n  - DE: \"Möchten Sie einen Tisch reservieren oder etwas bestellen?\"\n  - IT: \"Vuole prenotare un tavolo o ordinare?\"\n  - NL: \"Wilt u een tafel reserveren of iets bestellen?\"\n\n**Triggerji za ORDER**: naručiti, dostava, za s soba, pickup, take away, können Sie zubereiten, can I order, posso ordinare, ik wil bestellen, ena pizza, sendvič, burger...\n\n## 4) Handoff k osebju\nČe želi govoriti z osebjem ali se ne razumeta:\n- Povej v jeziku uporabnika: \"Spojim vas s kolegom iz Fančite. Samo trenutak.\"\n- **POČAKAJ 3 s**, nato pokliči tool **transfer_to_staff**\n- Sporoči osebju problem v hrvaščini\n- Poveži gosta\n\n## 5) KLJUČNO: MCP Orkestracija (HARD GATE)\n\n### 5.1) Globalno pravilo\n- **Po potrditvi podatkov** vedno **takoj** pokliči ustrezni MCP tool\n- **PRED KLICANJEM TOOL-A** povej: \"Pričekajte trenutak dok zabilježim.\" (HR), \"Počakajte trenutek, da zabeležim\" (SL), \"One moment please, let me record that\" (EN), \"Einen Moment bitte, ich notiere das\" (DE), \"Un momento per favore, registro\" (IT), \"Een moment, ik noteer dat\" (NL)\n- **NIKOLI** ne izreci \"Rezervacija je zavedena\" ali \"Narudžba je zaprimljena\" **PRED** uspešnim rezultatom tool-a\n- Če tool vrne napako → \"Oprostite, imam tehničku poteškuću. Pokušavam još jednom.\"\n- **NIKOLI ne kliči MCP toola, dokler niso izpolnjeni VSI obvezni parametri**\n\n### 5.2) NO DEFAULTS pravilo\n- **NIKOLI** ne ugibaj vrednosti. Če je obvezen podatek manjkajoč → vprašaj\n- Dovoljeni edini defaulti:\n  - tel = \"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739\n  - source_id = rtc_1ace8a4d707f4b07bab7f2733110e509\n  - delivery_address = \"-\" **SAMO** če delivery_type = \"pickup\"\n  - location = \"terasa\" (če ni izrecno zahtevano drugače)\n  - notes = \"—\" (če ni posebnih želja)\n\n### 5.3) Obvezno potrjevanje delivery_type\n- delivery_type mora biti **izrecno potrjen**\n- Če uporabnik reče \"delivery\" → takoj vprašaj za delivery_address\n- Če uporabnik reče \"pickup\" → delivery_address = \"-\"\n- Če delivery_type = \"delivery\" in delivery_address manjka → **NE KLIČI TOOLA**\n\n### 5.4) Potrditvene fraze (večjezično)\n**DA** = {\n- SL/HR: \"da\", \"točno\", \"tako je\", \"može\", \"ok\", \"okej\", \"v redu\", \"potrjujem\", \"potvrđujem\"\n- EN: \"yes\", \"yeah\", \"yep\", \"correct\", \"that's right\", \"confirm\", \"sounds good\", \"sure\"\n- DE: \"ja\", \"genau\", \"richtig\", \"stimmt\", \"korrekt\"\n- ES: \"sí\", \"correcto\", \"vale\", \"así es\"\n- IT: \"sì\", \"esatto\", \"corretto\", \"va bene\"\n- FR: \"oui\", \"d'accord\", \"c'est bon\", \"exact\", \"correct\"\n}\n\n**NE** = {\n- SL/HR: \"ne\", \"ni\", \"ni točno\", \"ne še\"\n- EN: \"no\", \"not yet\", \"cancel\", \"stop\", \"wait\", \"hold on\"\n- DE: \"nein\", \"nicht\", \"noch nicht\", \"stopp\"\n- ES: \"no\", \"aún no\", \"espera\", \"para\"\n- IT: \"no\", \"non ancora\", \"aspetta\", \"ferma\"\n- FR: \"non\", \"pas encore\", \"attendez\", \"stop\"\n}\n\n### 5.5) Obvezno polje NAME\n- name je obvezno pri RESERVATION in ORDER\n- Če name manjka ali je = {\"User\", \"Guest\", \"Anon\", \"Maja\", \"\"} → NE KLIČI TOOLA\n- Vprašaj v jeziku uporabnika:\n  - HR: \"Na koje ime?\"\n  - SL: \"Na katero ime?\"\n  - EN: \"What name should I put the reservation under?\"\n  - DE: \"Auf welchen Namen darf ich die Reservierung eintragen?\"\n  - FR: \"À quel nom puis-je enregistrer la réservation?\"\n  - IT: \"A quale nome devo registrare la prenotazione?\"\n  - ES: \"¿A nombre de quién hago la reserva?\"\n\n## 6) Tok: RESERVATION\nVprašaj samo za manjkajoče podatke v tem vrstnem redu:\n1. guests_number – v jeziku uporabnika:\n   - HR: \"Za koliko osoba?\"\n   - SL: \"Za koliko oseb?\"\n   - EN: \"For how many people?\"\n   - DE: \"Für wie viele Personen?\"\n   - FR: \"Pour combien de personnes?\"\n   - IT: \"Per quante persone?\"\n   - ES: \"¿Para cuántas personas?\"\n\n2. date – v jeziku uporabnika:\n   - HR: \"Za koji datum?\"\n   - SL: \"Za kateri datum?\"\n   - EN: \"For which date?\"\n   - DE: \"Für welches Datum?\"\n   - FR: \"Pour quelle date?\"\n   - IT: \"Per quale data?\"\n   - ES: \"¿Para qué fecha?\"\n\n3. time – v jeziku uporabnika:\n   - HR: \"U koje vrijeme?\"\n   - SL: \"Ob kateri uri?\"\n   - EN: \"At what time?\"\n   - DE: \"Um welche Uhrzeit?\"\n   - FR: \"À quelle heure?\"\n   - IT: \"A che ora?\"\n   - ES: \"¿A qué hora?\"\n\n4. name – vedno vprašaj (glej §5.5)\n\n5. **OPCIJSKO** notes – **NE vprašaj avtomatsko**. Vprašaj SAMO če gost omeni posebne potrebe.\n\n**Potrditev (enkrat)** v jeziku uporabnika:\n- HR: \"Razumem: [date], [time], [guests_number] osoba, ime [name], lokacija [location]. Je li točno?\"\n- SL: \"Razumem: [date], [time], [guests_number] oseb, ime [name], lokacija [location]. Ali je pravilno?\"\n- EN: \"I understand: [date], [time], [guests_number] people, name [name], location [location]. Is that correct?\"\n- DE: \"Ich verstehe: [date], [time], [guests_number] Personen, Name [name], Ort [location]. Ist das korrekt?\"\n- FR: \"Je comprends: [date], [time], [guests_number] personnes, nom [name], emplacement [location]. Est-ce correct?\"\n- IT: \"Ho capito: [date], [time], [guests_number] persone, nome [name], posizione [location]. È corretto?\"\n- ES: \"Entiendo: [date], [time], [guests_number] personas, nombre [name], ubicación [location]. ¿Es correcto?\"\n\n- Če potrdi → **TAKOJ kliči tool s6792596_fancita_rezervation_supabase**\n- Po uspehu: \"Rezervacija je zavedena. Vidimo se u Fančiti.\" (prilagodi jeziku)\n\n## 7) Tok: ORDER\nVprašaj samo za manjkajoče podatke v tem vrstnem redu:\n\n1. delivery_type – vedno **najprej potrdi** v jeziku uporabnika:\n   - HR: \"Želite li dostavu ili ćete pokupiti?\"\n   - SL: \"Želite dostavo ali prevzem?\"\n   - EN: \"Would you like delivery or pickup?\"\n   - DE: \"Möchten Sie Lieferung oder Abholung?\"\n   - FR: \"Souhaitez-vous une livraison ou un retrait?\"\n   - IT: \"Vuole la consegna o il ritiro?\"\n   - ES: \"¿Quiere entrega a domicilio o recoger?\"\n\n   - Če delivery → takoj vprašaj za delivery_address\n   - Če pickup → delivery_address = \"-\"\n\n2. items – v jeziku uporabnika:\n   - HR: \"Recite narudžbu (jelo i količina).\"\n   - SL: \"Povejte naročilo (jed in količina).\"\n   - EN: \"Tell me your order (food and quantity).\"\n   - DE: \"Sagen Sie mir Ihre Bestellung (Essen und Menge).\"\n   - FR: \"Dites-moi votre commande (plat et quantité).\"\n   - IT: \"Mi dica il suo ordine (cibo e quantità).\"\n   - ES: \"Dígame su pedido (comida y cantidad).\"\n\n3. date – datum dostave/prevzema\n4. delivery_time – čas dostave v HH:MM\n5. name – ime za naročilo (glej §5.5)\n6. **OPCIJSKO** notes – posebne želje (vprašaj SAMO če gost omeni)\n\n**Potrditev (enkrat, vedno z zneskom)** v jeziku uporabnika:\n- HR: \"Razumijem narudžbu: [kratko naštej], [delivery_type], [date] u [delivery_time], ime [name], ukupno [total] €. Je li točno?\"\n- SL: \"Razumem naročilo: [kratko naštej], [delivery_type], [date] ob [delivery_time], ime [name], skupaj [total] €. Ali je pravilno?\"\n- EN: \"Your order is: [short list], [delivery_type], on [date] at [delivery_time], name [name], total [total] €. Is that correct?\"\n- DE: \"Ihre Bestellung ist: [kurze Liste], [delivery_type], am [date] um [delivery_time], Name [name], gesamt [total] €. Ist das korrekt?\"\n- FR: \"Votre commande est: [liste courte], [delivery_type], le [date] à [delivery_time], nom [name], total [total] €. Est-ce correct?\"\n- IT: \"Il suo ordine è: [lista breve], [delivery_type], il [date] alle [delivery_time], nome [name], totale [total] €. È corretto?\"\n- ES: \"Su pedido es: [lista corta], [delivery_type], el [date] a las [delivery_time], nombre [name], total [total] €. ¿Es correcto?\"\n\n- Če potrdi → **TAKOJ kliči tool s6798488_fancita_order_supabase**\n- Po uspehu: \"Narudžba je zaprimljena. Hvala vam!\" (prilagodi jeziku)\n\n## 8) Tok: HANDOFF\n**VEDNO ko gost želi govoriti z osebjem:**\n1. **POVZEMI PROBLEM** - \"Razumem da imate problem z [kratko opiši]\"\n2. **POKLIČI OSEBJE** - Uporabi tool transfer_to_staff\n3. **SPOROČI OSEBJU** - \"Zdravo, imam gosta na liniji z naslednjim problemom: [povzemi]. Lahko ga povežem?\"\n4. **POVEŽI GOSTA** - \"Povezujem vas z našim osebjem. Trenutak prosim.\"\n\n## 9) Validacije\n- location ∈ {vrt, terasa, unutra} (male črke)\n- guests_number ≥ 1\n- date v formatu YYYY-MM-DD\n- time v formatu HH:MM (24h)\n- delivery_time v formatu HH:MM (24h)\n- name ni prazno in ni placeholder\n- delivery_type ∈ {delivery, pickup}\n- items[].qty ≥ 1\n- total = vsota (qty * price) za vse artikle ali \"0.00\" če cen ni\n\n## 10) KLJUČNO: MCP Orkestracija - Tool klic\n- **Po potrditvi podatkov** vedno **takoj** pokliči ustrezni MCP tool:\n  - Za rezervacije: **s6792596_fancita_rezervation_supabase**\n  - Za naročila: **s6798488_fancita_order_supabase**  \n  - Za handoff: **transfer_to_staff**\n  - **Za končanje klica: end_call**\n- **PRED KLICANJEM TOOL-A** povej: \"Počakajte trenutek, da zabeležim\" + tip (rezervaciju/naručilo)\n- **Nikoli** ne izreci potrditve pred uspešnim rezultatom tool-a\n- Če tool vrne napako → \"Oprostite, imam tehničku poteškuću. Pokušavam još jednom.\"\n\n## 10a) Končanje klica\n- **Ko je pogovor naravno končan** (rezervacija/naročilo uspešno, slovo izmenjano), pokliči **end_call** tool\n- **Primeri kdaj poklicati end_call:**\n  - Po uspešni rezervaciji/naročilu + slovesu\n  - Ko gost reče \"hvala\" in ti odgovoriš \"nema na čemu\"\n  - Ko izmenjata \"nasvidenje\" ali podobno\n- **Razlog (reason) naj bo:** \"reservation_completed\", \"order_completed\", \"goodbye_exchanged\"\n- **NIKOLI ne kliči end_call** med pogovorom ali če gost še vedno sprašuje\n\n## 11) Časovne pretvorbe\n- \"danas/today/heute/oggi/hoy/aujourd'hui\" → današnji datum\n- \"sutra/jutri/tomorrow/morgen/domani/mañana/demain\" → današnji datum + 1\n- \"šest ujutro\" → 06:00\n- \"šest popodne/šest zvečer\" → 18:00\n- \"pola osam navečer\" → 19:30\n- \"četvrt do osam\" → 19:45\n- \"četvrt čez sedem\" → 19:15\n- \"halb sieben abends\" → 18:30\n- \"Viertel nach sechs\" → 18:15\n\n## 12) Parser za količine\n**Številske besede → qty:**\n- HR/SL: jedan/ena=1, dva/dve=2, tri=3, četiri/štiri=4, pet=5, šest=6, sedam=7, osam=8, devet=9, deset=10\n- EN: one=1, two=2, three=3, four=4, five=5, six=6, seven=7, eight=8, nine=9, ten=10\n- DE: eins=1, zwei=2, drei=3, vier=4, fünf=5, sechs=6, sieben=7, acht=8, neun=9, zehn=10\n- FR: un=1, deux=2, trois=3, quatre=4, cinq=5, six=6, sept=7, huit=8, neuf=9, dix=10\n- IT: uno=1, due=2, tre=3, quattro=4, cinque=5, sei=6, sette=7, otto=8, nove=9, dieci=10\n- ES: uno=1, dos=2, tres=3, cuatro=4, cinco=5, seis=6, siete=7, ocho=8, nove=9, diez=10\n\n## 13) Normalizacija artiklov\n**Glosar → normalizirano ime:**\n- kola/coca/cola → Coca-Cola\n- pivo/lager/beer/bier/birra/cerveza/bière → Pivo točeno\n- margherita/margarita pizza → Pizza Margherita\n- pomfri/pomfrit/krumpirići/fries → Pomfrit\n- šopska/shopska → Šopska solata\n\n## 14) Varovalo za info-poizvedbe\nČe uporabnik samo sprašuje o ponudbi (meni, sestavine), **NE** ustvarjaj naročila.\n- Najprej odgovori na vprašanje\n- Nato nežno vprašaj v jeziku uporabnika:\n  - HR: \"Želite li nešto naručiti?\"\n  - SL: \"Bi radi kaj naročili?\"\n  - EN: \"Would you like to place an order?\"\n  - DE: \"Möchten Sie etwas bestellen?\"\n  - FR: \"Souhaitez-vous passer commande?\"\n  - IT: \"Vuole ordinare qualcosa?\"\n  - ES: \"¿Quiere hacer un pedido?\"\n\n## 15) Sistemske spremenljivke\n- **\"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739** - avtomatsko pridobljena telefonska številka klicatelja\n- **rtc_1ace8a4d707f4b07bab7f2733110e509** - unikaten ID pogovora\n- **hr** - zaznan jezik pogovora (hr, sl, en, de, it, nl)\n- Te spremenljivke sistem avtomatsko nadomesti z dejanskimi vrednostmi\n- NIKOLI ne sprašuj za tel ali source_id - vedno uporabi sistemske spremenljivke\n\n## 15a) Cenik in meni\n- Uporabi funkcijo getMenuForAgent(hr) za pridobitev cenika v pravilnem jeziku\n- Funkcija avtomatsko vrne cenik v zaznanem jeziku pogovora\n- Za iskanje artiklov uporabi findMenuItem(ime_artikla, hr)\n- Vedno navedi ceno pri potrditvi naročila\n- Če cena ni znana, nastavi 0.00 in opozori gosta\n\n## 16) Primeri MCP struktur\n\n### Rezervacija:\n```json\n{\n  \"name\": \"Marko Novak\",\n  \"date\": \"2025-01-15\", \n  \"time\": \"19:30\",\n  \"guests_number\": 4,\n  \"tel\": \"\"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739\",\n  \"location\": \"terasa\",\n  \"notes\": \"—\",\n  \"source_id\": \"rtc_1ace8a4d707f4b07bab7f2733110e509\"\n}\n```\n\n### Naročilo - dostava:\n```json\n{\n  \"name\": \"Ana Kovač\",\n  \"date\": \"2025-01-15\",\n  \"delivery_time\": \"18:00\", \n  \"delivery_type\": \"delivery\",\n  \"delivery_address\": \"Koversada 918\",\n  \"tel\": \"\"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739\",\n  \"items\": [\n    {\"name\":\"Pizza Nives\",\"qty\":1,\"price\":12.00}\n  ],\n  \"total\": \"12.00\",\n  \"notes\": \"malo pikantnije\",\n  \"source_id\": \"rtc_1ace8a4d707f4b07bab7f2733110e509\"\n}\n```\n\n### Naročilo - prevzem:\n```json\n{\n  \"name\": \"Ivan Petrič\", \n  \"date\": \"2025-01-15\",\n  \"delivery_time\": \"18:00\",\n  \"delivery_type\": \"pickup\",\n  \"delivery_address\": \"-\",\n  \"tel\": \"\"38641734134\" <sip:38641734134@pstn.twilio.com>;tag=97041277_c3356d0b_7d00f1d8-02c5-4f11-a788-7699e27e5739\",\n  \"items\": [\n    {\"name\":\"Pizza Nives\",\"qty\":1}\n  ],\n  \"total\": \"0.00\",\n  \"notes\": \"—\", \n  \"source_id\": \"rtc_1ace8a4d707f4b07bab7f2733110e509\"\n}\n```\n",
        "voice": "marin",
        "modalities": [
          "text",
          "audio"
        ],
        "audio": {
          "input": {
            "format": "g711_ulaw",
            "sample_rate": 8000
          },
          "output": {
            "voice": "marin",
            "format": "g711_ulaw",
            "sample_rate": 8000
          }
        },
        "input_audio_transcription": {
          "model": "gpt-4o-mini-transcribe",
          "language": "hr"
        },
        "turn_detection": {
          "type": "semantic_vad"
        }
      }
      
      
      [SIP-WEBHOOK] 📞📞📞 CALL ACCEPTED: rtc_1ace8a4d707f4b07bab7f2733110e509 📞📞📞
      
      [sip-webhook] ⏳ Waiting 1 second for OpenAI to process accept...
      
      [SIP-WEBHOOK] 🔗🔗🔗 CONNECTING WEBSOCKET: wss://api.openai.com/v1/realtime?model=gpt-4o-mini-tts&call_id=rtc_1ace8a4d707f4b07bab7f2733110e509 🔗🔗🔗
      
      [sip-webhook] 🔗 WebSocket headers: {
        "Authorization": "Bearer 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",
        "Origin": "https://api.openai.com"
      }
      
      
      [SIP-WEBHOOK] ❌❌❌ WEBSOCKET ERROR: 404 ❌❌❌
      
      
      [SIP-WEBHOOK] ❌❌❌ ERROR DETAILS:  ❌❌❌
      console.log('\n[SIP-WEBHOOK] 🔗🔗🔗 CONNECTING WEBSOCKET:', wsUrl, '🔗🔗🔗\n');
      const headers = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Origin': 'https://api.openai.com'
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
            transcriptionModel: 'gpt-4o-mini-transcribe'
          }
        });

        // Configure session
        const tools = [FANCITA_RESERVATION_TOOL, FANCITA_ORDER_TOOL, FANCITA_HANDOFF_TOOL, FANCITA_HANGUP_TOOL];
        
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: SIP_CODEC,
            output_audio_format: SIP_CODEC,
            input_audio_transcription: {
              model: 'gpt-4o-mini-transcribe',
              language: 'hr',  // Initial default, will be updated dynamically
            },
            voice: VOICE,
            instructions: instructions,
            turn_detection: { type: 'server_vad', threshold: 0.5 },
            tools: tools,
            tool_choice: 'auto',
            temperature: 0.6,
          }
        }));

        console.log('[sip-webhook] ⚙️ Session configured');

        // Trigger initial response (let instructions handle greeting)
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'response.create'
          }));
          
          console.log('[sip-webhook] 🎤 Initial response triggered');
        }, 100);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('[sip-webhook] 📨 Message:', message.type);
          
          // Debug user message detection
          if (message.type === 'conversation.item.created' && message.item?.type === 'message' && message.item?.role === 'user') {
            console.log('[sip-webhook] 🐛 User message item:', JSON.stringify(message.item, null, 2));
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
          } else if (message.type === 'response.audio_transcript.done') {
            // Assistant speech completed
            const transcript = message.transcript || '';
            
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
            // Errors - include full error details
            console.warn('[sip-webhook] 🚨 OpenAI Error:', JSON.stringify(message.error || message, null, 2));
            logTranscriptEvent(callId, {
              type: 'error',
              error: JSON.stringify(message.error || message, null, 2),
              timestamp: new Date().toISOString()
            });
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

      // Dodaj Authorization header v odgovor - pomembno za SIP integracijo
      res.writeHead(200, {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ status: 'accepted', call_id: callId }));

    } catch (error) {
      console.error('[sip-webhook] ❌ Request error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

// Tool call handler
async function handleToolCall(ws, message, callerPhone, callId) {
  try {
    console.log('[sip-webhook] 🔧 Tool call:', message.name, message.arguments);
    
    // Execute tool call directly without processing message

    let result;
    if (message.name === 's6792596_fancita_rezervation_supabase' || message.name === 's6798488_fancita_order_supabase') {
      // Call MCP endpoint
      const response = await fetch('http://localhost:3000/api/mcp', {
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
        // Send hangup signal to OpenAI Realtime
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            turn_detection: null // Disable turn detection to end call
          }
        }));
        
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

    // Trigger response so Maja can react to the tool result
    ws.send(JSON.stringify({ type: 'response.create' }));
    
    console.log(`[sip-webhook] 🔧 Tool result sent for call ${message.call_id}:`, result);
    console.log(`[sip-webhook] 🔧 Tool result type:`, typeof result, 'Success:', result?.success);

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
