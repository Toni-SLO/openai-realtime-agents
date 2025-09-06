require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');
const { FANCITA_UNIFIED_INSTRUCTIONS, replaceInstructionVariables } = require('./shared-instructions.cjs');

const PORT = parseInt(process.env.BRIDGE_PORT || '3001', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const OPENAI_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Twilio <-> Bridge clients map by streamSid
const streamIdToSocket = new Map();
const streamIdToState = new Map();

function connectOpenAIForStream(streamSid, g711Format) {
  if (!OPENAI_API_KEY) {
    console.error('[bridge] OPENAI_API_KEY manjkajoč – ni mogoče vzpostaviti Realtime povezave');
    return null;
  }
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`;
  const oa = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  oa.on('open', () => {
    // Nastavi zvočne formate na PCMU (G.711 µ-law), da se ujemajo s Twilio Media Streams
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: OPENAI_VOICE,
        input_audio_format: g711Format,
        output_audio_format: g711Format,
        turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 600 },
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe', language: 'hr' }, // TODO: Add dynamic language detection
      },
    };
    oa.send(JSON.stringify(sessionUpdate));
    // Use shared instructions from centralized file
    try {
      const sharedInstructions = FANCITA_UNIFIED_INSTRUCTIONS();
      const finalInstructions = replaceInstructionVariables(sharedInstructions, 'twilio-bridge', streamSid);
      
      oa.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions: finalInstructions,
          },
        })
      );
    } catch (error) {
      console.error('[bridge] Error loading shared instructions:', error);
    }
    const st = streamIdToState.get(streamSid);
    if (st) st.openaiReady = true;
    console.log('[bridge] OpenAI realtime connected for', streamSid);
  });

  oa.on('message', (raw) => {
    // OpenAI Realtime pošilja JSON dogodke; iščemo audio delta
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      // Ignoriraj neznan format
      return;
    }
    try {
      if (msg?.type === 'error') {
        console.log('[bridge] openai error detail', JSON.stringify(msg, null, 2));
      } else if (msg?.type) {
        console.log('[bridge] openai event', msg.type);
      }
    } catch {}
    const st = streamIdToState.get(streamSid);
    const twilioWs = st?.twilioWs;
    if (!twilioWs || twilioWs.readyState !== WebSocket.OPEN) return;

    const type = msg.type || '';
    if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
      // Podpri različne oblike delte
      let base64 = '';
      if (typeof msg.delta === 'string') base64 = msg.delta;
      else if (msg.delta && typeof msg.delta.audio === 'string') base64 = msg.delta.audio;
      else if (typeof msg.audio === 'string') base64 = msg.audio;

      if (base64) {
        try {
          const buf = Buffer.from(base64, 'base64');
          const frameSize = 160; // 20ms @ 8kHz, 1 byte/sample (G.711 µ-law/a-law)
          // debug: prvi kos velikosti
          if (!st._loggedFirstOutSize) {
            console.log('[bridge] out audio buf bytes', buf.length);
            st._loggedFirstOutSize = true;
          }
          for (let i = 0; i < buf.length; i += frameSize) {
            const chunk = buf.subarray(i, i + frameSize);
            const chunkB64 = chunk.toString('base64');
            twilioWs.send(
              JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: chunkB64 },
              })
            );
          }
        } catch (err) {
          console.error('[bridge] forward to Twilio failed', err);
        }
      }
    }
    // Lahko zabeležimo dokončanje odgovora
    if (type === 'response.completed') {
      // noop
    }
  });

  oa.on('close', () => {
    console.log('[bridge] OpenAI realtime closed for', streamSid);
  });
  oa.on('error', (err) => {
    console.error('[bridge] OpenAI realtime error for', streamSid, err.message || err);
  });

  return oa;
}

// Odstranjeno: reliance na server-side VAD iz Realtime API (turn_detection)

wss.on('connection', (ws, req) => {
  console.log('[bridge] client connected', req.url);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === 'start') {
        const streamSid = data.start?.streamSid;
        if (streamSid) {
          streamIdToSocket.set(streamSid, ws);
          // attach to socket for quick reference when echoing back
          ws.__streamSid = streamSid;
          console.log('[bridge] start stream', streamSid);
          // določi G.711 format glede na Twilio start.mediaFormat.encoding
          const encoding = (data.start?.mediaFormat?.encoding || '').toLowerCase();
          const g711Format = encoding.includes('alaw') ? 'g711_alaw' : 'g711_ulaw';
          // vzpostavi OpenAI realtime povezavo za ta stream
          const openaiWs = connectOpenAIForStream(streamSid, g711Format);
          streamIdToState.set(streamSid, {
            twilioWs: ws,
            openaiWs,
            openaiReady: false,
            commitTimer: null,
            mediaCount: 0,
            g711Format,
          });
        }
      } else if (data.event === 'media') {
        // 1) Pošlji v OpenAI input audio buffer (PCMU base64)
        try {
          const streamSid = ws.__streamSid || data.streamSid;
          const st = streamIdToState.get(streamSid);
          if (streamSid && st?.openaiWs && st.openaiWs.readyState === WebSocket.OPEN) {
            const payload = data.media?.payload || '';
            if (payload) {
              st.openaiWs.send(
                JSON.stringify({ type: 'input_audio_buffer.append', audio: payload })
              );
              st.mediaCount += 1;
              if (st.mediaCount % 50 === 0) {
                console.log('[bridge] media frames', st.mediaCount, 'for', streamSid);
              }
              // brez ročnega commita – zanašamo se na server VAD
            }
          }
        } catch (err) {
          console.error('[bridge] forward to OpenAI failed', err);
        }
      } else if (data.event === 'stop') {
        const streamSid = data.stop?.streamSid || data.streamSid;
        if (streamSid) {
          streamIdToSocket.delete(streamSid);
          const st = streamIdToState.get(streamSid);
          if (st?.commitTimer) clearTimeout(st.commitTimer);
          if (st?.openaiWs && st.openaiWs.readyState === WebSocket.OPEN) {
            try { st.openaiWs.close(); } catch {}
          }
          streamIdToState.delete(streamSid);
        }
        console.log('[bridge] stop stream', streamSid, 'details:', data.stop || {});
      }
    } catch (err) {
      console.error('[bridge] invalid message', err);
    }
  });

  ws.on('close', () => {
    for (const [sid, sock] of streamIdToSocket.entries()) {
      if (sock === ws) streamIdToSocket.delete(sid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[bridge] listening on ws://localhost:${PORT}`);
});


