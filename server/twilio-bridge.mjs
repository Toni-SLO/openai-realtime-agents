import 'dotenv/config';
import { config } from 'dotenv';

// Load .env.local explicitly for development
config({ path: '../.env.local' });
import http from 'http';
import { WebSocketServer } from 'ws';
import { RealtimeSession } from '@openai/agents-realtime';

// NOTE: We load TS agent configs via tsx
import { unifiedRestoranAgent } from '../src/app/agentConfigs/restoran/unified.ts';

const PORT = parseInt(process.env.BRIDGE_PORT || '3001', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const OPENAI_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

// Log MCP configuration
console.log('[bridge] MCP_SERVER_URL:', process.env.MCP_SERVER_URL ? 'SET' : 'NOT SET');
if (process.env.MCP_SERVER_URL) {
  console.log('[bridge] Using native MCP integration');
} else {
  console.log('[bridge] Using fallback webhook mode');
}

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Per-stream state
const streamIdToState = new Map();

function mapEncodingToG711(encoding) {
  const enc = String(encoding || '').toLowerCase();
  // Handle common Twilio encodings: 'audio/x-mulaw', 'audio/x-alaw', 'audio/pcmu', 'audio/pcma'
  if (enc.includes('alaw') || enc.includes('pcma')) return 'g711_alaw';
  if (enc.includes('mulaw') || enc.includes('pcmu') || enc.includes('u-law') || enc.includes('ulaw')) return 'g711_ulaw';
  return 'g711_ulaw';
}

function arrayBufferFromBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Naivno downsamplanje 24k PCM16 -> 8k PCM16 z izbiro vsake 3. vzorčne točke
function downsamplePcm16_24k_to_8k(int16Array) {
  const step = 3;
  const outLength = Math.floor(int16Array.length / step);
  const out = new Int16Array(outLength);
  for (let i = 0, j = 0; j < outLength; i += step, j++) {
    out[j] = int16Array[i];
  }
  return out;
}

// Pretvori linear PCM16 v µ-law (8-bit)
function linearToMuLaw(sample) {
  const MAX = 32635;
  let s = sample;
  let sign = (s >> 8) & 0x80;
  if (sign !== 0) s = -s;
  if (s > MAX) s = MAX;
  s = s + 0x84;
  let exponent = 7;
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  const mantissa = (s >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f;
  const ulaw = ~(sign | (exponent << 4) | mantissa) & 0xff;
  return ulaw;
}

function encodePcm16ToMuLaw8kFromArrayBuffer(ab) {
  // Interpretiraj kot PCM16 LE @ 24kHz
  const int16 = new Int16Array(ab);
  // Downsample v 8kHz
  const int16_8k = downsamplePcm16_24k_to_8k(int16);
  // V µ-law
  const out = Buffer.allocUnsafe(int16_8k.length);
  for (let i = 0; i < int16_8k.length; i++) {
    out[i] = linearToMuLaw(int16_8k[i]);
  }
  return out;
}

wss.on('connection', (ws, req) => {
  console.log('[bridge][agents] client connected', req.url);

  ws.on('message', async (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }

    if (data.event === 'start') {
      const streamSid = data.start?.streamSid;
      if (!streamSid) return;
      const mediaFormat = data.start?.mediaFormat;
      console.log('[bridge][agents] twilio mediaFormat', mediaFormat);
      const g711Format = mapEncodingToG711(mediaFormat?.encoding);
      // Extract clean phone number from customParameters.from
      // This can contain SIP header info like: "38641734134" <sip:+38641734134@pstn.twilio.com>;tag=...
      let callerId = '';
      const rawFrom = data.start?.customParameters?.from || '';
      if (rawFrom) {
        // Try to extract clean phone number from SIP From header format
        const phoneMatch = rawFrom.match(/(?:^|["\s])(\+?\d{8,15})(?:["\s<>]|$)/);
        if (phoneMatch) {
          callerId = phoneMatch[1];
          // Ensure phone number starts with +
          if (!callerId.startsWith('+') && callerId.match(/^\d{8,15}$/)) {
            callerId = '+' + callerId;
          }
        } else {
          // Fallback: use original value but log warning
          console.warn(`[bridge][agents] ⚠️ Could not extract clean phone from customParameters.from: ${rawFrom}`);
          callerId = rawFrom;
        }
      }
      // zapomni si streamSid na socketu
      try { ws.__streamSid = streamSid; } catch {}

      try {
        const rootAgent = unifiedRestoranAgent;

        const session = new RealtimeSession(rootAgent, {
          transport: 'websocket',
          model: OPENAI_REALTIME_MODEL,
          context: {
            system__caller_id: callerId,
            system__conversation_id: streamSid,
          },
        });

        // Prevent unhandled 'error' crashes
        try { session.on?.('error', (e) => console.warn('[bridge][agents] session error', e)); } catch {}
        try { session.transport.on?.('error', (e) => console.warn('[bridge][agents] transport error', e)); } catch {}
        // Track agent speaking/turn state for barge-in
        try { session.transport.on?.('turn_started', () => {
          const st = streamIdToState.get(streamSid);
          if (st) { st.hasOngoingResponse = true; st.interruptedThisTurn = false; }
        }); } catch {}
        try { session.transport.on?.('turn_done', () => {
          const st = streamIdToState.get(streamSid);
          if (st) { st.hasOngoingResponse = false; st.interruptedThisTurn = false; }
        }); } catch {}
        try { session.transport.on?.('audio_done', () => {
          const st = streamIdToState.get(streamSid);
          if (st) { st.hasOngoingResponse = false; st.interruptedThisTurn = false; }
        }); } catch {}

        // Forward model audio to Twilio (20ms G.711 frames)
        session.transport.on('audio', (ev) => {
          try {
            const ab = ev.data;
            let buf = Buffer.from(ab);
            // Hevristika: če je output format PCMU (ulaw) in dolžina PCM16 (deljiva z 2), transkodiraj 24k PCM16 -> 8k PCMU
            if (g711Format === 'g711_ulaw' && (buf.length % 2 === 0)) {
              try {
                buf = encodePcm16ToMuLaw8kFromArrayBuffer(ab);
              } catch (e) {
                console.warn('[bridge][agents] ulaw transcode failed, sending raw buffer', e);
              }
            }
            const frameSize = 160; // 20ms @8kHz, 1 byte/sample
            for (let i = 0; i < buf.length; i += frameSize) {
              const chunk = buf.subarray(i, i + frameSize);
              const chunkB64 = chunk.toString('base64');
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  event: 'media',
                  streamSid,
                  media: { payload: chunkB64 },
                }));
              }
            }
          } catch (e) {
            console.error('[bridge][agents] send audio to Twilio failed', e);
          }
        });

        // Log delte prepisovanja govora (ASR), da potrdimo sprejem vašega govora
        try { session.transport.on?.('audio_transcript_delta', (ev) => {
          try { console.log('[bridge][agents] asr', ev.delta); } catch {}
        }); } catch {}

        await session.connect({ apiKey: OPENAI_API_KEY });

        // Nastavi sejo na realtime in konfiguriraj audio formate
        try {
          session.transport.sendEvent({
            type: 'session.update',
            session: {
              type: 'realtime',
              voice: OPENAI_VOICE,
              modalities: ['text', 'audio'],
              input_audio_format: g711Format,
              output_audio_format: g711Format,
              input_audio_transcription: { model: 'gpt-4o-mini-transcribe', language: 'hr' },
              turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 200 },
            },
          });
        } catch (e) {
          console.warn('[bridge][agents] session.update failed', e);
        }

        // Pozdrav greeterja (brez dodatnih navodil) – sproži prvo repliko
        try { session.transport.sendEvent({ type: 'response.create' }); } catch {}

        streamIdToState.set(streamSid, { ws, session, g711Format, canSend: false, frameCount: 0, hasOngoingResponse: false, interruptedThisTurn: false });
        // kratek zamik, da strežnik sprejme session.update (format g711_*)
        setTimeout(() => {
          const st = streamIdToState.get(streamSid);
          if (st) st.canSend = true;
        }, 300);
        console.log('[bridge][agents] session connected for', streamSid, g711Format);
      } catch (e) {
        console.error('[bridge][agents] failed to start session', e);
      }
    } else if (data.event === 'media') {
      // inbound audio from Twilio → send to Realtime session
      try {
        const streamSid = data.streamSid || ws.__streamSid;
        const st = streamIdToState.get(streamSid);
        if (!st?.session || !st?.canSend) return;
        // Barge-in: če agent govori, ga prekinemo ob začetku vhodnega zvoka (enkrat na turno)
        if (st.hasOngoingResponse && !st.interruptedThisTurn) {
          try { st.session.transport.interrupt(); st.interruptedThisTurn = true; } catch {}
        }
        const payload = data.media?.payload;
        if (!payload) return;
        const ab = arrayBufferFromBase64(payload);
        st.session.transport.sendAudio(ab);
        st.frameCount = (st.frameCount || 0) + 1;
        if (st.frameCount % 50 === 0) {
          console.log('[bridge][agents] inbound frames', st.frameCount, 'for', streamSid);
        }
      } catch (e) {
        console.error('[bridge][agents] forward inbound audio failed', e);
      }
    } else if (data.event === 'stop') {
      const streamSid = data.stop?.streamSid || data.streamSid;
      const st = streamIdToState.get(streamSid);
      try { st?.session?.close?.(); } catch {}
      streamIdToState.delete(streamSid);
      console.log('[bridge][agents] stop stream', streamSid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[bridge][agents] listening on ws://localhost:${PORT}`);
});


