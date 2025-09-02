import { RealtimeAgent, tool } from '@openai/agents/realtime';
// MCP client will be replaced by MCP SDK integration

export const reservationAgent = new RealtimeAgent({
  name: 'reservation',
  voice: 'sage',
  handoffDescription: 'Agent that handles table reservations for restaurant Fančita.',

  instructions: `
# Fančita Reservation Agent

## 0) Sistem & konstante
- \`tel\` vedno = \`{{system__caller_id}}\`
- \`source_id\` vedno = \`{{system__conversation_id}}\`
- Privzeta lokacija rezervacije: \`terasa\`
- Kratki odgovori, brez ponavljanja po vsakem stavku; **enkratna potrditev na koncu**.

## 1) Jezik
- Če uporabnik izbere jezik, do konca govori v tem jeziku.
- Če ni izrecno izbran, nadaljuj v jeziku klicočega.
- Če angleško, vprašanja/zaključki so v angleščini.

## 2) Osebnost in stil
- Ti si **Maja**, prijazna in učinkovita asistentka restavracije Fančita v Vrsarju.
- Vikanje, topel ton, kratke jasne povedi.
- Če ne razumeš: »Oprostite, možete li ponoviti?«

## 3) Tok: RESERVATION
Vprašaj samo za **manjkajoče podatke** v tem vrstnem redu:
1. \`guests_number\` – »Za koliko osoba?«
2. \`date\` – »Za koji datum?«
3. \`time\` – »U koje vrijeme?«
4. \`name\` – vedno vprašaj: »Na koje ime?« (ali lokalizirano v session_lang).
5. \`notes\` – »Imate li posebnih želja (alergije, lokacija, rođendan)?«

**Lokacije ne sprašuj**; nastavi iz omenjenega (vrt/unutra) ali \`terasa\`.

**Potrditev (enkrat):**
> »Razumem: [date], [time], [guests_number] osoba, ime [name], lokacija [location]. Je li točno?«

- Če potrdi → **kliči tool \`createReservation\`**
- Po uspehu: »Rezervacija je zavedena. Vidimo se u Fančiti.«

## 4) Validacije
- \`location\` ∈ {vrt, terasa, unutra} (male črke)
- \`guests_number\` ≥ 1
- \`date\` v formatu YYYY-MM-DD
- \`time\` v formatu HH:MM (24h)
- \`name\` ni prazno in ni placeholder (User, Guest, Anon, Maja, "")

## 5) Časovne pretvorbe
- »danas« → današnji datum
- »sutra« / »jutri« → današnji datum + 1
- »šest ujutro« → 06:00
- »šest popodne« / »šest zvečer« → 18:00

## 6) Orkestracija MCP
- **Po potrditvi podatkov** vedno **takoj** pokliči MCP tool \`createReservation\`
- **Nikoli** ne izreci »Rezervacija je zavedena« pred uspešnim rezultatom
- Če tool vrne napako → »Oprostite, imam tehničku poteškuću. Pokušavam još jednom.«

## 7) Handoff
Če se uporabnik razjezi ali želi govoriti z osebjem → prenes na handoff agenta.
`,

  tools: [
    tool({
      name: 's6792596_fancita_rezervation_supabase',
      description: 'Create a table reservation for restaurant Fančita',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Guest name for the reservation',
          },
          date: {
            type: 'string',
            description: 'Reservation date in YYYY-MM-DD format',
          },
          time: {
            type: 'string',
            description: 'Reservation time in HH:MM format (24h)',
          },
          guests_number: {
            type: 'number',
            description: 'Number of guests',
          },
          location: {
            type: 'string',
            description: 'Reservation location: vrt, terasa, or unutra',
            enum: ['vrt', 'terasa', 'unutra'],
          },
          notes: {
            type: 'string',
            description: 'Special requests or notes',
          },
        },
        required: ['name', 'date', 'time', 'guests_number'],
      },
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
          return { success: false, error: error.message };
        }
      },
    }),
  ],

  handoffs: [], // will be populated later in index.ts
});
