// OpenAI Realtime SIP webhook handler
// NOTE: Za začetek ne izvajamo verifikacije podpisa; fokus je na delujočem sprejemu klica.

// Deduplicate accepts per call_id within this process
const acceptedCallIds = new Set<string>();

// Inline centralized instructions to avoid import issues in API routes
const FANCITA_RESERVATION_INSTRUCTIONS = `
# Fančita Reservation Agent

## 0) Sistem & konstante
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
1. guests_number – "Za koliko osoba?"
2. date – "Za koji datum?"
3. time – "U koje vrijeme?"
4. name – vedno vprašaj: "Na koje ime?"
5. notes – "Imate li posebnih želja (alergije, lokacija, rođendan)?"

**Potrditev (enkrat):**
"Razumem: [date], [time], [guests_number] osoba, ime [name], lokacija [location]. Je li točno?"

- Če potrdi → **TAKOJ kliči tool s6792596_fancita_rezervation_supabase**
- Po uspehu: "Rezervacija je zavedena. Vidimo se u Fančiti."

## 5) Validacije
- location ∈ {vrt, terasa, unutra} (male črke)
- guests_number ≥ 1
- date v formatu YYYY-MM-DD
- time v formatu HH:MM (24h)
- name ni prazno

## 6) KLJUČNO: MCP Orkestracija
- **Po potrditvi podatkov** vedno **takoj** pokliči MCP tool s6792596_fancita_rezervation_supabase
- **Nikoli** ne izreci "Rezervacija je zavedena" pred uspešnim rezultatom tool-a
- Če tool vrne napako → "Oprostite, imam tehničku poteškuću. Pokušavam još jednom."

## 7) Časovne pretvorbe
- "danas" → današnji datum
- "sutra" / "jutri" → današnji datum + 1
- "šest ujutro" → 06:00
- "šest popodne" / "šest zvečer" → 18:00

## 8) Tok: ORDER
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

## 9) Tok: HANDOFF
**VEDNO ko gost želi govoriti z osebjem:**
1. **POVZEMI PROBLEM** - "Razumem da imate problem z [kratko opiši]"
2. **POKLIČI OSEBJE** - Uporabi tool transfer_to_staff  
3. **SPOROČI OSEBJU** - "Zdravo, imam gosta na liniji z naslednjim problemom: [povzemi]. Lahko ga povežem?"
4. **POVEŽI GOSTA** - "Povezujem vas z našim osebjem. Trenutak prosim."
`;

const FANCITA_RESERVATION_TOOL = {
  type: 'function' as const,
  name: 's6792596_fancita_rezervation_supabase',
  description: 'Create a table reservation for restaurant Fančita',
  parameters: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      name: { type: 'string' as const, description: 'Guest name for the reservation' },
      date: { type: 'string' as const, description: 'Reservation date in YYYY-MM-DD format' },
      time: { type: 'string' as const, description: 'Reservation time in HH:MM format (24h)' },
      guests_number: { type: 'number' as const, description: 'Number of guests' },
      location: { 
        type: 'string' as const, 
        description: 'Reservation location: vrt, terasa, or unutra', 
        enum: ['vrt', 'terasa', 'unutra'] as const
      },
      notes: { type: 'string' as const, description: 'Special requests or notes' },
    },
    required: ['name', 'date', 'time', 'guests_number'],
  },
};

const FANCITA_ORDER_TOOL = {
  type: 'function' as const,
  name: 's6798488_fancita_order_supabase',
  description: 'Create a food/beverage order for restaurant Fančita',
  parameters: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      name: { type: 'string' as const, description: 'Customer name for the order' },
      date: { type: 'string' as const, description: 'Delivery/pickup date in YYYY-MM-DD format' },
      delivery_time: { type: 'string' as const, description: 'Delivery/pickup time in HH:MM format (24h)' },
      delivery_type: { type: 'string' as const, description: 'Type of delivery: delivery or pickup', enum: ['delivery', 'pickup'] as const },
      delivery_address: { type: 'string' as const, description: 'Delivery address (use "-" for pickup)' },
      items: {
        type: 'array' as const,
        description: 'List of ordered items',
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const, description: 'Item name' },
            qty: { type: 'number' as const, description: 'Quantity' },
            price: { type: 'number' as const, description: 'Price per item' },
            notes: { type: 'string' as const, description: 'Special notes for the item' },
          },
          required: ['name', 'qty'],
        },
      },
      total: { type: 'number' as const, description: 'Total order amount' },
      notes: { type: 'string' as const, description: 'Order notes' },
    },
    required: ['name', 'date', 'delivery_time', 'delivery_type', 'delivery_address', 'items', 'total'],
  },
};

const FANCITA_HANDOFF_TOOL = {
  type: 'function' as const,
  name: 'transfer_to_staff',
  description: 'Transfer the call to restaurant staff with problem summary',
  parameters: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      guest_number: { type: 'string' as const, description: 'Guest phone number to transfer from' },
      problem_summary: { type: 'string' as const, description: 'Brief summary of the guest problem/request' },
      staff_number: { type: 'string' as const, description: 'Staff phone number to transfer to', default: '+38640341045' },
    },
    required: ['guest_number', 'problem_summary'],
  },
};

// Helper function to replace template variables in instructions
function replaceInstructionVariables(
  instructions: string, 
  callerId: string, 
  conversationId: string
): string {
  return instructions
    .replace(/\{\{system__caller_id\}\}/g, callerId)
    .replace(/\{\{system__conversation_id\}\}/g, conversationId);
}

// Handle MCP tool execution for reservation  
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
    
    // Auto-hangup logic - set flag regardless of MCP success for SIP calls
    // For SIP calls, we always want to hangup after final message
    global.pendingHangup = { callId, ws };
    console.log('[openai-webhook] Will hangup after TTS completes for callId:', callId);
    console.log('[openai-webhook] Set global.pendingHangup (regardless of MCP success):', global.pendingHangup);
    
    if (result.success) {
      console.log('[openai-webhook] MCP call successful');
    } else {
      console.log('[openai-webhook] MCP call failed, but hangup still scheduled:', result);
    }

  } catch (error) {
    console.error('[openai-webhook] Tool execution failed:', error);
    // Send error response
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })
      }
    }));
    
    // Generate response after error
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

// Handle MCP tool execution for orders
async function handleOrderTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing order tool with args:', args);
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
            text: 'Trenutak, zapisujem narudžbu...'
          }
        ]
      }
    }));
    ws.send(JSON.stringify({ type: 'response.create' }));
    console.log('[openai-webhook] Processing message sent');

    // Menu prices for automatic lookup
    const MENU_ITEMS = {
      'Pizza Nives': 12.00,
      'pica Nives': 12.00,
      'Pizza Margherita': 10.00,
      'pica Margherita': 10.00,
      'Pizza Capriciosa': 11.00,
      'pica Capriciosa': 11.00,
      // Add more items as needed
    };

    // Add prices to items if missing
    const processedItems = params.items.map((item: any) => ({
      ...item,
      price: item.price || MENU_ITEMS[item.name] || 0
    }));

    // Call MCP API for order
    const mcpData = {
      action: 's6798488_fancita_order_supabase',
      data: {
        ...params,
        items: processedItems,
        tel: cleanPhone,
        source_id: callId
      }
    };
    
    console.log('[openai-webhook] Calling MCP with data:', JSON.stringify(mcpData, null, 2));
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpData)
    });

    console.log('[openai-webhook] MCP response status:', response.status);
    const result = await response.json();
    console.log('[openai-webhook] MCP result:', JSON.stringify(result, null, 2));

    // Send result to OpenAI
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(result)
      }
    }));
    
    // Always generate response after function call
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Auto-hangup logic - set flag regardless of MCP success for SIP calls
    // For SIP calls, we always want to hangup after final message
    global.pendingHangup = { callId, ws };
    console.log('[openai-webhook] Will hangup after TTS completes for callId:', callId);
    console.log('[openai-webhook] Set global.pendingHangup (regardless of MCP success):', global.pendingHangup);
    
    if (result.success) {
      console.log('[openai-webhook] MCP call successful');
    } else {
      console.log('[openai-webhook] MCP call failed, but hangup still scheduled:', result);
    }

  } catch (error) {
    console.error('[openai-webhook] Order tool execution failed:', error);
    // Send error response
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })
      }
    }));
    
    // Always generate response after function call
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

// Handle handoff tool execution
async function handleHandoffTool(ws: any, functionCallId: string, args: string, callerPhone: string, callId: string) {
  try {
    console.log('[openai-webhook] Executing handoff tool with args:', args);
    const params = JSON.parse(args);
    
    // Extract clean phone number from caller header and ensure it has +
    let cleanPhone = callerPhone.match(/(\+?\d{8,15})/)?.[1] || callerPhone;
    if (cleanPhone && !cleanPhone.startsWith('+') && cleanPhone.match(/^\d{8,15}$/)) {
      cleanPhone = '+' + cleanPhone;
    }
    
    // Send "processing" message before calling transfer
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Trenutak, povezujem vas z osebjem...'
          }
        ]
      }
    }));
    ws.send(JSON.stringify({ type: 'response.create' }));
    console.log('[openai-webhook] Transfer message sent');

    // Call transfer API
    const staffNumber = params.staff_number || '+38640341045';
    const problemSummary = params.problem_summary || 'Guest transfer request';
    
    console.log(`Transferring call from ${cleanPhone} to ${staffNumber}`);
    console.log(`Problem summary: ${problemSummary}`);

    // Simulate transfer (implement actual transfer logic as needed)
    const transferResult = {
      success: true,
      data: { 
        staff_number: staffNumber, 
        guest_number: cleanPhone,
        problem_summary: problemSummary
      },
      message: `Staff notified about: ${problemSummary}. Transferring guest now.`,
    };

    // Send result to OpenAI
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify(transferResult)
      }
    }));
    
    // Always generate response after function call
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
    
    // Auto-hangup after handoff completion
    global.pendingHangup = { callId, ws };
    console.log('[openai-webhook] Will hangup after handoff TTS completes for callId:', callId);

  } catch (error) {
    console.error('[openai-webhook] Handoff tool execution failed:', error);
    // Send error response
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })
      }
    }));
    
    // Always generate response after function call
    ws.send(JSON.stringify({
      type: 'response.create'
    }));
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
    const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
    const VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
    const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || '';
    const SIP_CODEC = process.env.SIP_CODEC || 'g711_ulaw';
    // Ne forsiramo več kodeka – prepustimo SIP pogajanju (Twilio ↔ OpenAI)

    if (!OPENAI_API_KEY) {
      return new Response('Missing OPENAI_API_KEY', { status: 500 });
    }

    // OpenAI webhook pošlje JSON event
    const bodyText = await req.text();
    let event: any;
    try {
      event = JSON.parse(bodyText);
    } catch {
      // Nekateri reverse proxy-ji že parsajo v JSON; fallback
      try { event = (await req.json()) as any; } catch {}
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
      const acceptInstructions = replaceInstructionVariables(FANCITA_RESERVATION_INSTRUCTIONS, callerFrom, callId);

      const acceptPayload = {
        type: 'realtime',
        model: MODEL,
        instructions: acceptInstructions,
        voice: VOICE,
        modalities: ['text', 'audio'],
        audio: { 
          input: { format: SIP_CODEC, sample_rate: 8000 },
          output: { voice: VOICE, format: SIP_CODEC, sample_rate: 8000 }
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

      // Po sprejemu klica asinhrono odpremo WS na events kanal in sprožimo uvodni odziv,
      // z izklopljenimi nativnimi ekstenzijami za `ws` (JS fallback), da se izognemo napaki bufferUtil.
              ;(async () => {
          // Kratka zakasnitev za stabilnost
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('[openai-webhook] Starting conversation immediately');
          
          // Zaženi MCP inicializacijo v ozadju (asinkrono)
          (async () => {
            console.log('[openai-webhook] Starting MCP initialization in background...');
            try {
              let attempts = 0;
              const maxAttempts = 20; // 10 sekund (500ms * 20)
              
              while (attempts < maxAttempts) {
                try {
                  const mcpResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/mcp?action=status`);
                  if (mcpResponse.ok) {
                    const mcpData = await mcpResponse.json();
                    if (mcpData.ready) {
                      console.log('[openai-webhook] MCP ready in background');
                      break;
                    }
                  }
                } catch (e) {
                  // Ignoriraj napake pri preverjanju
                }
                
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              
              if (attempts >= maxAttempts) {
                console.log('[openai-webhook] MCP not ready after 10s, using fallback');
              }
            } catch (e) {
              console.log('[openai-webhook] MCP background init error:', e);
            }
          })();
          
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
            try {
              // Extract caller info for template replacement
              const callerFrom = event?.data?.sip_headers?.find((h: any) => h.name === 'From')?.value || 'unknown';
              
              // Replace template variables in instructions
              const instructions = replaceInstructionVariables(FANCITA_RESERVATION_INSTRUCTIONS, callerFrom, callId);
              
              const tools = [FANCITA_RESERVATION_TOOL, FANCITA_ORDER_TOOL, FANCITA_HANDOFF_TOOL];

              ws.send(
                JSON.stringify({
                  type: 'session.update',
                  session: {
                    input_audio_format: SIP_CODEC,
                    output_audio_format: SIP_CODEC,
                    voice: VOICE,
                    instructions: instructions,
                    turn_detection: { type: 'semantic_vad' },
                    tools: tools,
                    tool_choice: 'auto',
                    temperature: 0.8,
                  }
                })
              );
              console.log('[openai-webhook] session.update sent');
              
              // Dodaj simuliran user input da sproži pozdrav
              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: '*klic se vzpostavlja*' }]
                  }
                }));
                
                // Nato sproži response
                ws.send(
                  JSON.stringify({
                    type: 'response.create',
                  })
                );
                console.log('[openai-webhook] user input and response.create sent');
              }, 100);
            } catch (e) {
              console.warn('[openai-webhook] session setup failed', e);
            }
          });
          ws.on('message', (m) => {
            try {
              const ev = JSON.parse(m.toString());
              // Prepreči poplavo logov za audio delta
              if (ev?.type === 'response.audio.delta') return;
              
              // Logiraj pomembne evente z detajli
              if (ev?.type === 'error') {
                console.error('[openai-webhook] WS ERROR:', JSON.stringify(ev, null, 2));
              } else if (ev?.type === 'session.created' || ev?.type === 'session.updated') {
                console.log('[openai-webhook] SESSION EVENT:', ev?.type);
                if (ev?.session?.input_audio_format) {
                  console.log('[openai-webhook] Negotiated input format:', ev.session.input_audio_format);
                }
                if (ev?.session?.output_audio_format) {
                  console.log('[openai-webhook] Negotiated output format:', ev.session.output_audio_format);
                }
                console.log('[openai-webhook] Full session:', JSON.stringify(ev, null, 2));
              } else if (ev?.type === 'conversation.item.input_audio_transcription.completed') {
                console.log('[openai-webhook] ASR Completed:', ev?.transcript || 'no transcript');
              } else if (ev?.type === 'response.audio_transcript.done') {
                console.log('[openai-webhook] TTS Completed:', ev?.transcript || 'no transcript');
                
                // Check if we should hangup after this TTS completion
                console.log('[openai-webhook] Checking for pending hangup. Global state:', global.pendingHangup);
                if (global.pendingHangup && global.pendingHangup.callId === callId) {
                  console.log('[openai-webhook] TTS completed, scheduling hangup...');
                  setTimeout(async () => {
                    console.log('[openai-webhook] Grace period completed, hanging up now');
                    try {
                      const hangupUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`;
                      console.log('[openai-webhook] Calling hangup URL:', hangupUrl);
                      const hangupResponse = await fetch(hangupUrl, {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                          'Content-Type': 'application/json',
                          'OpenAI-Beta': 'realtime=v1',
                        },
                      });
                      
                      if (hangupResponse.ok) {
                        console.log('[openai-webhook] Call hung up successfully');
                      } else {
                        const errorText = await hangupResponse.text();
                        console.log('[openai-webhook] Hangup failed:', hangupResponse.status, errorText);
                      }
                      
                      ws.close(1000, 'Reservation completed');
                      global.pendingHangup = null;
                    } catch (e) {
                      console.log('[openai-webhook] Hangup error:', e);
                      try {
                        ws.close(1000, 'Reservation completed');
                      } catch (e2) {
                        console.log('[openai-webhook] WebSocket already closed');
                      }
                      global.pendingHangup = null;
                    }
                  }, 3000); // 3 second grace period for complete speech
                } else {
                  console.log('[openai-webhook] No pending hangup for this call');
                }
              } else if (ev?.type === 'response.function_call_arguments.done') {
                console.log('[openai-webhook] Function call:', ev?.name, ev?.arguments);
                console.log('[openai-webhook] Full function call event:', JSON.stringify(ev, null, 2));
                // Handle MCP tool execution for SIP calls
                if (ev?.name === 's6792596_fancita_rezervation_supabase') {
                  console.log('[openai-webhook] Calling handleReservationTool...');
                  handleReservationTool(ws, ev?.call_id, ev?.arguments, callerPhone, callId);
                } else if (ev?.name === 's6798488_fancita_order_supabase') {
                  console.log('[openai-webhook] Calling handleOrderTool...');
                  handleOrderTool(ws, ev?.call_id, ev?.arguments, callerPhone, callId);
                } else if (ev?.name === 'transfer_to_staff') {
                  console.log('[openai-webhook] Calling handleHandoffTool...');
                  handleHandoffTool(ws, ev?.call_id, ev?.arguments, callerPhone, callId);
                } else {
                  console.log('[openai-webhook] Function call name does not match any known tool');
                }
              } else if (ev?.type?.includes('function') || ev?.type?.includes('tool')) {
                console.log('[openai-webhook] Tool/Function event:', ev?.type, JSON.stringify(ev, null, 2));
              } else {
                console.log('[openai-webhook] ws event', ev?.type || 'unknown');
              }
            } catch {}
          });
          ws.on('error', (e) => console.warn('[openai-webhook] ws error', e));
          // Pustimo odprto; strežnik lahko sam zaključi sejo po koncu klica
        } catch (err) {
          console.warn('[openai-webhook] ws init failed', err);
        }
      })();

      return new Response('OK', {
        status: 200,
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });
    }

    // Za ostale evente zgolj 200
    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('[openai-webhook] error', e);
    return new Response('Server error', { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return new Response('OK');
}


