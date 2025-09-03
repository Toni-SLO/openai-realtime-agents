// OpenAI Realtime SIP webhook handler - AUTO CODEC VERSION (brez prisilnega codec-a)
// NOTE: Ta verzija ne forsira codec parametrov, ampak prepusti SDP pogajanju

// Deduplicate accepts per call_id within this process
const acceptedCallIds = new Set<string>();

export async function POST(req: Request): Promise<Response> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
    const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
    const VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
    const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || '';

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
      console.log('[openai-webhook-auto] incoming call event', JSON.stringify(event, null, 2));
      
      const callId = event?.data?.call_id as string | undefined;
      if (!callId) return new Response('Missing call_id', { status: 400 });

      if (acceptedCallIds.has(callId)) {
        // Already accepted; acknowledge quickly
        return new Response('OK', { status: 200 });
      }

      const acceptUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`;
      // AUTO VERSION: Brez eksplicitnih audio format parametrov
      const acceptPayload = {
        type: 'realtime',
        model: MODEL,
        instructions: 'Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći? Govori kratko, počakaj uporabnika in ne govori čez njega. Če želi rezervacijo, vodi jo; če naročilo, prevzemi naročilo.',
        voice: VOICE,
        modalities: ['text', 'audio'],
        audio: { output: { voice: VOICE } }, // Samo voice, brez format/sample_rate
        turn_detection: { type: 'semantic_vad' },
      } as const;

      console.log('[openai-webhook-auto] accept payload for', callId, JSON.stringify(acceptPayload, null, 2));

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
        console.error('[openai-webhook-auto] accept failed', resAccept.status, txt);
        return new Response('Accept failed', { status: 500 });
      }
      console.log('[openai-webhook-auto] accept ok for', callId);

      acceptedCallIds.add(callId);

      // Po sprejemu klica asinhrono odpremo WS na events kanal in sprožimo uvodni odziv
      ;(async () => {
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
            console.log('[openai-webhook-auto] ws open for', callId);
            try {
              ws.send(
                JSON.stringify({
                  type: 'response.create',
                })
              );
              console.log('[openai-webhook-auto] response.create sent');
            } catch (e) {
              console.warn('[openai-webhook-auto] response.create failed', e);
            }
          });
          ws.on('message', (m) => {
            try {
              const ev = JSON.parse(m.toString());
              // Prepreči poplavo logov
              if (ev?.type === 'response.audio.delta') return;
              console.log('[openai-webhook-auto] ws event', ev?.type || 'unknown');
            } catch {}
          });
          ws.on('error', (e) => console.warn('[openai-webhook-auto] ws error', e));
          // Pustimo odprto; strežnik lahko sam zaključi sejo po koncu klica
        } catch (err) {
          console.warn('[openai-webhook-auto] ws init failed', err);
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
    console.error('[openai-webhook-auto] error', e);
    return new Response('Server error', { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return new Response('OK');
}
