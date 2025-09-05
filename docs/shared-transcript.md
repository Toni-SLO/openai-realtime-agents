# Shared Transcript - Realtime sinhronizacija med APP in SIP

## Implementacija ✅

Implementirali smo realtime sinhronizacijo transcript-ov med spletno aplikacijo in SIP klici preko dedicirane WebSocket bridge.

### Arhitektura:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SIP Webhook   │ ←→ │ Transcript Bridge│ ←→ │  Web APP        │
│   (Server)      │    │   (WebSocket)    │    │  (Client)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Komponente:

1. **Transcript Bridge Server**: `server/transcript-bridge.mjs`
   - WebSocket server na portu 3002
   - Shranjevanje aktivnih session-ov
   - Realtime broadcast subscribed client-om
   - Avtomatsko čiščenje starih session-ov

2. **SIP Integration**: `src/app/api/openai/webhook/route.ts`
   - Pošilja transcript events v realnem času
   - Session start/end tracking
   - ASR (user speech) in TTS (assistant speech) events

3. **Web APP Integration**: `src/app/hooks/useTranscriptBridge.ts`
   - React hook za WebSocket povezavo
   - Subscription management
   - Avtomatična reconnection logika

4. **UI Components**: `src/app/App.tsx`
   - Status indicator (Connected/Disconnected)
   - "Monitor SIP Call" button za ročno subscription

### Funkcionalnosti:

#### Transcript Events:
- ✅ **User Speech** - 📞 prefix v transcript
- ✅ **Assistant Speech** - 🎙️ prefix v transcript  
- ✅ **Function Calls** - Breadcrumb z metadata
- ✅ **Session Start/End** - Lifecycle events

#### Management:
- ✅ **Multi-session support** - Lahko spremljamo več klicev hkrati
- ✅ **Auto-cleanup** - Stari session-i se avtomatično čistijo (1 ura)
- ✅ **Reconnection** - Avtomatična ponovna povezava
- ✅ **History** - Transcript history ob subscription

### Kako uporabljati:

#### Zaženi vse strežnike:
```bash
npm run dev:all
# Zažene:
# - Next.js APP (port 3000)
# - Twilio Bridge (port 3001) 
# - Transcript Bridge (port 3002)
```

#### V APP-u:
1. Odpri spletno aplikacijo
2. Preveri "SIP Bridge Connected" status
3. Klikni "Monitor SIP Call" 
4. Vnesi Call ID (iz SIP webhook logov)
5. Transcript se prikaže v realnem času

#### Za produkcijo:
```bash
# Environment variables
TRANSCRIPT_BRIDGE_PORT=3002
TRANSCRIPT_BRIDGE_URL=ws://localhost:3002
NEXT_PUBLIC_TRANSCRIPT_BRIDGE_URL=ws://localhost:3002
```

### Event Types:

```typescript
interface TranscriptEvent {
  type: 'message' | 'function_call' | 'session_start' | 'session_end';
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  metadata?: any;
  timestamp?: number;
}
```

### WebSocket Messages:

#### Client → Bridge:
- `subscribe` - Subscribe to call ID
- `unsubscribe` - Unsubscribe from call ID

#### Bridge → Client:
- `transcript_update` - New transcript event
- `transcript_history` - Complete session history
- `session_ended` - Session lifecycle event

#### SIP → Bridge:
- `transcript_event` - Real-time events
- `session_end` - Call ended

### Prednosti:

- ✅ **Realtime monitoring** - Spremljaj SIP klice v živo
- ✅ **Non-intrusive** - Ne vpliva na obstoječe funkcionalnosti
- ✅ **Scalable** - Podpira več client-ov in session-ov
- ✅ **Reliable** - Avtomatična reconnection in error handling
- ✅ **Visual indicators** - Jasno ločevanje SIP vs APP transcript-ov

### Use Cases:

1. **Debugging SIP calls** - Spremljaj kaj se dogaja v realnem času
2. **Customer support** - Monitoring active calls
3. **Training** - Spremljaj kako agent obravnava klice
4. **Analytics** - Zbiranje transcript podatkov za analizo

Transcript bridge omogoča popolno transparentnost SIP klicev direktno v spletni aplikaciji!
