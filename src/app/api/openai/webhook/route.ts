// OpenAI Realtime SIP webhook handler
// NOTE: Za začetek ne izvajamo verifikacije podpisa; fokus je na delujočem sprejemu klica.

// Import shared instructions
import { FANCITA_UNIFIED_INSTRUCTIONS, replaceInstructionVariables } from '../../../agentConfigs/shared/instructions';

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
import WebSocket from 'isomorphic-ws';

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
    
    transcriptBridgeWs.on('error', (error) => {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.warn('[transcript] Error ending session:', error.message);
  }
}

// Initialize transcript bridge connection - DISABLED due to WebSocket issues
// connectTranscriptBridge();

// Emergency fallback - return proper TwiML for direct audio
function returnDirectAudioResponse(voice = 'marin') {
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
async function handleReservationTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing reservation tool with args:', args);
    const params = JSON.parse(args);
    
    // Extract clean phone number from caller header and ensure it has +
    let cleanPhone = callerPhone.match(/(\+?\d{8,15})/)?.[1] || callerPhone;
    if (cleanPhone && !cleanPhone.startsWith('+') && cleanPhone.match(/^\d{8,15}$/)) {
      cleanPhone = '+' + cleanPhone;
    }
    
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
          date: params.date,
          time: params.time,
          guests_number: params.guests_number,
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
    
    // Log the tool call
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 's6792596_fancita_rezervation_supabase',
      arguments: args,
      call_id: functionCallId,
      result: result,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 's6792596_fancita_rezervation_supabase',
        callId: functionCallId,
        argumentCount: Object.keys(params).length,
        argumentKeys: Object.keys(params),
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
    
    // Extract clean phone number
    let cleanPhone = callerPhone.match(/(\+?\d{8,15})/)?.[1] || callerPhone;
    if (cleanPhone && !cleanPhone.startsWith('+') && cleanPhone.match(/^\d{8,15}$/)) {
      cleanPhone = '+' + cleanPhone;
    }
    
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
    
    // Log the tool call
    sendTranscriptEvent(callId, {
      type: 'tool_call',
      tool_name: 's6798488_fancita_order_supabase',
      arguments: args,
      call_id: functionCallId,
      result: result,
      timestamp: new Date().toISOString(),
      metadata: { 
        toolName: 's6798488_fancita_order_supabase',
        callId: functionCallId,
        argumentCount: Object.keys(params).length,
        argumentKeys: Object.keys(params),
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
    
    // Extract clean phone number
    let cleanPhone = callerPhone.match(/(\+?\d{8,15})/)?.[1] || callerPhone;
    if (cleanPhone && !cleanPhone.startsWith('+') && cleanPhone.match(/^\d{8,15}$/)) {
      cleanPhone = '+' + cleanPhone;
    }
    
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
      const callerPhone = callerFrom; // Store for use in tool handler
      const acceptInstructions = replaceInstructionVariables(FANCITA_UNIFIED_INSTRUCTIONS, callerFrom, callId);

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
                
                console.log('[openai-webhook] Function call:', toolName, 'with args:', args);
                
                if (toolName === 's6792596_fancita_rezervation_supabase') {
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