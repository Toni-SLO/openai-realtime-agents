// TwiML endpoint: preusmeri klic na OpenAI SIP preko Twilio SIP Domain

function buildTwiML(projectId: string): string {
  const useAgentsSDK = process.env.USE_AGENTS_SDK === 'true';
  const forceAgentsSDK = false; // Keep native SIP Realtime
  
  if (useAgentsSDK || forceAgentsSDK) {
    // Option A: Use Agents SDK bridge (Media Streams + WebSocket)
    const bridgeUrl = process.env.TWILIO_BRIDGE_URL || 'ws://localhost:3001';
    
    console.log('[twiml-openai] Routing to Agents SDK bridge due to SIP WebSocket issues');
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${bridgeUrl}" />
  </Connect>
</Response>`;
  } else {
    // Option B: Direct OpenAI SIP (current approach)
    const sipTarget = `sip:${projectId}@sip.api.openai.com;transport=tls`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial codecPolicy="restrictive" secure="true">
    <Sip codecPolicy="PCMU,PCMA" secure="true">${sipTarget}</Sip>
  </Dial>
</Response>`;
  }
}

export async function POST(req: Request): Promise<Response> {
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  if (!projectId) {
    return new Response('Missing OPENAI_PROJECT_ID', { status: 500 });
  }
  
  // Log Twilio request body for debugging SIP parameters
  try {
    const body = await req.text();
    console.log('[twiml-openai] Twilio request:', body);
  } catch (e) {
    console.warn('[twiml-openai] Failed to log request body:', e);
  }
  
  const twiml = buildTwiML(projectId);
  console.log('[twiml-openai] Generated TwiML:', twiml);
  
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

export async function GET(): Promise<Response> {
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  if (!projectId) {
    return new Response('Missing OPENAI_PROJECT_ID', { status: 500 });
  }
  return new Response(buildTwiML(projectId), {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}


