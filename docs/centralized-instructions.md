# Centralizirane instrukcije - Enotni Agent

## Implementacija ✅

Implementirali smo enotni agent pristop z možnostjo preklapljanja med unified in multi-agent mode.

### Ključne spremembe:

1. **Enotni agent**: `src/app/agentConfigs/restoran/unified.ts`
   - Vse 3 funkcionalnosti (rezervacije, naročila, handoff) v enem agentu
   - Avtomatska detekcija namena brez handoff sistema
   - Direktna MCP integracija z fallback logiko

2. **Dinamična konfiguracija**: `src/app/agentConfigs/restoran/index.ts`
   - Environment variable `USE_MULTI_AGENT` za strežniške klice
   - URL parameter `?multiAgent=true` za spletno aplikacijo

3. **UI toggle**: `src/app/App.tsx`
   - Checkbox za preklapljanje med modes
   - Avtomatično reconnect pri preklapljanju
   - URL sync z browser history

### Agent modes:

#### Unified Mode (Priporočeno) 🌟:
```
┌─────────────────────────────────────┐
│        fancita_restoran             │
│  ┌─────────────────────────────────┐ │
│  │ • Rezervacije                  │ │
│  │ • Naročila                     │ │
│  │ • Handoff                      │ │
│  │ • Avtomatska detekcija namena  │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Multi-Agent Mode (Zapuščina):
```
┌─────────┐    ┌──────────────┐    ┌─────────┐    ┌─────────┐
│ greeter │ ←→ │ reservation  │ ←→ │  order  │ ←→ │ handoff │
└─────────┘    └──────────────┘    └─────────┘    └─────────┘
```

### Prednosti Unified Mode:

- ✅ **Boljša user experience** - Ni potrebno handoff
- ✅ **Hitrejši odzivni čas** - Brez agent switching
- ✅ **Manjša kompleksnost** - 1 agent vs 4 agenti
- ✅ **Enotne instrukcije** - Vsa logika na enem mestu
- ✅ **Avtomatska detekcija namena** - Brez eksplicitnih transferov
- ✅ **Historia se ohranja** - En agent = ena seja

### Kako uporabljati:

#### V spletni aplikaciji:
1. Izberi "restoran" agent config
2. Obkljukaj/odkljukaj "Multi-Agent Mode"
3. Aplikacija se avtomatično ponovno poveže

#### Za SIP klice:
```bash
# Unified mode (default)
export USE_MULTI_AGENT=false

# Multi-agent mode
export USE_MULTI_AGENT=true
```

### Konfiguracija:

Environment variables:
- `USE_MULTI_AGENT=true/false` - Za strežniške klice (SIP)
- `MCP_SERVER_URL` - Za direktno MCP integracijo
- `USE_AGENTS_SDK=true/false` - Za Agents SDK vs direktni webhook

URL parameters:
- `?agentConfig=restoran` - Izbira restaurant agentov
- `?multiAgent=true` - Multi-agent mode v APP
- `?codec=opus/g711_ulaw` - Audio codec izbira

### Backward compatibility:

- ✅ **Obstoječi agenti** - Rezervacija, naročila, handoff delujejo enako
- ✅ **Isti tools** - MCP integracija nespremenjena
- ✅ **Ista instrukcije** - Logika preslikana v unified agenta
- ✅ **URL compatibility** - Obstoječe povezave delujejo

Priporočamo uporabo **Unified Mode** za boljšo performance in UX.
