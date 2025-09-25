// MCP API route using proper MCP SDK and AI SDK
console.log('🔧 [MCP] Route file loaded at:', new Date().toISOString());

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types';
import { experimental_createMCPClient } from 'ai';
import { openai } from '@ai-sdk/openai';

// Clean data to remove Unicode characters that cause issues
function cleanData(data: any): any {
  const cleaned = JSON.parse(JSON.stringify(data));

  function cleanString(str: string): string {
    return str
      .replace(/—/g, '-')  // Long dash to regular dash
      .replace(/–/g, '-')  // En dash to regular dash
      .replace(/'/g, "'")  // Smart quotes to regular quotes
      .replace(/'/g, "'")
      .replace(/'/g, '"')
      .replace(/'/g, '"')
      .replace(/…/g, '...')  // Ellipsis
      .replace(/č/g, 'c')   // Croatian characters
      .replace(/ć/g, 'c')
      .replace(/đ/g, 'd')
      .replace(/š/g, 's')
      .replace(/ž/g, 'z')
      .replace(/Č/g, 'C')
      .replace(/Ć/g, 'C')
      .replace(/Đ/g, 'D')
      .replace(/Š/g, 'S')
      .replace(/Ž/g, 'Z');
  }

  function cleanObject(obj: any): any {
    if (typeof obj === 'string') {
      return cleanString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    } else if (obj && typeof obj === 'object') {
      const cleanedObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        cleanedObj[key] = cleanObject(value);
      }
      return cleanedObj;
    }
    return obj;
  }

  return cleanObject(cleaned);
}

// Make.com webhook call function (fallback)
async function callMakeWebhook(webhookId: string, data: any) {
  const cleanedData = cleanData(data);

  // Use environment variable if set, otherwise try different formats
  const possibleUrls = [];
  
  // Add environment-specific URLs first
  if (webhookId.includes('s6792596') && process.env.MAKE_WEBHOOK_RESERVATION) {
    possibleUrls.push(process.env.MAKE_WEBHOOK_RESERVATION);
  }
  if (webhookId.includes('s6798488') && process.env.MAKE_WEBHOOK_ORDER) {
    possibleUrls.push(process.env.MAKE_WEBHOOK_ORDER);
  }
  
  // Fallback to auto-detection
  possibleUrls.push(
    `https://hook.eu2.make.com/${webhookId}`,
    `https://eu2.make.com/hooks/${webhookId}`,
    `https://hook.eu2.make.com/${webhookId.replace(/\D/g, '')}`,
  );

  for (const url of possibleUrls) {
    try {
      console.log(`Trying webhook call to: ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanedData),
      });

      const responseText = await response.text();
      console.log(`Webhook Response status:`, response.status);

      if (response.ok) {
        console.log(`✅ Webhook call successful to ${url}`);
        try {
          return JSON.parse(responseText);
        } catch (e) {
          return { success: true, message: responseText };
        }
      } else {
        console.log(`❌ Webhook call failed to ${url}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`Error calling webhook ${url}:`, error);
    }
  }

  throw new Error(`All webhook URLs failed for ${webhookId}`);
}

// Initialize MCP client
let mcpClient: any = null;
let mcpTools: any[] = [
  {
    name: 's7260221_check_availability',
    description: 'Check table availability for a specific date, time, and location before making a reservation',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Reservation time (HH:MM)' },
        people: { type: 'number', description: 'Number of guests' },
        location: { type: 'string', description: 'Table location: terasa or vrt' },
        duration_min: { type: 'number', description: 'Reservation duration in minutes' },
        slot_minutes: { type: 'number', description: 'Time slot granularity' },
        capacity: { type: 'object', description: 'Capacity per location' },
        suggest: { type: 'object', description: 'Suggestion parameters' }
      },
      required: ['date', 'time', 'people', 'location']
    }
  },
  {
    name: 's6792596_fancita_rezervation_supabase',
    description: 'Create a table reservation for restaurant Fančita',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Guest name' },
        date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Reservation time (HH:MM)' },
        guests_number: { type: 'number', description: 'Number of guests' },
        duration_min: { type: 'number', description: 'Reservation duration in minutes' },
        location: { type: 'string', description: 'Location: vrt, terasa, unutra' },
        notes: { type: 'string', description: 'Special notes' },
        tel: { type: 'string', description: 'Telephone number' },
        source_id: { type: 'string', description: 'Conversation ID' }
      },
      required: ['name', 'date', 'time', 'guests_number', 'duration_min']
    }
  },
  {
    name: 's6798488_fancita_order_supabase',
    description: 'Create a food/beverage order for restaurant Fančita',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name' },
        date: { type: 'string', description: 'Delivery/pickup date (YYYY-MM-DD)' },
        delivery_time: { type: 'string', description: 'Delivery time (HH:MM)' },
        delivery_type: { type: 'string', description: 'Type: delivery or pickup' },
        delivery_address: { type: 'string', description: 'Delivery address' },
        items: {
          type: 'array',
          description: 'List of ordered items',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name' },
              qty: { type: 'number', description: 'Quantity' },
              price: { type: 'number', description: 'Price per item' },
              notes: { type: 'string', description: 'Special notes' }
            }
          }
        },
        total: { type: 'number', description: 'Total amount' },
        notes: { type: 'string', description: 'Order notes' },
        tel: { type: 'string', description: 'Telephone number' },
        source_id: { type: 'string', description: 'Conversation ID' }
      },
      required: ['name', 'date', 'delivery_time', 'delivery_type', 'delivery_address', 'items', 'total']
    }
  },
  {
    name: 's7355981_check_orders',
    description: 'Check current number of pickup and delivery orders',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

async function initializeMCPClient() {
  const sseUrl = process.env.MCP_SERVER_URL;

  if (!sseUrl) {
    console.warn('MCP_SERVER_URL not configured, using fallback mode');
    return false;
  }

  try {
    console.log('🔗 Connecting to Make MCP server via SSE...');

    // Create SSE transport with API key if provided
    const transportOptions: any = {};
    if (process.env.MCP_API_KEY) {
      transportOptions.headers = {
        'Authorization': `Bearer ${process.env.MCP_API_KEY}`
      };
    }
    
    const transport = new SSEClientTransport(new URL(sseUrl), transportOptions);

    // Create MCP client
    const client = new Client(
      { name: 'fancita-realtime', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // Connect to MCP server
    await client.connect(transport);
    console.log('✅ Connected to MCP server');

    // Get available tools
    console.log('📋 Requesting tools from MCP server...');
    const toolsResponse = await client.request(
      { method: 'tools/list' },
      CallToolResultSchema
    );

    console.log('📋 Tools response:', JSON.stringify(toolsResponse, null, 2));

    // Try different possible structures for tools
    let tools = null;
    if (toolsResponse.tools && Array.isArray(toolsResponse.tools)) {
      tools = toolsResponse.tools;
    } else if (toolsResponse.data && Array.isArray(toolsResponse.data)) {
      tools = toolsResponse.data;
    } else if (toolsResponse.result && Array.isArray(toolsResponse.result)) {
      tools = toolsResponse.result;
    } else if (Array.isArray(toolsResponse)) {
      tools = toolsResponse;
    }

    if (tools && tools.length > 0) {
      // Merge MCP tools with existing fallback tools
      const existingToolNames = new Set(mcpTools.map(t => t.name));
      const newTools = tools.filter((tool: any) => !existingToolNames.has(tool.name));

      if (newTools.length > 0) {
        mcpTools.push(...newTools);
        console.log(`✅ Added ${newTools.length} MCP tools`);
        newTools.forEach((tool: any) => {
          console.log(`  - ${tool.name || tool.id}: ${tool.description}`);
        });
      }

      mcpClient = client;
      console.log(`✅ MCP client connected, total tools: ${mcpTools.length}`);
      return true;
    } else {
      console.warn('⚠️ No tools received from MCP server');
      console.warn('Response structure:', Object.keys(toolsResponse));
      return false;
    }

  } catch (error) {
    console.error('❌ Failed to initialize MCP client:', error);
    return false;
  }
}

// Initialize on startup
console.log('🚀 Starting MCP initialization...');
initializeMCPClient().then(success => {
  if (success) {
    console.log('🎉 MCP initialization completed successfully');
  } else {
    console.log('🔄 MCP initialization failed, using fallback webhook mode');
  }
}).catch(error => {
  console.error('💥 MCP initialization error:', error);
  console.log('🔄 Using fallback webhook mode due to error');
});

// GET endpoint for configuration check and available tools
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'tools') {
    // Return available tools
    return NextResponse.json({
      tools: mcpTools,
      count: mcpTools.length,
      mode: mcpClient ? 'mcp' : 'fallback'
    });
  }

  if (action === 'status') {
    // Status endpoint - vrne 200 če je MCP client pripravljen
    if (mcpClient) {
      return NextResponse.json({ ready: true, mode: 'mcp' });
    } else {
      return NextResponse.json({ ready: false, mode: 'fallback' }, { status: 503 });
    }
  }

  if (action === 'test-reservation') {
    console.log('=== TESTING RESERVATION ===');
    try {
      const testData = {
        name: 'Test User',
        date: '2025-01-15',
        time: '19:00',
        guests_number: 2,
        tel: '+123456789',
        location: 'terasa',
        notes: 'Test reservation',
        source_id: 'test-123'
      };

      let result;
      if (mcpClient) {
        // Use MCP client
        result = await mcpClient.request(
          {
            method: 'tools/call',
            params: { name: 's6792596_fancita_rezervation_supabase', arguments: testData }
          },
          CallToolResultSchema
        );
      } else {
        // Use fallback webhook
        result = await callMakeWebhook('s6792596', testData);
      }

      return NextResponse.json({
        success: true,
        message: 'Reservation test successful',
        result: result,
        mode: mcpClient ? 'mcp' : 'fallback'
      });
    } catch (error) {
      console.error('Test failed:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: mcpClient ? 'mcp' : 'fallback'
      }, { status: 500 });
    }
  }

  if (action === 'test-order') {
    console.log('=== TESTING ORDER ===');
    try {
      const testData = {
        name: 'Test Customer',
        date: '2025-01-15',
        delivery_time: '18:30',
        delivery_type: 'delivery',
        delivery_address: 'Test Street 123',
        tel: '+123456789',
        items: [
          { name: 'Pizza Margherita', qty: 1, price: 10.00, notes: 'Test' }
        ],
        total: 10.00,
        notes: 'Test order',
        source_id: 'test-456'
      };

      let result;
      if (mcpClient) {
        // Use MCP client
        result = await mcpClient.request(
          {
            method: 'tools/call',
            params: { name: 's6798488_fancita_order_supabase', arguments: testData }
          },
          CallToolResultSchema
        );
      } else {
        // Use fallback webhook
        result = await callMakeWebhook('s6798488', testData);
      }

      return NextResponse.json({
        success: true,
        message: 'Order test successful',
        result: result,
        mode: mcpClient ? 'mcp' : 'fallback'
      });
    } catch (error) {
      console.error('Test failed:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: mcpClient ? 'mcp' : 'fallback'
      }, { status: 500 });
    }
  }

  if (action === 'test-availability') {
    console.log('=== TESTING AVAILABILITY CHECK ===');
    try {
      const testData = {
        date: '2025-01-15',
        time: '19:00',
        people: 4,
        location: 'terasa',
        duration_min: 90,
        slot_minutes: 15,
        capacity_terasa: 40,
        capacity_vrt: 40,
        suggest_max: 6,
        suggest_stepSlots: 1,
        suggest_forwardSlots: 12
      };

      let result;
      if (process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY) {
        // Use direct webhook
        const response = await fetch(process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData)
        });
        result = await response.json();
      } else {
        // Use fallback (this would normally not work without proper MCP setup)
        result = { error: 'MAKE_WEBHOOK_CHECK_AVAILABILITY not configured' };
      }

      return NextResponse.json({
        success: true,
        message: 'Availability check test completed',
        result: result,
        mode: 'webhook'
      });
    } catch (error) {
      console.error('Availability test failed:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: 'webhook'
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    configured: !!process.env.MCP_SERVER_URL,
    serverUrlConfigured: !!process.env.MCP_SERVER_URL,
    mcpConnected: !!mcpClient,
    availableTools: mcpTools.length,
    mode: mcpClient ? 'mcp' : 'fallback',
    testEndpoints: {
      reservation: '/api/mcp?action=test-reservation',
      order: '/api/mcp?action=test-order',
      availability: '/api/mcp?action=test-availability',
      tools: '/api/mcp?action=tools'
    }
  });
}

export async function POST(request: NextRequest) {
  console.log('🔧 [MCP] POST function called at:', new Date().toISOString());
  
  try {
    const { action, data } = await request.json();
    console.log('🔧 [MCP] API called with:', { action, data });
    console.log('🔧 [MCP] Is availability check?', action === 's7260221_check_availability');

    // Ensure duration_min for reservation actions based on settings
    try {
      if (action === 'createReservation' || action === 's6792596_fancita_rezervation_supabase') {
        const settings = require('../../../../server/settings.json');
        const availability = settings.availability || {};
        const threshold = availability.duration?.threshold || 4;
        const small = availability.duration?.smallGroup || 90;
        const large = availability.duration?.largeGroup || 120;
        const people = Number(data?.guests_number);
        if (!data.duration_min) {
          data.duration_min = people <= threshold ? small : large;
        }
      }
    } catch (e) {
      console.warn('[mcp] Could not compute duration_min, using default if missing');
      if ((action === 'createReservation' || action === 's6792596_fancita_rezervation_supabase') && !data.duration_min) {
        data.duration_min = 90;
      }
    }

    let result;
    // Map action names to full tool names
    const toolNameMap: { [key: string]: string } = {
      'createReservation': 's6792596_fancita_rezervation_supabase',
      'createOrder': 's6798488_fancita_order_supabase',
      'transfer_to_staff': 'transfer_to_staff',
      'check_availability': 'check_availability',
      // Direct tool name mapping
      's6792596_fancita_rezervation_supabase': 's6792596_fancita_rezervation_supabase',
      's6798488_fancita_order_supabase': 's6798488_fancita_order_supabase',
      'check_availability': 'check_availability',
      's7260221_check_availability': 's7260221_check_availability',
      's7355981_check_orders': 's7355981_check_orders'
    };

    const fullToolName = toolNameMap[action] || action;

    // Try to use MCP client if available or wait for it to initialize
    if (mcpClient || process.env.MCP_SERVER_URL) {
      // Quick check for MCP initialization - don't wait long
      if (!mcpClient && process.env.MCP_SERVER_URL) {
        console.log('⏳ Waiting for MCP client to be ready...');
        let attempts = 0;
        // wait up to ~5s (10 * 500ms) for MCP to come up on cold start
        while (!mcpClient && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        if (!mcpClient) {
          console.log('⚠️ MCP client not ready after 5s, using webhook fallback');
        }
      }
      
      if (mcpClient) {
        // Use MCP client
        console.log('🔗 Using MCP client for:', fullToolName);
        result = await mcpClient.request(
          {
            method: 'tools/call',
            params: { name: fullToolName, arguments: data }
          },
          CallToolResultSchema
        );
      } else {
        console.log('⚠️ MCP client not ready, falling back to webhooks');
        // Fall through to webhook fallback
      }
    }
    
    if (!result) {
      // Use fallback webhook
      console.log('🔄 Using fallback webhook for:', action);
      
      // Special handling for check_availability
      if (action === 'check_availability' || action === 's7260221_check_availability') {
        console.log('🔄 Using direct webhook for availability check');
        if (process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY) {
          const response = await fetch(process.env.MAKE_WEBHOOK_CHECK_AVAILABILITY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          result = await response.json();
        } else {
          throw new Error('MAKE_WEBHOOK_CHECK_AVAILABILITY not configured');
        }
      } else {
        // Original webhook logic for reservations and orders
        let webhookId = 's6798488'; // default to order
        if (action === 'createReservation' || action === 's6792596_fancita_rezervation_supabase') {
          webhookId = 's6792596';
        } else if (action === 'createOrder' || action === 's6798488_fancita_order_supabase') {
          webhookId = 's6798488';
        }
        console.log('🔄 Using webhook ID:', webhookId, 'for action:', action);
        result = await callMakeWebhook(webhookId, data);
      }
    }

    // Special handling for availability check - parse the result properly
    if (action === 's7260221_check_availability' && result) {
      console.log('[mcp] 🔧 Processing availability check result:', result);
      
      // Check if result has content array (generic MCP response)
      if (result.content && Array.isArray(result.content)) {
        console.log('[mcp] 🔍 Analyzing MCP content array:', result.content);
        
        // Look for actual JSON data in the content
        for (const item of result.content) {
          console.log('[mcp] 🔍 Processing content item:', item);
          
          if (item.type === 'text' && item.text) {
            console.log('[mcp] 🔍 Found text content:', item.text);
            console.log('[mcp] 🔍 Text length:', item.text.length);
            console.log('[mcp] 🔍 Text type:', typeof item.text);
            
            try {
              // Try to parse the text as JSON (Make.com result)
              let parsedResult = JSON.parse(item.text);
              console.log('[mcp] 🔍 Successfully parsed JSON:', parsedResult);
              
              // Check if it's a Make.com wrapper with "Result" field containing escaped JSON
              if (parsedResult.Result && typeof parsedResult.Result === 'string') {
                console.log('[mcp] 🔍 Found Make.com Result wrapper, parsing inner JSON...');
                parsedResult = JSON.parse(parsedResult.Result);
                console.log('[mcp] 🔍 Successfully parsed inner JSON:', parsedResult);
              }
              
              if (parsedResult.status && parsedResult.hasOwnProperty('available')) {
                console.log('[mcp] 🔧 Found Make.com availability result:', parsedResult);
                return NextResponse.json({
                  success: true,
                  data: parsedResult,
                  mode: mcpClient ? 'mcp' : 'fallback'
                });
              } else if (parsedResult.status) {
                // Even if no 'available' property, if it has status, it might be valid
                console.log('[mcp] 🔧 Found Make.com result with status:', parsedResult);
                return NextResponse.json({
                  success: true,
                  data: parsedResult,
                  mode: mcpClient ? 'mcp' : 'fallback'
                });
              }
            } catch (parseError) {
              console.log('[mcp] 🔍 Text is not JSON, content:', item.text);
              
              // If it's not JSON, check if it's the success message
              if (item.text === 'Scenario executed successfully.') {
                console.log('[mcp] ⚠️ Make.com scenario executed but no result data found');
                // Return a basic success response
                return NextResponse.json({
                  success: true,
                  data: {
                    status: 'ok',
                    available: true,
                    message: 'Scenario executed but no detailed data available'
                  },
                  mode: mcpClient ? 'mcp' : 'fallback'
                });
              }
            }
          }
        }
      }
      
      // If result is already in the correct format (direct from Make.com)
      if (result.status && result.hasOwnProperty('available')) {
        console.log('[mcp] 🔧 Direct Make.com availability result:', result);
        return NextResponse.json({
          success: true,
          data: result,
          mode: mcpClient ? 'mcp' : 'fallback'
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      mode: mcpClient ? 'mcp' : 'fallback'
    });
  } catch (error) {
    console.error('MCP API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: mcpClient ? 'mcp' : 'fallback'
      },
      { status: 500 }
    );
  }
}
