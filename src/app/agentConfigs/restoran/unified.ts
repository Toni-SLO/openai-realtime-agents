import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { 
  FANCITA_UNIFIED_INSTRUCTIONS,
  FANCITA_RESERVATION_TOOL,
  FANCITA_ORDER_TOOL, 
  FANCITA_HANDOFF_TOOL
} from '../shared/instructions';

// Unified agent with all restaurant capabilities
export const unifiedRestoranAgent = new RealtimeAgent({
  name: 'fancita_restoran',
  voice: 'marin',
  instructions: FANCITA_UNIFIED_INSTRUCTIONS,
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

          // Call MCP system
          const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const response = await fetch(`${url}/api/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 's6792596_fancita_rezervation_supabase',
              data: reservationData
            })
          });

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

          // Call MCP system
          const url = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const response = await fetch(`${url}/api/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 's6798488_fancita_order_supabase',
              data: orderData
            })
          });

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
