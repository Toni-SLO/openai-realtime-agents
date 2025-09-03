// Enhanced TwiML endpoint z debug informacijami za OpenAI SIP

function buildTwiML(projectId: string): string {
  const sipTarget = `sip:${projectId}@sip.api.openai.com;transport=tls`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial 
    codecPolicy="restrictive" 
    secure="true" 
    timeLimit="600"
    timeout="30">
    <Sip 
      codecPolicy="PCMU" 
      secure="true"
      mediaEncryption="srtp">${sipTarget}</Sip>
  </Dial>
</Response>`;
}

export async function POST(req: Request): Promise<Response> {
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  if (!projectId) {
    return new Response('Missing OPENAI_PROJECT_ID', { status: 500 });
  }
  
  // Enhanced debug logiranje
  try {
    const formData = await req.formData();
    const body: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      body[key] = value.toString();
    }
    console.log('[twiml-openai-debug] Twilio request body:', JSON.stringify(body, null, 2));
    
    // Log pomembne Twilio parametre
    console.log('[twiml-openai-debug] CallSid:', body.CallSid);
    console.log('[twiml-openai-debug] From:', body.From);
    console.log('[twiml-openai-debug] To:', body.To);
    console.log('[twiml-openai-debug] CallStatus:', body.CallStatus);
  } catch (e) {
    console.warn('[twiml-openai-debug] Failed to parse request body:', e);
  }
  
  const twiml = buildTwiML(projectId);
  console.log('[twiml-openai-debug] Generated TwiML:', twiml);
  
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

export async function GET(req: Request): Promise<Response> {
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  if (!projectId) {
    return new Response('Missing OPENAI_PROJECT_ID', { status: 500 });
  }
  
  const twiml = buildTwiML(projectId);
  console.log('[twiml-openai-debug] GET request - TwiML:', twiml);
  
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}
