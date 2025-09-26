// OpenAI Realtime SIP webhook handler
// NOTE: Za začetek ne izvajamo verifikacije podpisa; fokus je na delujočem sprejemu klica.

// Import shared instructions
import { FANCITA_UNIFIED_INSTRUCTIONS } from '../../../agentConfigs/shared/instructions';
import { parseDateExpression, getSlovenianDateTime } from '../../../lib/slovenianTime';
import { replaceInstructionVariables } from '../../../agentConfigs/shared/instructionVariables';
import { NextResponse } from 'next/server';

// Deduplicate accepts per call_id within this process
const acceptedCallIds = new Set<string>();

// Track detected language per call for dynamic transcription
const callLanguages = new Map<string, string>(); // callId -> language code (hr, sl, en, de, it, nl)

// Function to update transcription language dynamically
function updateTranscriptionLanguage(ws: any, callId: string, newLanguage: string) {
  const validLanguages = ['hr', 'sl', 'en', 'de', 'it', 'nl'];
  if (!validLanguages.includes(newLanguage)) return;
  
  const currentLang = callLanguages.get(callId);
  if (currentLang === newLanguage) return; // No change needed
  
  callLanguages.set(callId, newLanguage);
  console.log(`[openai-webhook] 🌍 Updating transcription language to: ${newLanguage} for call ${callId}`);
  
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

// Transcript bridge connection for realtime sharing
import WebSocket from 'ws';

let transcriptBridgeWs: WebSocket | null = null;

function connectTranscriptBridge() {
  const bridgeUrl = process.env.TRANSCRIPT_BRIDGE_URL || 'ws://localhost:3002';
  
  try {
    transcriptBridgeWs = new WebSocket(bridgeUrl);
    
    transcriptBridgeWs.on('open', () => {
      console.log('[openai-webhook] Connected to transcript bridge');
    });
    
    transcriptBridgeWs.on('close', () => {
      console.log('[openai-webhook] Transcript bridge disconnected');
      transcriptBridgeWs = null;
      
      // Reconnect after 3 seconds
      setTimeout(connectTranscriptBridge, 3000);
    });
    
    transcriptBridgeWs.on('error', (error: any) => {
      console.error('[openai-webhook] Transcript bridge error:', error);
    });
    
  } catch (error) {
    console.error('[openai-webhook] Failed to connect to transcript bridge:', error);
  }
}

function sendTranscriptEvent(sessionId: string, event: any) {
  // File-based transcript logging (WebSocket alternative)
  try {
    const fs = require('fs');
    const path = require('path');
    
    const transcriptsDir = path.join(process.cwd(), 'logs', 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const logFile = path.join(transcriptsDir, `${sessionId}.log`);
    const logEntry = `[${new Date().toISOString()}] ${JSON.stringify(event)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
  } catch (error: any) {
    console.warn('[transcript] Error logging event:', error.message);
  }
  
  // Also try WebSocket if available
  if (transcriptBridgeWs && transcriptBridgeWs.readyState === WebSocket.OPEN) {
    try {
      transcriptBridgeWs.send(JSON.stringify({
        type: 'transcript_event',
        sessionId,
        event
      }));
  } catch (error: any) {
      console.warn('[transcript] Error sending to bridge:', error.message);
    }
  }
}

function endTranscriptSession(sessionId: string) {
  try {
    sendTranscriptEvent(sessionId, {
      type: 'session_end',
      sessionId,
      endTime: new Date().toISOString(),
      closeCode: 1000,
      closeReason: 'Normal closure'
    });
  } catch (error: any) {
    console.warn('[transcript] Error ending session:', error.message);
  }
}

// Initialize transcript bridge connection - DISABLED due to WebSocket issues
// connectTranscriptBridge();

// Emergency fallback - return proper TwiML for direct audio
function returnDirectAudioResponse(voice = process.env.OPENAI_REALTIME_VOICE || 'marin') {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="hr-HR">Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?</Say>
  <Pause length="30"/>
</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

// Tool handler functions
async function handleCheckAvailabilityTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  console.log('[openai-webhook] 🚨🚨🚨 ENTERED handleCheckAvailabilityTool FUNCTION 🚨🚨🚨');
  try {
    console.log('[openai-webhook] 🚀 STARTING handleCheckAvailabilityTool');
    console.log('[openai-webhook] 🚀 Function called with:', { functionCallId, args, callerPhone, callId });
    console.log('[openai-webhook] 🚀 WebSocket state:', ws.readyState);
    console.log('[openai-webhook] Executing availability check tool with args:', args);
    const params = JSON.parse(args);
    
    // Load settings for default values
    const settings = require('../../../../server/settings.json');
    const availabilitySettings = settings.availability || {};
    
    // Prepare request data with defaults from settings
    const requestData = {
      date: parseDateExpression(params.date),
      time: params.time,
      people: params.people,
      location: params.location,
      duration_min: params.duration_min || (params.people <= (availabilitySettings.duration?.threshold || 4) 
        ? (availabilitySettings.duration?.smallGroup || 90) 
        : (availabilitySettings.duration?.largeGroup || 120)),
         slot_minutes: params.slot_minutes || availabilitySettings.slotMinutes || 15,
         capacity_terasa: params.capacity_terasa || availabilitySettings.capacity_terasa || 40,
         capacity_vrt: params.capacity_vrt || availabilitySettings.capacity_vrt || 40,
         suggest_max: params.suggest_max || availabilitySettings.suggest_max || 6,
         suggest_stepSlots: params.suggest_stepSlots || availabilitySettings.suggest_stepSlots || 1,
         suggest_forwardSlots: params.suggest_forwardSlots || availabilitySettings.suggest_forwardSlots || 12
    };
    
    // Call MCP endpoint (same pattern as reservation tool)
    console.log('[openai-webhook] 🔧 Calling MCP endpoint for availability check');
    console.log('[openai-webhook] 🔧 Request data:', JSON.stringify(requestData, null, 2));
    
    const mcpResponse = await fetch('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 's7260221_check_availability',
        data: requestData
      })
    });
    
    console.log('[openai-webhook] 🔧 MCP response received, status:', mcpResponse.status);

    if (!mcpResponse.ok) {
      console.error('[openai-webhook] 🚨 MCP response not OK:', mcpResponse.status, mcpResponse.statusText);
      const errorText = await mcpResponse.text();
      console.error('[openai-webhook] 🚨 MCP error response:', errorText);
      throw new Error(`MCP API error: ${mcpResponse.status} ${mcpResponse.statusText}`);
    }

    const result = await mcpResponse.json();
    console.log('[openai-webhook] 🔧 MCP result:', result);

    // Send function result back to OpenAI (same pattern as reservation tool)
    let outputData = result.success ? result.data : result;
    
    console.log('[openai-webhook] 🔧 Final outputData for OpenAI:', outputData);
    console.log('[openai-webhook] 🔧 About to send function_call_output with callId:', functionCallId);

    console.log('[openai-webhook] 🚀 SENDING RESULT TO OPENAI:', {
      functionCallId,
      outputData,
      outputDataString: JSON.stringify(outputData)
    });

    const outputMessage = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(outputData)
      }
    };
    
    console.log('[openai-webhook] 🚀 FULL OUTPUT MESSAGE:', JSON.stringify(outputMessage, null, 2));
    
    ws.send(JSON.stringify(outputMessage));

    console.log('[openai-webhook] 🚀 RESULT SENT, generating response...');

    // Always generate response after function call
    const responseMessage = { type: 'response.create' };
    console.log('[openai-webhook] 🚀 SENDING RESPONSE CREATE:', JSON.stringify(responseMessage));
    
    ws.send(JSON.stringify(responseMessage));

    console.log('[openai-webhook] 🚀 RESPONSE GENERATION TRIGGERED');
    
    // Log the tool call
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 'check_availability',
      arguments: args,
      call_id: functionCallId,
      result: result,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 'check_availability',
        callId: functionCallId,
        argumentCount: Object.keys(params).length,
        argumentKeys: Object.keys(params),
        success: result.success !== false
      }
    });

  } catch (error: any) {
    console.error('[openai-webhook] 🚨 AVAILABILITY CHECK TOOL ERROR:', error);
    console.error('[openai-webhook] 🚨 Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      functionCallId,
      args
    });
    
    const errorOutput = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      status: 'error',
      message: 'Oprostite, trenutno ne morem preveriti zasedenosti. Poskusite kasneje.'
    };
    
    console.log('[openai-webhook] 🚨 Sending error output:', errorOutput);
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(errorOutput)
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

async function handleReservationTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing reservation tool with args:', args);
    const params = JSON.parse(args);
    
    // callerPhone is already clean from the main handler
    const cleanPhone = callerPhone;
    
    // Send "processing" message before calling MCP
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Trenutak, zapisujem rezervaciju...'
          }
        ]
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    console.log('[openai-webhook] Processing message sent');
    
    // Call MCP endpoint
    const mcpResponse = await fetch('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 's6792596_fancita_rezervation_supabase',
        data: {
          name: params.name,
          date: parseDateExpression(params.date),
          time: params.time,
          guests_number: params.guests_number,
          // Compute duration_min from settings if not provided
          duration_min: (() => {
            try {
              const settings = require('../../../../server/settings.json');
              const availability = settings.availability || {};
              const threshold = availability.duration?.threshold || 4;
              const small = availability.duration?.smallGroup || 90;
              const large = availability.duration?.largeGroup || 120;
              const people = Number(params.guests_number);
              return params.duration_min || (people <= threshold ? small : large);
            } catch {
              return params.duration_min || 90;
            }
          })(),
          location: params.location || 'terasa',
          notes: params.notes || '—',
          tel: cleanPhone,
          source_id: functionCallId, // Use function call ID for uniqueness
        }
      })
    });

    const result = await mcpResponse.json();
    console.log('[openai-webhook] MCP result:', result);

    // Send function result back to OpenAI with proper format
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(result.success ? result.data : result)
      }
    }));

    // Always generate response after function call
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Log the tool call with cleaned data
    const cleanedParams = {
      ...params,
      tel: cleanPhone  // Use cleaned phone number for transcript
    };
    
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 's6792596_fancita_rezervation_supabase',
      arguments: JSON.stringify(cleanedParams),
      call_id: functionCallId,
      result: result,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 's6792596_fancita_rezervation_supabase',
        callId: functionCallId,
        argumentCount: Object.keys(cleanedParams).length,
        argumentKeys: Object.keys(cleanedParams),
        success: result.success || false
      }
    });

  } catch (error) {
    console.error('[openai-webhook] Reservation tool error:', error);
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ error: 'Failed to process reservation' })
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

async function handleOrderTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing order tool with args:', args);
    const params = JSON.parse(args);
    
    // callerPhone is already clean from the main handler
    const cleanPhone = callerPhone;
    
    // Send processing message
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Trenutak, zapisujem narudžbu...'
          }
        ]
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Call MCP endpoint
    const mcpResponse = await fetch('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      action: 's6798488_fancita_order_supabase',
      data: {
          name: params.name,
          date: params.date,
          delivery_time: params.delivery_time,
          delivery_type: params.delivery_type,
          delivery_address: params.delivery_address,
          items: params.items,
          total: params.total,
          notes: params.notes || '—',
        tel: cleanPhone,
          source_id: functionCallId,
        }
      })
    });

    const result = await mcpResponse.json();
    console.log('[openai-webhook] MCP order result:', result);

    // Send function result
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(result.success ? result.data : result)
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Log the tool call with cleaned data
    const cleanedParams = {
      ...params,
      tel: cleanPhone  // Use cleaned phone number for transcript
    };
    
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 's6798488_fancita_order_supabase',
      arguments: JSON.stringify(cleanedParams),
      call_id: functionCallId,
      result: result,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 's6798488_fancita_order_supabase',
        callId: functionCallId,
        argumentCount: Object.keys(cleanedParams).length,
        argumentKeys: Object.keys(cleanedParams),
        success: result.success || false
      }
    });

  } catch (error) {
    console.error('[openai-webhook] Order tool error:', error);
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ error: 'Failed to process order' })
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

async function handleTransferTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing transfer tool with args:', args);
    const params = JSON.parse(args);
    
    // callerPhone is already clean from the main handler
    const cleanPhone = callerPhone;
    
    // Send processing message
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Povezujem vas z našim osebjem. Trenutak prosim...'
          }
        ]
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Call Twilio test endpoint to notify staff
    const staffResponse = await fetch('http://localhost:3000/api/twilio/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: '+38640341045', // Staff number
        message: `Gost ${cleanPhone} potrebuje pomoč: ${params.problem_summary}`
      })
    });

    const staffResult = await staffResponse.json();
    console.log('[openai-webhook] Staff notification result:', staffResult);

    // Wait 3 seconds then transfer
    setTimeout(async () => {
      try {
        // Attempt actual call transfer via Twilio
        const transferResponse = await fetch('http://localhost:3000/api/twilio/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'transfer',
            from: cleanPhone,
            to: '+38640341045'
          })
        });

        const transferResult = await transferResponse.json();
        console.log('[openai-webhook] Transfer result:', transferResult);
      } catch (transferError) {
        console.error('[openai-webhook] Transfer failed:', transferError);
      }
    }, 3000);

    // Send function result
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ success: true, message: 'Transfer initiated' })
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Log the tool call
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 'transfer_to_staff',
      arguments: args,
      call_id: functionCallId,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 'transfer_to_staff',
        callId: functionCallId,
        argumentCount: Object.keys(params).length,
        argumentKeys: Object.keys(params)
      }
    });

  } catch (error) {
    console.error('[openai-webhook] Transfer tool error:', error);
    
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ error: 'Failed to transfer call' })
      }
    }));
    
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
    const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || '';
    const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
    const VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
    // Try best codec first: pcm16 > g722 > g711_ulaw
    const SIP_CODEC = process.env.SIP_AUDIO_CODEC || 'pcm16'; // pcm16 = 24kHz high quality

    if (!OPENAI_API_KEY) {
      return new Response('Missing OPENAI_API_KEY', { status: 500 });
    }

    // OpenAI webhook pošlje JSON event
    const bodyText = await req.text();
    let event: any;
    try {
      event = JSON.parse(bodyText);
    } catch (err) {
      console.error('[openai-webhook] Invalid JSON:', bodyText);
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!event || !event.type) {
      return new Response('Bad Request', { status: 400 });
    }

    // Sprejmi klic in konfiguriraj realtime sejo
    if (event.type === 'realtime.call.incoming') {
      console.log('[openai-webhook] incoming call event', JSON.stringify(event, null, 2));
      
      // Ekstraktiraj SDP iz event podatkov, če je na voljo
      try {
        const eventStr = JSON.stringify(event);
        const sdpMatch = eventStr.match(/v=0[\s\S]*?(?=",|"$)/);
        if (sdpMatch) {
          console.log('[openai-webhook] SDP content found:', sdpMatch[0]);
        } else {
          console.log('[openai-webhook] No SDP content in event data');
        }
      } catch (e) {
        console.warn('[openai-webhook] Failed to extract SDP:', e);
      }
      
      const callId = event?.data?.call_id as string | undefined;
      if (!callId) return new Response('Missing call_id', { status: 400 });

      if (acceptedCallIds.has(callId)) {
        // Already accepted; acknowledge quickly
        return new Response('OK', { status: 200 });
      }

      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`;
      // Extract caller info for template replacement in accept
      const callerFrom = event?.data?.sip_headers?.find((h: any) => h.name === 'From')?.value || 'unknown';
      
      // Extract clean phone number from SIP From header
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
          console.warn(`[openai-webhook] ⚠️ Could not extract clean phone from SIP header: ${callerFrom}`);
          callerPhone = callerFrom.includes('+') ? callerFrom : '+' + callerFrom.match(/\d+/)?.[0] || callerFrom;
        }
      }
      const slNow = getSlovenianDateTime();
      const nowStr = slNow.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' });
      const acceptInstructions = await replaceInstructionVariables(
        `${FANCITA_UNIFIED_INSTRUCTIONS}\n\n[Timezone] Vedno uporabljaj Europe/Ljubljana. Trenutni čas v Sloveniji: ${nowStr}.`
      );

      const acceptPayload = {
        type: 'realtime',
        model: MODEL,
        instructions: acceptInstructions,
        voice: VOICE,
        modalities: ['text', 'audio'],
        audio: { 
          input: { 
            format: SIP_CODEC, 
            sample_rate: SIP_CODEC === 'pcm16' ? 24000 : (SIP_CODEC === 'g722' ? 16000 : 8000)
          },
          output: { 
            voice: VOICE, 
            format: SIP_CODEC, 
            sample_rate: SIP_CODEC === 'pcm16' ? 24000 : (SIP_CODEC === 'g722' ? 16000 : 8000)
          }
        },
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'hr',  // Initial default, should be updated dynamically
        },
        turn_detection: { type: 'semantic_vad' },
      } as const;

      console.log('[openai-webhook] accept payload for', callId, JSON.stringify(acceptPayload, null, 2));

      const resAccept = await fetch(acceptUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          ...(OPENAI_PROJECT_ID ? { 'OpenAI-Project': OPENAI_PROJECT_ID } : {}),
          'OpenAI-Beta': 'realtime=v1',
        },
        body: JSON.stringify(acceptPayload),
      });

      if (!resAccept.ok) {
        const txt = await resAccept.text();
        console.error('[openai-webhook] accept failed', resAccept.status, txt);
        return new Response('Accept failed', { status: 500 });
      }
      console.log('[openai-webhook] accept ok for', callId);

      acceptedCallIds.add(callId);

      // Po sprejemu klica asinhrono odpremo WS na events kanal in sprožimo uvodni odziv
              ;(async () => {
          // Kratka zakasnitev za stabilnost
          await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          // Log session start with enhanced metadata
          const startTime = new Date();
          sendTranscriptEvent(callId, {
            type: 'session_start',
            sessionId: callId,
            content: `📞 Klic iz: ${callerPhone} | 📅 ${startTime.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' })} ${startTime.toLocaleTimeString('sl-SI', { timeZone: 'Europe/Ljubljana' })}`,
            metadata: { 
              callerPhone,
              startTime: startTime.toISOString(),
              startTimeFormatted: `${startTime.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' })} ${startTime.toLocaleTimeString('sl-SI', { timeZone: 'Europe/Ljubljana' })}`,
              model: MODEL,
              voice: VOICE,
              codec: SIP_CODEC
            }
          });
          
          try {
          // Onemogoči nativne ekstenzije za `ws`
          try {
            // @ts-ignore
            process.env.WS_NO_BUFFER_UTIL = '1';
            // @ts-ignore
            process.env.WS_NO_UTF_8_VALIDATE = '1';
          } catch {}
          const { WebSocket } = await import('ws');
          const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
          const headers: Record<string, string> = {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1',
          };
          if (OPENAI_PROJECT_ID) headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
          const ws = new WebSocket(url, { headers });
          ws.on('open', () => {
            console.log('[openai-webhook] ws open for', callId);
            
            // Send session start event
            sendTranscriptEvent(callId, {
              type: 'session_start',
              metadata: { 
                source: 'sip_call',
                caller: callerPhone,
                timestamp: new Date().toISOString()
              }
            });
            try {
              // Send session update with tools
              ws.send(JSON.stringify({
                type: 'session.update',
                session: {
        tools: [
          {
            type: 'function',
            name: 'get_slovenian_time',
            description: 'Vrne trenutni datum/uro za Europe/Ljubljana. Uporabljaj to orodje za čas/datum.',
            parameters: { type: 'object', properties: {} }
          },
          {
            type: 'function',
            name: 's7260221_check_availability',
            description: 'MOCK: Always returns available status for testing',
            parameters: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
                time: { type: 'string', description: 'Reservation time (HH:MM)' },
                people: { type: 'number', description: 'Number of guests' },
                location: { type: 'string', description: 'Table location: terasa or vrt' }
              },
              required: ['date', 'time', 'people', 'location']
            }
          },
                    {
                      type: 'function',
                      name: 'check_availability',
                      description: 'Check table availability for a specific date, time, and location before making a reservation',
                      parameters: {
                        type: 'object',
                        properties: {
                          date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
                          time: { type: 'string', description: 'Reservation time (HH:MM)' },
                          people: { type: 'number', description: 'Number of guests' },
                          location: { type: 'string', description: 'Table location: terasa or vrt' },
                          duration_min: { type: 'number', description: 'Reservation duration in minutes' },
                          slot_minutes: { type: 'number', description: 'Time slot granularity' },
                          capacity: { type: 'object', description: 'Capacity per location' },
                          suggest: { type: 'object', description: 'Suggestion parameters' }
                        },
                        required: ['date', 'time', 'people', 'location']
                      }
                    },
                    {
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
                          duration_min: { type: 'number', description: 'Reservation duration in minutes' },
                          location: { type: 'string', description: 'Location: vrt or terasa' },
                          notes: { type: 'string', description: 'Additional notes' },
                          tel: { type: 'string', description: 'Phone number' },
                          source_id: { type: 'string', description: 'Source conversation ID' }
                        },
                        required: ['name', 'date', 'time', 'guests_number', 'duration_min', 'tel', 'source_id']
                      }
                    },
                    {
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
                    },
                    {
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
                    }
                  ]
                }
              }));
              
              // Trigger initial greeting
              ws.send(JSON.stringify({
                type: 'response.create'
              }));
              console.log('[openai-webhook] initial response.create sent');
            } catch (e) {
              console.warn('[openai-webhook] session setup failed', e);
            }
          });
          ws.on('message', (m) => {
            try {
              const ev = JSON.parse(m.toString());
              
              // Skip audio deltas to reduce log noise
              if (ev?.type === 'response.audio.delta') return;
              
              console.log('[openai-webhook] ws event', ev?.type || 'unknown');
              
              // CRITICAL DEBUG - LOG ALL FUNCTION CALL EVENTS
              if (ev?.type && ev.type.includes('function_call')) {
                console.log('[openai-webhook] 🚨🚨🚨 FUNCTION CALL EVENT DETECTED 🚨🚨🚨');
                console.log('[openai-webhook] 🚨 Event type:', ev.type);
                console.log('[openai-webhook] 🚨 Full event:', JSON.stringify(ev, null, 2));
              }
              
              // DIRECT HANDLER FOR s7260221_check_availability
              if (ev?.type === 'response.function_call_arguments.done' && ev?.name === 's7260221_check_availability') {
                console.log('[openai-webhook] 🚨🚨🚨 DIRECT AVAILABILITY CHECK HANDLER 🚨🚨🚨');
                console.log('[openai-webhook] 🚨 Function call ID:', ev?.call_id);
                console.log('[openai-webhook] 🚨 Args:', ev?.arguments);
                
                // DIRECT MCP CALL TO MAKE.COM
                handleCheckAvailabilityTool(ws, ev?.call_id, ev?.arguments, callerPhone, callId);
                console.log('[openai-webhook] 🚨 DIRECT MCP CALL INITIATED');
                return; // Exit early
              }
              
              // Log session updates
              if (ev?.type === 'session.update') {
                sendTranscriptEvent(callId, {
                  type: 'session_update',
                  session: ev.session,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Log messages
              if (ev?.type === 'response.done' && ev?.response?.output) {
                for (const item of ev.response.output) {
                  if (item?.type === 'message' && item?.role === 'assistant' && item?.content) {
                    for (const content of item.content) {
                      if (content?.type === 'text' && content?.text) {
                  sendTranscriptEvent(callId, {
                    type: 'message',
                          role: 'assistant',
                          content: content.text,
                          timestamp: new Date().toISOString()
                        });
                      }
                    }
                  }
                }
              }
              
              // Log user messages
              if (ev?.type === 'conversation.item.input_audio_transcription.completed') {
                  sendTranscriptEvent(callId, {
                    type: 'message',
                  role: 'user',
                    content: ev.transcript,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Handle function calls
              if (ev?.type === 'response.function_call_arguments.done') {
                const toolName = ev?.name;
                const functionCallId = ev?.call_id;
                const args = ev?.arguments;
                
                console.log('[openai-webhook] 🚨🚨🚨 FUNCTION CALL EVENT RECEIVED 🚨🚨🚨');
                console.log('[openai-webhook] 🚨 Event type:', ev?.type);
                console.log('[openai-webhook] 🚨 Tool name:', toolName);
                console.log('[openai-webhook] 🚨 Function call ID:', functionCallId);
                console.log('[openai-webhook] 🚨 Args:', args);
                console.log('[openai-webhook] Function call:', toolName, 'with args:', args);
                
                if (toolName === 'check_availability' || toolName === 's7260221_check_availability') {
                  console.log('[openai-webhook] 🚨 ABOUT TO CALL handleCheckAvailabilityTool');
                  console.log('[openai-webhook] 🚨 Tool name:', toolName);
                  console.log('[openai-webhook] 🚨 Function call ID:', functionCallId);
                  console.log('[openai-webhook] 🚨 Args:', args);
                  handleCheckAvailabilityTool(ws, functionCallId, args, callerPhone, callId);
                } else if (toolName === 'get_slovenian_time') {
                  try {
                    const now = getSlovenianDateTime();
                    const payload = {
                      now_iso: now.toISOString(),
                      date: now.toISOString().split('T')[0],
                      time: now.toTimeString().slice(0, 5),
                      timezone: 'Europe/Ljubljana',
                      locale: 'sl-SI',
                      formatted: now.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })
                    };
                    ws.send(JSON.stringify({
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: functionCallId,
                        output: JSON.stringify(payload)
                      }
                    }));
                    ws.send(JSON.stringify({ type: 'response.create' }));
                  } catch {}
                } else if (toolName === 's6792596_fancita_rezervation_supabase') {
                  handleReservationTool(ws, functionCallId, args, callerPhone, callId);
                } else if (toolName === 's6798488_fancita_order_supabase') {
                  handleOrderTool(ws, functionCallId, args, callerPhone, callId);
                } else if (toolName === 'transfer_to_staff') {
                  handleTransferTool(ws, functionCallId, args, callerPhone, callId);
                      } else {
                  console.warn('[openai-webhook] Unknown tool:', toolName);
                  
                  // Send error response for unknown tool
                  ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: functionCallId,
                      output: JSON.stringify({ error: `Unknown tool: ${toolName}` })
                    }
                  }));
                  
                  ws.send(JSON.stringify({
                    type: 'response.create'
                  }));
                }
              }
              
            } catch (parseError) {
              console.warn('[openai-webhook] Failed to parse ws message:', parseError);
            }
          });
          ws.on('error', (e) => {
            console.warn('[openai-webhook] ws error', e);
            endTranscriptSession(callId);
          });
          ws.on('close', (code, reason) => {
            console.log('[openai-webhook] ws closed', code, reason?.toString());
            endTranscriptSession(callId);
          });
        } catch (wsError) {
          console.warn('[openai-webhook] ws init failed', wsError);
          endTranscriptSession(callId);
        }
        } catch (error) {
          console.error('[openai-webhook] Session setup error:', error);
          endTranscriptSession(callId);
        }
      })();

      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Ignorej druge tipe eventov
    return new Response('Event ignored', { status: 200 });

  } catch (error) {
    console.error('[openai-webhook] General error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}