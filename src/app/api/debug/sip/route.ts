// Debug endpoint za preverjanje SIP konfiguracije
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest): Promise<Response> {
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
  const voice = process.env.OPENAI_REALTIME_VOICE || 'marin';

  const config = {
    timestamp: new Date().toISOString(),
    environment: {
      OPENAI_PROJECT_ID: projectId ? '*** CONFIGURED ***' : 'MISSING',
      OPENAI_API_KEY: apiKey ? '*** CONFIGURED ***' : 'MISSING',
      OPENAI_REALTIME_MODEL: model,
      OPENAI_REALTIME_VOICE: voice,
    },
    sip: {
      target: projectId ? `sip:${projectId}@sip.api.openai.com;transport=tls` : 'NOT_CONFIGURED',
      codecPolicy: 'PCMU,PCMA (restrictive)',
      security: 'TLS + SRTP (secure=true)',
      transport: 'TLS (encrypted signaling)',
      media: 'SRTP (encrypted media)',
    },
    audio: {
      inputFormat: 'g711_ulaw',
      outputFormat: 'g711_ulaw',
      sampleRate: 8000,
    },
    endpoints: {
      webhook: `${req.nextUrl.origin}/api/openai/webhook`,
      twiml: `${req.nextUrl.origin}/api/twiml/openai`,
    },
  };

  return new Response(JSON.stringify(config, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
