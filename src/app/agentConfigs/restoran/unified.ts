import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { 
  FANCITA_UNIFIED_INSTRUCTIONS,
  FANCITA_RESERVATION_TOOL,
  FANCITA_ORDER_TOOL, 
  FANCITA_HANDOFF_TOOL,
  FANCITA_MENU_TOOL,
  FANCITA_LANGUAGE_TOOL
} from '../shared/instructions';
import { getMenuForAgent, findMenuItem } from '../shared/menu';
import { replaceInstructionVariablesSync } from '../shared/instructionVariables';

// Unified agent with all restaurant capabilities
export const unifiedRestoranAgent = new RealtimeAgent({
  name: 'fancita_restoran',
  voice: 'marin',
  instructions: replaceInstructionVariablesSync(FANCITA_UNIFIED_INSTRUCTIONS),
  tools: [
    // Direct MCP tool for reservations (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 's6792596_fancita_rezervation_supabase'
    }] : []),
    
    // Fallback reservation tool
    tool({
      name: FANCITA_RESERVATION_TOOL.name,
      description: FANCITA_RESERVATION_TOOL.description,
      parameters: FANCITA_RESERVATION_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] Reservation tool called with:', input);
          
          // Extract caller phone from context
          const callerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          
          const reservationData = {
            name: input.name,
            date: input.date,
            time: input.time,
            guests_number: input.guests_number,
            tel: callerPhone,
            location: input.location || 'terasa',
            notes: input.notes || '—',
            source_id: conversationId,
          };

          // Call MCP system - try direct webhook first for SIP context
          let response;
          try {
            // Try direct webhook for SIP bridge context
            if (process.env.MAKE_WEBHOOK_RESERVATION) {
              console.log('[unified-agent] Using direct webhook for SIP context');
              response = await fetch(process.env.MAKE_WEBHOOK_RESERVATION, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reservationData)
              });
            } else {
              // Fallback to MCP API endpoint for web context
              const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
              response = await fetch(`${url}/api/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 's6792596_fancita_rezervation_supabase',
                  data: reservationData
                })
              });
            }
          } catch (fetchError) {
            console.error('[unified-agent] Fetch failed:', fetchError);
            throw new Error('Network error during reservation');
          }

          const result = await response.json();
          console.log('[unified-agent] MCP reservation result:', result);

          if (result.success) {
            return result.data;
          } else {
            throw new Error(result.error || 'MCP operation failed');
          }
        } catch (error) {
          console.error('[unified-agent] Reservation creation failed:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            content: [{
              type: "text",
              text: "Oprostite, imamo težave s sistemom. Poskusite ponovno ali pokličite kasneje."
            }]
          };
        }
      },
    }),

    // Direct MCP tool for orders (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 's6798488_fancita_order_supabase'
    }] : []),

    // Fallback order tool  
    tool({
      name: FANCITA_ORDER_TOOL.name,
      description: FANCITA_ORDER_TOOL.description,
      parameters: FANCITA_ORDER_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] Order tool called with:', input);
          
          // Extract caller phone from context
          const callerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          
          // Menu items price lookup (from order.ts)
          const MENU_ITEMS: { [key: string]: number } = {
            'Pizza Nives': 12.00,
            'pica Nives': 12.00,
            'Pizza Margherita': 10.00,
            'pica Margherita': 10.00,
            'Pizza Capriciosa': 11.00,
            'pica Capriciosa': 11.00,
            // Add more items as needed
          };

          // Add prices to items if missing
          const processedItems = input.items.map((item: any) => ({
            ...item,
            price: item.price || MENU_ITEMS[item.name] || 0
          }));

          const orderData = {
            items: processedItems,
            delivery_address: input.delivery_address,
            notes: input.notes || '—',
            tel: callerPhone,
            source_id: conversationId,
          };

          // Call MCP system - try direct webhook first for SIP context
          let response;
          try {
            // Try direct webhook for SIP bridge context
            if (process.env.MAKE_WEBHOOK_ORDER) {
              console.log('[unified-agent] Using direct webhook for SIP context (order)');
              response = await fetch(process.env.MAKE_WEBHOOK_ORDER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
              });
            } else {
              // Fallback to MCP API endpoint for web context
              const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
              response = await fetch(`${url}/api/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 's6798488_fancita_order_supabase',
                  data: orderData
                })
              });
            }
          } catch (fetchError) {
            console.error('[unified-agent] Order fetch failed:', fetchError);
            throw new Error('Network error during order');
          }

          const result = await response.json();
          console.log('[unified-agent] MCP order result:', result);

          if (result.success) {
            return result.data;
          } else {
            throw new Error(result.error || 'MCP operation failed');
          }
        } catch (error) {
          console.error('[unified-agent] Order creation failed:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            content: [{
              type: "text",
              text: "Oprostite, imamo težave s sistemom. Poskusite ponovno ali pokličite kasneje."
            }]
          };
        }
      },
    }),

    // Direct MCP tool for handoff (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 'transfer_to_staff'
    }] : []),

    // Menu search tool
    tool({
      name: FANCITA_MENU_TOOL.name,
      description: FANCITA_MENU_TOOL.description,
      parameters: FANCITA_MENU_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] 🔧 Menu search tool called with:', input);
          console.log('[unified-agent] 🔧 Details:', details);

          const language = input.language || 'hr';
          
          if (input.get_full_menu) {
            // Return complete menu in specified language
            const fullMenu = getMenuForAgent(language);
            const result = `Celoten meni restavracije Fančita:\n${fullMenu}`;
            console.log('[unified-agent] 🔧 Returning full menu result (length):', result.length);
            return result;
          } else if (input.query) {
            // Search for specific items
            const searchResults = findMenuItem(input.query, language);
            
            if (searchResults.length === 0) {
              // NOVA LOGIKA: Če ni rezultatov, vrni CELOTEN menu v trenutnem jeziku
              console.log('[unified-agent] 🔧 No results found, returning full menu instead');
              const fullMenu = getMenuForAgent(language);
              const fallbackResult = `Ni najdenih specifičnih rezultatov za "${input.query}". Tukaj je celoten meni restavracije Fančita v ${language} jeziku:\n\n${fullMenu}\n\nProsim, poiščite želeno jed v zgornjem meniju.`;
              console.log('[unified-agent] 🔧 Returning fallback full menu result (length):', fallbackResult.length);
              return fallbackResult;
            }
            
            let resultText = `Rezultati iskanja za "${input.query}":\n\n`;
            searchResults.forEach(item => {
              const translation = item.translations[language as keyof typeof item.translations];
              resultText += `• ${translation} - ${item.price.toFixed(2)} €\n`;
            });
            
            console.log('[unified-agent] 🔧 Returning search result:', resultText);
            return resultText;
          } else {
            // No query provided, return basic menu info
            const basicMenu = getMenuForAgent(language);
            const basicResult = `Meni restavracije Fančita:\n${basicMenu}`;
            console.log('[unified-agent] 🔧 Returning basic menu result (length):', basicResult.length);
            return basicResult;
          }
        } catch (error) {
          console.error('[unified-agent] 🚨 Menu search failed:', error);
          const errorResult = "Oprostite, trenutno ne morem dostopati do menija. Poskusite kasneje ali se obrnite na osebje.";
          console.log('[unified-agent] 🔧 Returning error result:', errorResult);
          return errorResult;
        }
      },
    }),

    // Language switch tool
    tool({
      name: FANCITA_LANGUAGE_TOOL.name,
      description: FANCITA_LANGUAGE_TOOL.description,
      parameters: FANCITA_LANGUAGE_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] 🔧 Language switch tool called with:', input);
          console.log('[unified-agent] 🔧 Details:', details);
          
          const languageCode = input.language_code;
          const detectedPhrases = input.detected_phrases;
          
          // Language names mapping
          const languageNames = {
            'hr': 'hrvaščina',
            'sl': 'slovenščina', 
            'en': 'angleščina',
            'de': 'nemščina',
            'it': 'italijanščina',
            'nl': 'nizozemščina'
          };
          
          const languageName = languageNames[languageCode as keyof typeof languageNames] || languageCode;
          
          // Log the language switch for transcript visibility
          console.log(`[LANGUAGE SWITCH] Detected ${languageName} from phrases: "${detectedPhrases}"`);
          
          const result = `🌍 JEZIK PREKLOPLJEN: ${languageCode.toUpperCase()} (${languageName})\n📝 Zaznane fraze: "${detectedPhrases}"\n✅ Transkripcijski model posodobljen na ${languageCode}`;
          console.log('[unified-agent] 🔧 Returning language switch result:', result);
          return result;
        } catch (error) {
          console.error('[unified-agent] 🚨 Language switch failed:', error);
          const errorResult = "Napaka pri preklapljanju jezika. Nadaljujem v trenutnem jeziku.";
          console.log('[unified-agent] 🔧 Returning error result:', errorResult);
          return errorResult;
        }
      },
    }),

    // Fallback handoff tool
    tool({
      name: FANCITA_HANDOFF_TOOL.name,
      description: FANCITA_HANDOFF_TOOL.description,
      parameters: FANCITA_HANDOFF_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] Handoff tool called with:', input);
          
          // Extract caller phone from context  
          const callerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          
          const handoffData = {
            problem_summary: input.problem_summary,
            tel: callerPhone,
            source_id: conversationId,
          };

          // Call MCP system
          const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const response = await fetch(`${url}/api/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'transfer_to_staff',
              data: handoffData
            })
          });

          const result = await response.json();
          console.log('[unified-agent] MCP handoff result:', result);

          if (result.success) {
            return {
              content: [{
                type: "text",
                text: "Povezujem vas z osebjem. Trenutak..."
              }]
            };
          } else {
            throw new Error(result.error || 'Handoff failed');
          }
        } catch (error) {
          console.error('[unified-agent] Handoff failed:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            content: [{
              type: "text",
              text: "Oprostite, trenutno ne morem povezati z osebjem. Poskusite direktno poklicati restavracijo."
            }]
          };
        }
      },
    })
  ]
});
