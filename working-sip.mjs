import express from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env' });

const app = express();
const PORT = 3046;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;

console.log('🎯 WORKING SIP SERVER');
console.log('🔑 API Key:', OPENAI_API_KEY ? 'SET' : 'MISSING');
console.log('🏗️  Project ID:', OPENAI_PROJECT_ID);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenAI SIP webhook - WORKING VERSION
app.post('/webhook', async (req, res) => {
  try {
    console.log('📞 SIP webhook:', JSON.stringify(req.body, null, 2));
    
    const event = req.body;
    
    if (event.type === 'realtime.call.incoming') {
      const callId = event.data?.call_id;
      const sipHeaders = event.data?.sip_headers || [];
      const fromHeader = sipHeaders.find(h => h.name === 'From');
      
      if (!callId) {
        console.log('❌ No call_id');
        return res.status(400).json({ error: 'Missing call_id' });
      }
      
      // Filter test webhooks - look for specific patterns
      const isTestCall = !fromHeader || 
                        fromHeader.value.includes('test') ||
                        !sipHeaders.find(h => h.name === 'X-Twilio-CallSid');
      
      if (isTestCall) {
        console.log('🧪 Test webhook - ignoring');
        return res.status(200).json({ status: 'test ignored' });
      }
      
      console.log(`📞 REAL call: ${callId} from ${fromHeader.value}`);
      
      // Try different accept endpoint format
      const acceptUrl = `https://api.openai.com/v1/realtime/session/${callId}/accept`;
      console.log('🔗 Accept URL:', acceptUrl);
      
      const acceptPayload = {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: 'Ti si Maja iz restavracije Fančita. Pozdravi stranko v hrvaščini: "Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?" Odgovarjaj kratko in prijazno.',
        voice: 'marin',
        modalities: ['text', 'audio'],
        audio: {
          input: { format: 'g711_ulaw', sample_rate: 8000 },
          output: { format: 'g711_ulaw', sample_rate: 8000 }
        },
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'hr'
        },
        turn_detection: { type: 'semantic_vad' }
      };
      
      const headers = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      };
      
      if (OPENAI_PROJECT_ID) {
        headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
      }
      
      console.log('🔄 Calling OpenAI Accept API...');
      
      const response = await fetch(acceptUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(acceptPayload)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Accept successful:', result);
        res.status(200).json({ status: 'accepted', result });
      } else {
        const error = await response.json();
        console.log('❌ Accept failed:', response.status, error);
        
        // Try alternative endpoint
        const altUrl = `https://api.openai.com/v1/realtime/calls/${callId}/accept`;
        console.log('🔄 Trying alternative:', altUrl);
        
        const altResponse = await fetch(altUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(acceptPayload)
        });
        
        if (altResponse.ok) {
          const altResult = await altResponse.json();
          console.log('✅ Alternative successful:', altResult);
          res.status(200).json({ status: 'accepted_alt', result: altResult });
        } else {
          const altError = await altResponse.json();
          console.log('❌ Alternative failed:', altResponse.status, altError);
          res.status(500).json({ error: 'Both endpoints failed' });
        }
      }
      
      return;
    }
    
    // Other event types
    console.log('📧 Other event:', event.type, JSON.stringify(event, null, 2));
    res.status(200).json({ status: 'received' });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Catch all
app.use((req, res) => {
  console.log(`🔍 Request: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Working SIP server on port ${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
});
