# Direktna MCP integracija v OpenAI Realtime API

## Implementacija ✅

Implementirali smo direktno MCP (Model Context Protocol) integracijo v OpenAI Realtime API, ki omogoča boljšo performance in manjšo latenca pri klicanju zunanjih orodij.

### Ključne spremembe:

1. **Enotni agent z direktno MCP podporo**: `src/app/agentConfigs/restoran/unified.ts`
   - Dodani direktni MCP tools z `type: 'mcp'`
   - Fallback na tradicionalne tools če MCP ni na voljo

2. **SIP webhook z MCP podporo**: `src/app/api/openai/webhook/route.ts`
   - Dinamična konfiguracija tools glede na `MCP_SERVER_URL`
   - Pogojno rokovanje s tool calls

### Kako deluje:

#### Z MCP strežnikom (DIREKTNO):
```typescript
{
  type: 'mcp',
  server_url: process.env.MCP_SERVER_URL,
  name: 's6792596_fancita_rezervation_supabase'
}
```

OpenAI direktno kliče MCP strežnik → **Brez vmesnega `/api/mcp` endpoint-a**

#### Brez MCP strežnika (FALLBACK):
```typescript
tool({
  name: 's6792596_fancita_rezervation_supabase',
  execute: async (input) => {
    // Ročni klic na /api/mcp endpoint
    const response = await fetch('/api/mcp', ...)
  }
})
```

### Environment konfiguracija:

```bash
# Za direktno MCP integracijo
MCP_SERVER_URL=https://your-mcp-server.com/sse

# Ali pa za fallback
# MCP_SERVER_URL= (prazen ali nedefinirane)
```

### Prednosti direktne integracije:

- ✅ **Manjša latenca** - Brez vmesnih HTTP klicev
- ✅ **Boljša performance** - Direktna komunikacija
- ✅ **Avtomatsko error handling** - OpenAI obvladuje napake
- ✅ **Standardiziran protokol** - MCP standard
- ✅ **Boljša skalabilnost** - Manj prometne obremenitve

### Backward compatibility:

- ✅ **Obstoja `/api/mcp` endpoint** - Za debug in direktne klice
- ✅ **Fallback logic** - Če MCP strežnik ni na voljo
- ✅ **Enotna koda** - Deluje z obema pristopoma

### Testiranje:

```bash
# Test z direktno MCP integracijo
export MCP_SERVER_URL=https://your-mcp-server.com/sse
npm run dev

# Test s fallback
unset MCP_SERVER_URL
npm run dev
```

MCP tools se bodo automatično preklopili glede na konfiguracija.
