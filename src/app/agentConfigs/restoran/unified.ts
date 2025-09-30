import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { 
  FANCITA_UNIFIED_INSTRUCTIONS,
  FANCITA_RESERVATION_TOOL,
  FANCITA_ORDER_TOOL, 
  FANCITA_CALLBACK_TOOL,
  FANCITA_MENU_TOOL,
  FANCITA_LANGUAGE_TOOL,
  FANCITA_CHECK_AVAILABILITY_TOOL
} from '../shared/instructions';
import { getMenuForAgent, findMenuItem, FANCITA_MENU } from '../shared/menu';

// Helper function to extract clean phone number from SIP header format
function extractCleanPhone(rawPhone: string): string {
  if (!rawPhone || rawPhone === '{{system__caller_id}}') {
    return rawPhone;
  }
  
  // Try to extract phone number from SIP From header format
  // Can be like: "38641734134" <sip:+38641734134@pstn.twilio.com>;tag=...
  const phoneMatch = rawPhone.match(/(?:^|["\s])(\+?\d{8,15})(?:["\s<>]|$)/);
  if (phoneMatch) {
    let cleanPhone = phoneMatch[1];
    // Ensure phone number starts with +
    if (!cleanPhone.startsWith('+') && cleanPhone.match(/^\d{8,15}$/)) {
      cleanPhone = '+' + cleanPhone;
    }
    return cleanPhone;
  }
  
  // Fallback: return original value
  console.warn(`[unified-agent] ⚠️ Could not extract clean phone from: ${rawPhone}`);
  return rawPhone;
}
import { replaceInstructionVariablesSync } from '../shared/instructionVariables';
import { parseDateExpression } from '../../lib/slovenianTime';

// ETA computation function based on settings.json rules
function computeEtaFromSettings(pickup: number, delivery: number, settings: any) {
  const etaRules = settings.orders?.eta;
  if (!etaRules) {
    // Fallback values if settings not available
    return { eta_pickup_min: 25, eta_delivery_min: 27 };
  }

  // Pickup ETA calculation
  let eta_pickup_min: number;
  if (pickup <= 5) {
    eta_pickup_min = etaRules.pickup?.count_0_5_min || 20;
  } else {
    eta_pickup_min = etaRules.pickup?.count_gt_5_min || 30;
  }

  // Delivery ETA calculation
  let eta_delivery_min: number;
  if (delivery === 0) {
    eta_delivery_min = etaRules.delivery?.count_0_min || 15;
  } else if (delivery === 1) {
    eta_delivery_min = etaRules.delivery?.count_1_min || 20;
  } else if (delivery >= 2 && delivery <= 3) {
    eta_delivery_min = etaRules.delivery?.range_2_3_min || 30;
  } else {
    eta_delivery_min = etaRules.delivery?.range_gt_3_min || 45;
  }

  return { eta_pickup_min, eta_delivery_min };
}

// Unified agent with all restaurant capabilities
export const unifiedRestoranAgent = new RealtimeAgent({
  name: 'fancita_restoran',
  voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
  instructions: replaceInstructionVariablesSync(FANCITA_UNIFIED_INSTRUCTIONS),
  tools: [
    // Local time utility tool (Slovenian timezone)
    tool({
      name: 'get_slovenian_time',
      description: 'Vrne trenutni datum in uro v slovenskem časovnem pasu (Europe/Ljubljana)',
      parameters: { type: 'object', properties: {} } as any,
      execute: async () => {
        const { getSlovenianDateTime } = await import('../../lib/slovenianTime');
        const now = getSlovenianDateTime();
        return {
          now_iso: now.toISOString(),
          date: now.toISOString().split('T')[0],
          time: now.toTimeString().slice(0, 5),
          timezone: 'Europe/Ljubljana',
          locale: 'sl-SI',
          formatted: now.toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })
        };
      }
    }),
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
          
          // 🚨 SAFETY CHECK: Warn if availability wasn't checked
          console.warn('[unified-agent] ⚠️ RESERVATION TOOL CALLED - Ensure availability was checked first!');
          console.warn('[unified-agent] ⚠️ This should only be called AFTER successful check_availability!');
          
          // Extract caller phone from context
          const rawCallerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const callerPhone = extractCleanPhone(rawCallerPhone);
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          
          // Load settings and compute duration_min based on guests_number
          const settings = require('../../../../server/settings.json');
          const availabilitySettings = settings.availability || {};
          const duration_min = input.duration_min || (
            (input.guests_number <= (availabilitySettings.duration?.threshold || 4))
              ? (availabilitySettings.duration?.smallGroup || 90)
              : (availabilitySettings.duration?.largeGroup || 120)
          );

          const reservationData = {
            name: input.name,
            date: parseDateExpression(input.date),
            time: input.time,
            guests_number: input.guests_number,
            duration_min,
            tel: callerPhone,
            location: input.location,
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
          const rawCallerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const callerPhone = extractCleanPhone(rawCallerPhone);
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          const sessionLanguage = details?.context?.session_language || 'hr';
          
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

    // Direct MCP tool for availability check (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 's7260221_check_availability'
    }] : []),

    // Direct MCP tool for check orders (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 's7355981_check_orders'
    }] : []),

    // Direct MCP tool for callback requests (if MCP_SERVER_URL is configured)
    ...(process.env.MCP_SERVER_URL ? [{
      type: 'mcp' as const,
      server_url: process.env.MCP_SERVER_URL,
      name: 's7433629_fancita_calls_supabase'
    }] : []),

    // Check availability tool
    tool({
      name: FANCITA_CHECK_AVAILABILITY_TOOL.name,
      description: FANCITA_CHECK_AVAILABILITY_TOOL.description,
      parameters: FANCITA_CHECK_AVAILABILITY_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] 🔧 Check availability tool called with:', input);
          console.log('[unified-agent] 🔧 Details:', details);

          // Load settings for default values
          const settings = require('../../../../server/settings.json');
          const availabilitySettings = settings.availability || {};

          // Prepare request data with defaults from settings
          const requestData = {
            date: parseDateExpression(input.date),
            time: input.time,
            people: input.people,
            location: input.location,
            duration_min: input.duration_min || (input.people <= (availabilitySettings.duration?.threshold || 4) 
              ? (availabilitySettings.duration?.smallGroup || 90) 
              : (availabilitySettings.duration?.largeGroup || 120)),
            slot_minutes: input.slot_minutes || availabilitySettings.slotMinutes || 15,
               capacity_terasa: input.capacity_terasa || availabilitySettings.capacity_terasa || 40,
               capacity_vrt: input.capacity_vrt || availabilitySettings.capacity_vrt || 40,
               suggest_max: input.suggest_max || availabilitySettings.suggest_max || 6,
               suggest_stepSlots: input.suggest_stepSlots || availabilitySettings.suggest_stepSlots || 1,
               suggest_forwardSlots: input.suggest_forwardSlots || availabilitySettings.suggest_forwardSlots || 12
          };

          console.log('[unified-agent] 🔧 Processed request data:', requestData);

          // Call Make.com webhook for availability check
          let response;
          try {
            if (process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY) {
              console.log('[unified-agent] Using direct webhook for availability check');
              response = await fetch(process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
              });
            } else {
              // Fallback to MCP API endpoint
              const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
              response = await fetch(`${url}/api/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'check_availability',
                  data: requestData
                })
              });
            }
          } catch (fetchError) {
            console.error('[unified-agent] Availability check fetch failed:', fetchError);
            throw new Error('Network error during availability check');
          }

          const result = await response.json();
          console.log('[unified-agent] 🔧 Availability check result:', result);

          if (result.success !== false) {
            return result;
          } else {
            throw new Error(result.error || 'Availability check failed');
          }
        } catch (error) {
          console.error('[unified-agent] 🚨 Availability check failed:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            status: 'error',
            message: "Oprostite, trenutno ne morem preveriti zasedenosti. Poskusite kasneje ali se obrnite na osebje."
          };
        }
      },
    }),

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
          
          // CRITICAL: Check if language is supported
          const supportedLanguages = (process.env.SUPPORTED_LANGUAGES || 'hr,en,de,it,nl').split(',');
          if (!supportedLanguages.includes(languageCode)) {
            console.log(`[unified-agent] 🚫 Language ${languageCode} NOT SUPPORTED. Supported: ${supportedLanguages.join(', ')}`);
            return `🚫 JEZIK ${languageCode.toUpperCase()} NI PODPRT\n📝 Zaznane fraze: "${detectedPhrases}"\n✅ Ostajam v hrvaščini\n🔧 Podprti jeziki: ${supportedLanguages.join(', ')}`;
          }
          
          // Get language name from environment or use code as fallback
          const languageNamesEnv = process.env.LANGUAGE_NAMES || 'hr:hrvaščina,en:angleščina,de:nemščina,it:italijanščina,nl:nizozemščina';
          const languageNames = Object.fromEntries(
            languageNamesEnv.split(',').map(pair => pair.split(':'))
          );
          
          const languageName = languageNames[languageCode] || languageCode;
          
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

    // Fallback check orders tool
    tool({
      name: 's7355981_check_orders',
      description: 'Check current number of pickup and delivery orders and calculate ETA. CRITICAL: This tool returns eta_pickup_min and eta_delivery_min values. You MUST use these exact values when telling customers pickup/delivery times. For pickup=7 orders, ETA is 30 minutes, NOT 20 minutes.',
      parameters: { type: 'object', properties: {} } as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] 🔧 Check orders tool called');
          
          // Call MCP API endpoint
          let response;
          try {
            const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            response = await fetch(`${url}/api/mcp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 's7355981_check_orders',
                data: {}
              })
            });
          } catch (fetchError) {
            console.error('[unified-agent] Check orders fetch failed:', fetchError);
            throw new Error('Network error during check orders');
          }

          const result = await response.json();
          console.log('[unified-agent] 🔧 Check orders result:', result);

          if (result.success !== false) {
            // Parse the result to get pickup and delivery counts
            let pickup = 0, delivery = 0;
            
            // Check if data is in MCP format (content array with text)
            if (result.data?.content?.[0]?.text) {
              try {
                const ordersData = JSON.parse(result.data.content[0].text);
                pickup = ordersData.pickup || 0;
                delivery = ordersData.delivery || 0;
                console.log(`[unified-agent] 📊 Parsed MCP orders: pickup=${pickup}, delivery=${delivery}`);
              } catch (parseError) {
                console.warn('[unified-agent] ⚠️ Failed to parse MCP orders data:', parseError.message);
              }
            }
            // Fallback: check if data is direct object
            else if (result.data && typeof result.data === 'object') {
              pickup = result.data.pickup || 0;
              delivery = result.data.delivery || 0;
            } 
            // Fallback: check if result is direct object
            else if (result.pickup !== undefined && result.delivery !== undefined) {
              pickup = result.pickup || 0;
              delivery = result.delivery || 0;
            }

            // Load settings and compute ETA
            const settings = require('../../../../server/settings.json');
            const eta = computeEtaFromSettings(pickup, delivery, settings);
            
            // Log ETA calculation for transcript visibility
            console.log(`[ETA CALCULATION] Pickup orders: ${pickup}, Delivery orders: ${delivery}`);
            console.log(`[ETA CALCULATION] Computed ETA - Pickup: ${eta.eta_pickup_min}min, Delivery: ${eta.eta_delivery_min}min`);
            
            return {
              pickup,
              delivery,
              eta_pickup_min: eta.eta_pickup_min,
              eta_delivery_min: eta.eta_delivery_min,
              source: 'mcp_tool',
              message: `CRITICAL: Use eta_pickup_min=${eta.eta_pickup_min} for pickup time, eta_delivery_min=${eta.eta_delivery_min} for delivery time. Do NOT use 20 minutes or any other value!`
            };
          } else {
            throw new Error(result.error || 'Check orders failed');
          }
        } catch (error) {
          console.error('[unified-agent] 🚨 Check orders failed:', error);
          
          // Fallback ETA values from settings
          const settings = require('../../../../server/settings.json');
          const fallbackEta = computeEtaFromSettings(2, 2, settings); // Use middle values for fallback
          
          console.log(`[ETA FALLBACK] Using fallback ETA - Pickup: ${fallbackEta.eta_pickup_min}min, Delivery: ${fallbackEta.eta_delivery_min}min`);
          
          return {
            pickup: 2,
            delivery: 2,
            eta_pickup_min: fallbackEta.eta_pickup_min,
            eta_delivery_min: fallbackEta.eta_delivery_min,
            source: 'fallback',
            error: error instanceof Error ? error.message : String(error)
          };
        }
      },
    }),

    // Fallback callback request tool (staff will call back)
    tool({
      name: FANCITA_CALLBACK_TOOL.name,
      description: FANCITA_CALLBACK_TOOL.description,
      parameters: FANCITA_CALLBACK_TOOL.parameters as any,
      execute: async (input: any, details: any) => {
        try {
          console.log('[unified-agent] Callback request tool called with:', input);
          
          // Extract caller phone and conversation ID from context
          const rawCallerPhone = details?.context?.system__caller_id || '{{system__caller_id}}';
          const callerPhone = extractCleanPhone(rawCallerPhone);
          const conversationId = details?.context?.system__conversation_id || '{{system__conversation_id}}';
          
          // Get session language from context or default to 'hr'
          const sessionLanguage = details?.context?.session_language || 'hr';
          
          const callbackData = {
            name: input.name,
            tel: callerPhone,
            razlog: input.razlog, // Always in Croatian
            jezik: sessionLanguage
          };

          console.log('[unified-agent] Callback data prepared:', callbackData);

          // Call MCP system
          const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const response = await fetch(`${url}/api/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 's7433629_fancita_calls_supabase',
              data: callbackData
            })
          });

          const result = await response.json();
          console.log('[unified-agent] MCP callback result:', result);

          if (result.success) {
            return {
              success: true,
              content: [{
                type: "text",
                text: "Zahtjev za povratni klic je uspješno zaprimljen."
              }]
            };
          } else {
            throw new Error(result.error || 'Callback request failed');
          }
        } catch (error) {
          console.error('[unified-agent] Callback request failed:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            content: [{
              type: "text",
              text: "Oprostite, trenutno ne morem zabilježiti zahtjev za povratni klic. Pokušajte kasnije ili direktno nazovite restoran."
            }]
          };
        }
      },
    })

    // OLD: Direct phone transfer tool - DEPRECATED, keeping for reference
    // ...(process.env.MCP_SERVER_URL ? [{
    //   type: 'mcp' as const,
    //   server_url: process.env.MCP_SERVER_URL,
    //   name: 'transfer_to_staff'
    // }] : []),
    // tool({
    //   name: 'transfer_to_staff',
    //   description: 'Transfer the call to restaurant staff with problem summary',
    //   parameters: { ... },
    //   execute: async (input: any, details: any) => { ... }
    // })
  ]
});
