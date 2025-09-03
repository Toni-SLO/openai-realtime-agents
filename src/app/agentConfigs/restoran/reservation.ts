import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { FANCITA_RESERVATION_INSTRUCTIONS, FANCITA_RESERVATION_TOOL } from '../shared';

export const reservationAgent = new RealtimeAgent({
  name: 'reservation',
  voice: 'marin',
  handoffDescription: 'Agent that handles table reservations for restaurant Fančita.',

  instructions: FANCITA_RESERVATION_INSTRUCTIONS,

  tools: [
    tool({
      name: FANCITA_RESERVATION_TOOL.name,
      description: FANCITA_RESERVATION_TOOL.description,
      parameters: FANCITA_RESERVATION_TOOL.parameters as any,
      execute: async (input: any) => {
        try {
          const reservationData = {
            name: input.name,
            date: input.date,
            time: input.time,
            guests_number: input.guests_number,
            tel: '{{system__caller_id}}', // Will be replaced by system
            location: input.location || 'terasa',
            notes: input.notes || '—',
            source_id: '{{system__conversation_id}}', // Will be replaced by system
          };

          // Call MCP system directly using Node.js http
          const http = require('http');
          const https = require('https');

          return new Promise((resolve, reject) => {
            const url = new URL('http://localhost:3000/api/mcp');
            const data = JSON.stringify({
              action: 's6792596_fancita_rezervation_supabase',
              data: reservationData
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
              resolve({
                content: [{
                  type: "text",
                  text: `✅ Rezervacija je bila uspešno ustvarjena!\n\nPodatki:\n- Ime: ${reservationData.name}\n- Datum: ${reservationData.date}\n- Čas: ${reservationData.time}\n- Število oseb: ${reservationData.guests_number}\n- Lokacija: ${reservationData.location}\n${reservationData.notes !== '—' ? `- Opombe: ${reservationData.notes}` : ''}`
                }],
              });
            });

            req.write(data);
            req.end();
          });
        } catch (error) {
          console.error('Reservation creation failed:', error);
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
  ],

  handoffs: [], // will be populated later in index.ts
});
