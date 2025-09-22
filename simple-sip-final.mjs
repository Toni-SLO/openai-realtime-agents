import express from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.PORT || 3045;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;

console.log('🧪 FINAL SIP TEST SERVER');
console.log('🔑 API Key:', OPENAI_API_KEY ? 'SET' : 'MISSING');
console.log('🏗️  Project ID:', OPENAI_PROJECT_ID);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenAI SIP webhook - FINAL VERSION
app.post('/webhook', async (req, res) => {
  try {
    console.log('📞 OpenAI SIP webhook:', JSON.stringify(req.body, null, 2));
    
    const event = req.body;
    
    if (event.type === 'realtime.call.incoming') {
      const callId = event.data?.call_id;
      const sipHeaders = event.data?.sip_headers || [];
      const fromHeader = sipHeaders.find(h => h.name === 'From');
      
      if (!fromHeader) {
        console.log('🧪 Test webhook from OpenAI - ignoring');
        return res.status(200).json({ status: 'test webhook received' });
      }
      
      console.log(`📞 REAL call: ${callId} from ${fromHeader.value}`);
      
      // For OpenAI SIP Domain, respond with session configuration
      console.log('✅ Sending session config to OpenAI');
      
      return res.status(200).json({
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: 'Ti si Maja iz restavracije Fančita. Pozdravi stranko v hrvaščini: "Restoran Fančita, Maja kod telefona. Kako vam mogu pomoći?" Odgovarjaj kratko in prijazno.',
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
        modalities: ['text', 'audio'],
        audio: {
          input: { format: 'g711_ulaw', sample_rate: 8000 },
          output: { format: 'g711_ulaw', sample_rate: 8000 }
        },
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'hr'
        },
        turn_detection: { type: 'semantic_vad' },
        metadata: {
          webhook_url: `https://fancita-sip.loca.lt/webhook`
        }
      });
    }
    
    // Other event types
    console.log('📧 Other event type:', event.type, JSON.stringify(event, null, 2));
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
  console.log(`🚀 Final SIP server running on port ${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
