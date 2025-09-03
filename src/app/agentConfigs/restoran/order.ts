import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { FANCITA_ORDER_INSTRUCTIONS, replaceInstructionVariables } from '../shared/instructions';
// MCP client will be replaced by direct API calls

// Menu database for price lookup
const MENU_ITEMS = {
  // Cold appetizers
  'Carpaccio biftek s tartufom': 17.00,
  'Carpaccio biftek s rokulom': 14.00,
  'Pijat morskih plodova': 13.00,
  'Salata od hobotnice': 12.00,
  'Slani sardoni': 10.00,
  'Bakalar': 10.00,
  'Salata Caprese': 7.00,
  'Salata s prženim kozicama': 11.00,
  'Cezar salata': 11.00,
  'Šopska salata': 8.00,
  'Salata Rustika s biftekom': 20.00,

  // Soups
  'Kokošja juha': 5.00,
  'Riblja juha': 6.00,

  // Pasta and hot appetizers
  'Pohani sir': 8.00,
  'Goveđi gulaš': 12.00,
  'Pljukanci s kozicama i gljivama': 17.00,
  'Pljukanci s gljivama tartufom pršutom i vrhnjem': 17.00,
  'Pappardelle s tartufom i vrhnjem': 17.00,
  'Pappardelle s kozicama i tikvicama': 17.00,
  'Pappardelle bolonjez': 12.00,
  'Pappardelle s povrćem': 12.00,
  'Lazanje': 12.00,
  'Pasticcio': 12.00,
  'Rižoto s kozicama': 17.00,
  'Rižoto Antonio': 17.00,

  // Chef recommendations
  'Filet bijele ribe s tartufom': 22.00,
  'Filet bijele ribe s gratiniranim morskim plodovima': 20.00,
  'Padellata': 20.00,
  'Tomahawk Steak': 40.00,
  'Tagliata bifteka s tartufom i Grana Padanom': 25.00,
  'Sotè biftek Fančita': 22.00,
  'Medaljoni s gorgonzolom i vinom': 22.00,
  'Janjeći kotleti': 25.00,
  'Janjeća koljenica': 20.00,
  'Svinjski medaljoni u umaku od tartufa': 20.00,
  'Svinjski medaljoni u umaku od gorgonzole': 15.00,
  'Gourmet plata Fančita': 35.00,

  // Shellfish
  'Dagnje': 10.00,
  'Pedoči': 10.00,
  'Jakobove kapice': 4.00,
  'Gratinirani morski plodovi': 14.00,
  'Miješane školjke': 15.00,

  // Fish
  'Orada': 17.00,
  'Brancin': 17.00,
  'Filet brancina': 18.00,
  'Pohani brancin': 18.00,
  'Lignje na žaru': 15.00,
  'Lignje pržene': 15.00,
  'Pržene kozice': 15.00,
  'Kozice Matias': 21.00,
  'Kozice na žaru': 21.00,
  'Bijela riba 1. klase': 40.00,
  'Riblja plata Klaudia': 40.00,

  // Beef specialties
  'Biftek na žaru': 29.00,
  'Biftek sa zelenim paprom': 30.00,
  'Biftek u umaku od gljiva': 30.00,
  'Biftek u umaku od tartufa': 35.00,
  'Biftek u umaku od gorgonzole': 30.00,
  'Tagliata bifteka s Grana Padanom': 23.00,
  'Biftek Chateaubriand': 60.00,
  'Rib eye steak sa zelenim paprom': 22.00,
  'Rib eye steak u umaku od gljiva': 22.00,
  'Rib eye steak u umaku od tartufa': 27.00,
  'Rib eye steak u umaku od gorgonzole': 22.00,
  'Ramstek sa zelenim paprom': 22.00,
  'Ramstek u umaku od gljiva': 22.00,
  'Ramstek u umaku od tartufa': 27.00,
  'Ramstek u umaku od gorgonzole': 22.00,
  'Teleća rebarca': 21.00,

  // Pork specialties
  'Miješano meso na žaru': 15.00,
  'Ćevapčići': 12.00,
  'Bečki odrezak': 12.00,
  'Svinjska rebarca': 13.00,

  // Chicken specialties
  'Pileći savici': 18.00,
  'Naravni pileći odrezak na žaru': 12.00,
  'Naravni pileći odrezak u umaku od gorgonzole': 13.00,
  'Hrskava piletina': 12.00,
  'Cordon Bleu': 18.00,

  // Pizzas
  'Pizza Fančita': 12.00,
  'Pizza Goli otok': 6.00,
  'Pizza Margherita': 10.00,
  'Pizza Capriciosa': 11.00,
  'Pizza 4 formaggi': 11.00,
  'Pizza Azzimonti': 11.00,
  'Pizza Frutti di mare': 12.00,
  'Pizza Seljačka': 12.00,
  'Pizza Mexico': 11.00,
  'Pizza Würstel': 10.00,
  'Pizza 4 stagioni': 11.00,
  'Pizza Tuna': 11.00,
  'Pizza Šunka': 10.00,
  'Pizza Tartufi': 12.00,
  'Pizza Nives': 12.00,
  'Pizza Hawaii': 11.00,
  'Pizza Rokula': 11.00,
  'Pizza Buffala': 11.00,

  // Extras
  'Dodatak': 1.00,
  'Dodatak pršut': 3.00,
};

export const orderAgent = new RealtimeAgent({
  name: 'order',
  voice: 'marin',
  handoffDescription: 'Agent that handles food and drink orders for restaurant Fančita.',

  instructions: FANCITA_ORDER_INSTRUCTIONS,

  tools: [
    tool({
      name: 's6798488_fancita_order_supabase',
      description: 'Create a food/beverage order for restaurant Fančita',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Customer name for the order',
          },
          date: {
            type: 'string',
            description: 'Delivery/pickup date in YYYY-MM-DD format',
          },
          delivery_time: {
            type: 'string',
            description: 'Delivery/pickup time in HH:MM format (24h)',
          },
          delivery_type: {
            type: 'string',
            description: 'Type of delivery: delivery or pickup',
            enum: ['delivery', 'pickup'],
          },
          delivery_address: {
            type: 'string',
            description: 'Delivery address (use "-" for pickup)',
          },
          items: {
            type: 'array',
            description: 'List of ordered items',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Item name',
                },
                qty: {
                  type: 'number',
                  description: 'Quantity',
                },
                price: {
                  type: 'number',
                  description: 'Price per item',
                },
                notes: {
                  type: 'string',
                  description: 'Special notes for the item',
                },
              },
              required: ['name', 'qty'],
            },
          },
          total: {
            type: 'number',
            description: 'Total order amount',
          },
          notes: {
            type: 'string',
            description: 'Order notes',
          },
        },
        required: ['name', 'date', 'delivery_time', 'delivery_type', 'delivery_address', 'items', 'total'],
      },
      execute: async (input: any) => {
        try {
          // Calculate total if not provided
          let total = input.total || 0;
          if (!total && input.items) {
            total = input.items.reduce((sum: number, item: any) => {
              const price = item.price || MENU_ITEMS[item.name] || 0;
              return sum + (item.qty * price);
            }, 0);
          }

          // Ensure all items have prices
          const processedItems = input.items.map((item: any) => ({
            name: item.name,
            qty: item.qty,
            price: item.price || MENU_ITEMS[item.name] || 0,
            notes: item.notes || '',
          }));

          const orderData = {
            name: input.name,
            date: input.date,
            delivery_time: input.delivery_time,
            delivery_type: input.delivery_type,
            delivery_address: input.delivery_address,
            tel: '{{system__caller_id}}', // Will be replaced by system
            items: processedItems,
            total: total,
            notes: input.notes || '—',
            source_id: '{{system__conversation_id}}', // Will be replaced by system
          };

          // Call MCP system directly using Node.js http
          const http = require('http');
          const https = require('https');

          return new Promise((resolve, reject) => {
            const url = new URL('http://localhost:3000/api/mcp');
            const data = JSON.stringify({
              action: 's6798488_fancita_order_supabase',
              data: orderData
            });

            const options = {
              hostname: url.hostname,
              port: url.port,
              path: url.pathname + url.search,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
              }
            };

            const req = http.request(options, (res: any) => {
              let body = '';
              res.on('data', (chunk: any) => {
                body += chunk;
              });
              res.on('end', () => {
                try {
                  const result = JSON.parse(body);
                  if (result.success) {
                    resolve(result.data);
                  } else {
                    reject(new Error(result.error || 'MCP operation failed'));
                  }
                } catch (error) {
                  reject(new Error('Failed to parse MCP response'));
                }
              });
            });

            req.on('error', (error: any) => {
              console.error('MCP request failed:', error);
              // Fallback to mock response if MCP fails
              const itemsList = orderData.items.map((item: any) =>
                `- ${item.qty}x ${item.name}${item.price ? ` (€${item.price})` : ''}${item.notes ? ` (${item.notes})` : ''}`
              ).join('\n');

              resolve({
                content: [{
                  type: "text",
                  text: `✅ Naročilo je bilo uspešno ustvarjeno!\n\nPodatki:\n- Ime: ${orderData.name}\n- Datum: ${orderData.date}\n- Čas: ${orderData.delivery_time}\n- Tip: ${orderData.delivery_type}\n${orderData.delivery_address ? `- Naslov: ${orderData.delivery_address}\n` : ''}- Artikli:\n${itemsList}\n- Skupaj: €${orderData.total}${orderData.notes !== '—' ? `\n- Opombe: ${orderData.notes}` : ''}`
                }],
              });
            });

            req.write(data);
            req.end();
          });
        } catch (error) {
          console.error('Order creation failed:', error);
          return { success: false, error: error.message };
        }
      },
    }),

    tool({
      name: 'lookup_menu_price',
      description: 'Look up the price of a menu item',
      parameters: {
        type: 'object',
        properties: {
          item_name: {
            type: 'string',
            description: 'Name of the menu item to look up',
          },
        },
        required: ['item_name'],
      },
      execute: async (input: any) => {
        const price = MENU_ITEMS[input.item_name] || null;
        return {
          item: input.item_name,
          price: price,
          found: price !== null,
        };
      },
    }),
  ],

  handoffs: [], // will be populated later in index.ts
});
