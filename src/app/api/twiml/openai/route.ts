// TwiML endpoint: preusmeri klic na OpenAI SIP preko Twilio SIP Domain

function buildTwiML(projectId: string): string {
  const sipTarget = `sip:${projectId}@sip.api.openai.com;transport=tls`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial codecPolicy="restrictive" secure="true">
    <Sip codecPolicy="PCMU,PCMA" secure="true">${sipTarget}</Sip>
  </Dial>
</Response>`;
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


