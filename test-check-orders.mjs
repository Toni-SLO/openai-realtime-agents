#!/usr/bin/env node

/**
 * Test skripta za s7355981_check_orders MCP tool
 * Testira kako podatki prihajajo iz Make.com
 */

import fetch from 'node-fetch';

const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000';

async function testCheckOrders() {
  console.log('🧪 TESTING s7355981_check_orders MCP tool');
  console.log('=' .repeat(50));
  
  try {
    console.log('📡 Calling MCP API...');
    const response = await fetch(`${NEXTJS_API_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 's7355981_check_orders',
        data: {}
      })
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('\n🔍 FULL RESPONSE:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.data && result.data.content) {
      console.log('\n📋 MCP CONTENT:');
      result.data.content.forEach((item, index) => {
        console.log(`Item ${index}:`, JSON.stringify(item, null, 2));
      });
      
      // Poskusi parsirati podatke
      if (result.data.content[0] && result.data.content[0].text) {
        console.log('\n🔧 PARSING TEXT:');
        const text = result.data.content[0].text;
        console.log('Raw text:', text);
        
        try {
          const parsed = JSON.parse(text);
          console.log('Parsed JSON:', parsed);
          
          console.log('\n✅ EXTRACTED DATA:');
          console.log(`Pickup orders: ${parsed.pickup || 'N/A'}`);
          console.log(`Delivery orders: ${parsed.delivery || 'N/A'}`);
          
          // Test ETA calculation
          console.log('\n🕐 ETA CALCULATION TEST:');
          const pickup = parsed.pickup || 0;
          const delivery = parsed.delivery || 0;
          
          // Pickup ETA
          let eta_pickup_min;
          if (pickup <= 5) {
            eta_pickup_min = 20; // count_0_5_min
          } else {
            eta_pickup_min = 30; // count_gt_5_min
          }
          
          // Delivery ETA  
          let eta_delivery_min;
          if (delivery === 0) {
            eta_delivery_min = 15; // count_0_min
          } else if (delivery === 1) {
            eta_delivery_min = 20; // count_1_min
          } else if (delivery >= 2 && delivery <= 3) {
            eta_delivery_min = 30; // range_2_3_min
          } else {
            eta_delivery_min = 45; // range_gt_3_min
          }
          
          console.log(`📊 Current orders: pickup=${pickup}, delivery=${delivery}`);
          console.log(`⏰ Calculated ETA: pickup=${eta_pickup_min}min, delivery=${eta_delivery_min}min`);
          
        } catch (parseError) {
          console.log('❌ Failed to parse as JSON:', parseError.message);
        }
      }
    } else {
      console.log('❌ Unexpected response structure');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testCheckOrders();
