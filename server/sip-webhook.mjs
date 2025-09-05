#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';
import WebSocket from 'ws';  // Native ws should work fine in pure Node.js
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.SIP_WEBHOOK_PORT || '3003', 10);

// Constants
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;
const MODEL = 'gpt-4o-realtime-preview-2025-06-03';
const VOICE = 'marin';
const SIP_CODEC = 'g711_ulaw';

// Deduplicate accepts per call_id within this process
const acceptedCallIds = new Set();

// Track calls that should hangup after final message
const pendingHangups = new Map();

// Helper function to replace instruction variables
function replaceInstructionVariables(instructions, callerId, conversationId) {
  return instructions
    .replace(/\{\{system__caller_id\}\}/g, callerId)
    .replace(/\{\{system__conversation_id\}\}/g, conversationId);
}

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

// Unified instructions
const FANCITA_UNIFIED_INSTRUCTIONS = `
# Fančita Restaurant Agent

## 0) System & constants
- tel vedno = {{system__caller_id}}
- source_id vedno = {{system__conversation_id}}
- Privzeta lokacija rezervacije: terasa
- Kratki odgovori, brez ponavljanja po vsakem stavku; enkratna potrditev na koncu.

## 1) Jezik - AVTOMATSKA DETEKCIJA
- **TAKOJ** po prvem user response ZAZNI jezik in preklopi nanj.
- Če user govori angleško → TAKOJ odgovori angleško (Hello, Restaurant Fančita, Maja speaking. How can I help you?)
- Če user govori slovensko → TAKOJ odgovori slovensko (Restavracija Fančita, tukaj Maja. Kako vam lahko pomagam?)
- Če user govori hrvaško → odgovori hrvaško (kot običajno)
- **NIKOLI** ne ostajaj v hrvaškem če user jasno govori drugače.

## 2) Osebnost in stil
- Ti si Maja, prijazna in učinkovita asistentka restavracije Fančita v Vrsarju.
- Vikanje, topel ton, kratke jasne povedi.

## 3) Pozdrav in prepoznavanje namena
- **Prvi response mora biti**: "Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?"
- Če klicatelj želi rezervirati mizo → RESERVATION
- Če želi naročiti hrano/pijačo → ORDER
- Če želi govoriti z osebjem → HANDOFF

## 4) Tok: RESERVATION
Vprašaj samo za manjkajoče podatke v tem vrstnem redu:
1. guests_number – "Za koliko oseba?"
2. date – "Za koji datum?"
3. time – "U koje vrijeme?"
4. name – vedno vprašaj: "Na koje ime?"
5. notes – "Imate li posebnih želja (alergije, lokacija, rođendan)?"

**Potrditev (enkrat):**
"Razumem: [date], [time], [guests_number] osoba, ime [name], lokacija [location]. Je li točno?"

- Če potrdi → **TAKOJ kliči tool s6792596_fancita_rezervation_supabase**
- Po uspehu: "Rezervacija je zavedena. Vidimo se u Fančiti."

## 5) Tok: ORDER
Vprašaj samo za manjkajoče podatke v tem vrstnem redu:
1. delivery_type – vedno **najprej potrdi** ali gre za dostavo ali prevzem.
   - Če uporabnik reče *delivery* → takoj vprašaj za delivery_address.
   - Če *pickup* → delivery_address = "-".
2. items – "Recite narudžbu (jelo i količina)."
3. date – datum dostave/prevzema  
4. delivery_time – čas dostave v HH:MM
5. name – ime za naročilo
6. notes – posebne želje

**Potrditev (enkrat, vedno z zneskom):**
"Razumijem narudžbu: [kratko naštej], [delivery_type], [date] u [delivery_time], ime [name], ukupno [total] €. Je li točno?"

- Če potrdi → **TAKOJ kliči tool s6798488_fancita_order_supabase**
- Po uspehu: "Narudžba je zaprimljena. Hvala vam!"

## 6) Tok: HANDOFF
**VEDNO ko gost želi govoriti z osebjem:**
1. **POVZEMI PROBLEM** - "Razumem da imate problem z [kratko opiši]"
2. **POKLIČI OSEBJE** - Uporabi tool transfer_to_staff  
3. **SPOROČI OSEBJU** - "Zdravo, imam gosta na liniji z naslednjim problemom: [povzemi]. Lahko ga povežem?"
4. **POVEŽI GOSTA** - "Povezujem vas z našim osebjem. Trenutak prosim."

## 7) Validacije
- location ∈ {vrt, terasa, unutra} (male črke)
- guests_number ≥ 1
- date v formatu YYYY-MM-DD
- time v formatu HH:MM (24h)
- name ni prazno

## 8) KLJUČNO: MCP Orkestracija
- **Po potrditvi podatkov** vedno **takoj** pokliči ustrezni MCP tool
- **Nikoli** ne izreci potrditve pred uspešnim rezultatom tool-a
- Če tool vrne napako → "Oprostite, imam tehničku poteškuću. Pokušavam još jednom."

## 9) Časovne pretvorbe
- "danas" → današnji datum
- "sutra" / "jutri" → današnji datum + 1
- "šest ujutro" → 06:00
- "šest popodne" / "šest zvečer" → 18:00
`;

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
      console.log('[sip-webhook] 📞 Incoming call event:', body);
      
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
      const instructions = replaceInstructionVariables(FANCITA_UNIFIED_INSTRUCTIONS, callerFrom, callId);

      const acceptPayload = {
        type: 'realtime',
        model: MODEL,
        instructions: instructions,
        voice: VOICE,
        modalities: ['text', 'audio'],
        audio: {
          input: { format: SIP_CODEC, sample_rate: 8000 },
          output: { voice: VOICE, format: SIP_CODEC, sample_rate: 8000 }
        },
        turn_detection: { type: 'server_vad', threshold: 0.5 }
      };

      console.log('[sip-webhook] 🔄 Accepting call with payload:', JSON.stringify(acceptPayload, null, 2));

      const resAccept = await fetch(acceptUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Project': OPENAI_PROJECT_ID,
          'OpenAI-Beta': 'realtime=v1'
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
      console.log('[sip-webhook] ✅ Call accepted:', callId);

      // Connect to WebSocket - THIS SHOULD WORK IN PURE NODE.JS
      const wsUrl = `wss://api.openai.com/v1/realtime?call_id=${callId}`;
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': OPENAI_PROJECT_ID,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      ws.on('open', () => {
        console.log('[sip-webhook] 🔗 WebSocket connected for', callId);
        
        // Log session start with enhanced metadata
        const startTime = new Date();
        logTranscriptEvent(callId, {
          type: 'session_start',
          sessionId: callId,
          content: `📞 Klic iz: ${callerPhone} | 📅 ${startTime.toLocaleDateString('sl-SI')} ${startTime.toLocaleTimeString('sl-SI')}`,
          metadata: { 
            callerPhone,
            startTime: startTime.toISOString(),
            startTimeFormatted: `${startTime.toLocaleDateString('sl-SI')} ${startTime.toLocaleTimeString('sl-SI')}`,
            model: MODEL,
            voice: VOICE,
            codec: SIP_CODEC
          }
        });

        // Configure session
        const tools = [FANCITA_RESERVATION_TOOL, FANCITA_ORDER_TOOL, FANCITA_HANDOFF_TOOL];
        
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: SIP_CODEC,
            output_audio_format: SIP_CODEC,
            voice: VOICE,
            instructions: instructions,
            turn_detection: { type: 'server_vad', threshold: 0.5 },
            input_audio_transcription: { model: 'whisper-1' },
            tools: tools,
            tool_choice: 'auto',
            temperature: 0.8,
          }
        }));

        console.log('[sip-webhook] ⚙️ Session configured');

        // Trigger initial greeting
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: '*klic se vzpostavlja*' }]
            }
          }));
          
          ws.send(JSON.stringify({ type: 'response.create' }));
          console.log('[sip-webhook] 🎤 Initial greeting triggered');
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
            // User speech completed - THIS IS THE REAL USER MESSAGE
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'user',
              content: message.transcript,
              timestamp: new Date().toISOString()
            });
            
            // Log user transcript - system will handle it automatically
            console.log('[sip-webhook] 🔄 User transcript received:', message.transcript);
            
          } else if (message.type === 'conversation.item.created' && message.item?.type === 'message' && message.item?.role === 'user') {
            // Skip logging here - we'll log only when transcription is completed
            console.log('[sip-webhook] 🎤 User audio received, waiting for transcription...');
          } else if (message.type === 'response.audio_transcript.done') {
            // Assistant speech completed
            logTranscriptEvent(callId, {
              type: 'message',
              role: 'assistant', 
              content: message.transcript,
              timestamp: new Date().toISOString()
            });
          } else if (message.type === 'response.function_call_arguments.done') {
            // Tool call completed
            const parsedArgs = JSON.parse(message.arguments || '{}');
            logTranscriptEvent(callId, {
              type: 'tool_call',
              tool_name: message.name,
              arguments: JSON.stringify(parsedArgs, null, 2),
              call_id: message.call_id,
              timestamp: new Date().toISOString(),
              // Add metadata similar to session_start
              metadata: {
                toolName: message.name,
                callId: message.call_id,
                argumentCount: Object.keys(parsedArgs).length,
                argumentKeys: Object.keys(parsedArgs)
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
              result: JSON.stringify(parsedOutput, null, 2),
              timestamp: new Date().toISOString(),
              // Add metadata based on parsed output
              metadata: {
                callId: message.item.call_id,
                status: parsedOutput.success ? 'success' : 'error',
                resultType: typeof parsedOutput,
                hasData: !!(parsedOutput.data || parsedOutput.content),
                mode: parsedOutput.mode || 'mcp',
                mcpSuccess: parsedOutput.success === true
              }
            });
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

          // Auto-hangup logic
          if (message.type === 'response.audio_transcript.done') {
            const transcript = message.transcript?.toLowerCase() || '';
            
            // Check for hangup phrases in different languages
            const hangupPhrases = [
              'hvala in prijetno uživanje', 'vidimo se', 'naročilo je zaznano',
              'rezervacija je zavedena', 'hvala za poklic', 'nasvidenje',
              'goodbye', 'see you', 'thank you for calling',
              'reservation is confirmed', 'see you in fančita', 'thank you',
              'vidimo se u fančiti', 'hvala vam', 'rezervacija je potvrđena',
              'the reservation is confirmed', 'confirmed', 'all set',
              'thank you and see you', 'have a great day'
            ];
            
            if (hangupPhrases.some(phrase => transcript.includes(phrase))) {
              // Check if hangup already scheduled
              if (!pendingHangups.has(callId)) {
                console.log('[sip-webhook] 📞 Detected hangup phrase, scheduling hangup');
                pendingHangups.set(callId, Date.now());
                
                setTimeout(() => {
                  if (pendingHangups.has(callId)) {
                    console.log('[sip-webhook] 📞 Auto-hanging up after final message');
                    
                    // Close our WebSocket directly - no call.hangup in API
                    ws.close(1000, 'Call completed');
                    
                    pendingHangups.delete(callId);
                  }
                }, 1500); // Reduced to 1.5 seconds
              }
            }
          }

        } catch (error) {
          console.error('[sip-webhook] ❌ Message parse error:', error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log('[sip-webhook] 🔚 WebSocket closed for', callId, 'Code:', code, 'Reason:', reason?.toString());
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

      res.writeHead(200);
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
    
    // First, let the user know we're processing
    const toolName = message.name;
    let processingMessage = '';
    
    if (toolName?.includes('rezervation')) {
      processingMessage = 'Trenutak prosim, zapisujem rezervaciju...';
    } else if (toolName?.includes('order')) {
      processingMessage = 'Trenutak prosim, obrađujem narudžbu...';
    } else {
      processingMessage = 'Trenutak prosim, obrađujem zahtjev...';
    }
    
    // Send processing message immediately
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: processingMessage
        }]
      }
    }));
    
    // Trigger immediate response for the processing message
    ws.send(JSON.stringify({
      type: 'response.create'
    }));

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
        result = await response.json();
        console.log('[sip-webhook] ✅ MCP call successful:', result);
      } else {
        result = { success: false, error: 'MCP call failed' };
      }
    } else if (message.name === 'transfer_to_staff') {
      // Simulate staff handoff
      result = { success: true, message: 'Transfer initiated' };
    }

    // Send result back to OpenAI
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: message.call_id,
        output: result // Don't double-stringify, OpenAI expects the raw object
      }
    }));

    ws.send(JSON.stringify({ type: 'response.create' }));

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
