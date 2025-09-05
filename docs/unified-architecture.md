# Enotna arhitektura za SIP in APP

## Implementacija ✅

Sedaj imamo enotno arhitekturo z OpenAI Agents SDK za tako SIP klice kot tudi spletno aplikacijo.

### Ključne spremembe:

1. **Ustvarjen enotni agent**: `src/app/agentConfigs/restoran/unified.ts`
   - Vključuje vse 3 tools (reservation, order, handoff)
   - Enotne instrukcije za vse scenarije
   - MCP integracija z proper error handling

2. **Posodobljen twilio-bridge.mjs**:
   - Uporablja `unifiedRestoranAgent` namesto 4 ločenih agentov
   - Brez potrebe po handoff logiki

3. **Fleksibilna TwiML konfiguracija**:
   - Environment variable `USE_AGENTS_SDK=true` preklopi na Agents SDK
   - Environment variable `TWILIO_BRIDGE_URL` nastavi bridge URL

### Kako uporabljati:

#### Za development:

```bash
# Nastavi environment variable
export USE_AGENTS_SDK=true
export TWILIO_BRIDGE_URL=ws://localhost:3001

# Zaženi oba strežnika
npm run dev:all
```

#### Za produkcijo:

```bash
# Nastavi production bridge URL  
export TWILIO_BRIDGE_URL=wss://your-domain.com:3001

# Zaženi bridge strežnik
npm run bridge

# V drugi terminal session
npm run start
```

### Prednosti:

- ✅ **Enotna koda** za SIP in APP
- ✅ **Historia se ohranja** med tool calls v isti sesi
- ✅ **Pravilna OpenAI Agents SDK implementacija**
- ✅ **Vse MCP tools delujejo** enako
- ✅ **Backward compatibility** z obstoječim pristopom

### Preklop med pristopoma:

- `USE_AGENTS_SDK=false` (default) → Uporablja direktni OpenAI SIP webhook
- `USE_AGENTS_SDK=true` → Uporablja Agents SDK + Media Streams

