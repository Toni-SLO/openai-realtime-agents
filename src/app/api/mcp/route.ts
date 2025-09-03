// MCP API route using proper MCP SDK and AI SDK
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

  // Try different Make.com webhook URL formats
  const possibleUrls = [
    `https://hook.eu2.make.com/${webhookId}`,
    `https://eu2.make.com/hooks/${webhookId}`,
    `https://webhook.eu2.make.com/${webhookId}`,
    `https://hook.eu2.make.com/${webhookId.replace(/\D/g, '')}`,
  ];

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
    name: 's6792596_fancita_rezervation_supabase',
    description: 'Create a table reservation for restaurant Fančita',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Guest name' },
        date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Reservation time (HH:MM)' },
        guests_number: { type: 'number', description: 'Number of guests' },
        location: { type: 'string', description: 'Location: vrt, terasa, unutra' },
        notes: { type: 'string', description: 'Special notes' },
        tel: { type: 'string', description: 'Telephone number' },
        source_id: { type: 'string', description: 'Conversation ID' }
      },
      required: ['name', 'date', 'time', 'guests_number']
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

    // Create SSE transport
    const transport = new SSEClientTransport(new URL(sseUrl));

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

  return NextResponse.json({
    configured: !!process.env.MCP_SERVER_URL,
    serverUrlConfigured: !!process.env.MCP_SERVER_URL,
    mcpConnected: !!mcpClient,
    availableTools: mcpTools.length,
    mode: mcpClient ? 'mcp' : 'fallback',
    testEndpoints: {
      reservation: '/api/mcp?action=test-reservation',
      order: '/api/mcp?action=test-order',
      tools: '/api/mcp?action=tools'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();
    console.log('MCP API called with:', { action, data });

    let result;
    // Map action names to full tool names
    const toolNameMap: { [key: string]: string } = {
      'createReservation': 's6792596_fancita_rezervation_supabase',
      'createOrder': 's6798488_fancita_order_supabase',
      'transfer_to_staff': 'transfer_to_staff',
      // Direct tool name mapping
      's6792596_fancita_rezervation_supabase': 's6792596_fancita_rezervation_supabase',
      's6798488_fancita_order_supabase': 's6798488_fancita_order_supabase'
    };

    const fullToolName = toolNameMap[action] || action;

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
      // Use fallback webhook
      console.log('🔄 Using fallback webhook for:', action);
      let webhookId = 's6798488'; // default to order
      if (action === 'createReservation' || action === 's6792596_fancita_rezervation_supabase') {
        webhookId = 's6792596';
      } else if (action === 'createOrder' || action === 's6798488_fancita_order_supabase') {
        webhookId = 's6798488';
      }
      console.log('🔄 Using webhook ID:', webhookId, 'for action:', action);
      result = await callMakeWebhook(webhookId, data);
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
