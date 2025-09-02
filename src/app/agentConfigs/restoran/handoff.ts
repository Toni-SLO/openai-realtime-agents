import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { twilioClient } from '@/app/lib/twilioClient';

export const handoffAgent = new RealtimeAgent({
  name: 'handoff',
  voice: 'sage',
  handoffDescription: 'Agent that handles complex cases and transfers calls to restaurant staff.',

  instructions: `
# Fančita Handoff Agent

## 0) Sistem & konstante
- \`tel\` vedno = \`{{system__caller_id}}\`
- \`source_id\` vedno = \`{{system__conversation_id}}\`

## 1) Osebnost in stil
- Ti si **Maja**, prijazna asistentka restavracije Fančita v Vrsarju.
- Vikanje, topel ton, pomirjujoč.

## 2) Namen
- Obravnavam kompleksne primere ki jih drugi agenti ne morejo rešiti
- Pomagam jeznim ali frustriranim gostom
- Prenos klicev na osebje restavracije

## 3) Handoff procedura
Če gost želi govoriti z osebjem ali se pogovor preveč zaplete:
1. Rekni: »Spojim vas s kolegom iz Fančite. Samo trenutak.«
2. Počakaj 3 sekunde
3. Pokliči Twilio tool za prenos klica na \`+386 40 341 045\`
4. Če prenos uspe: »Prenos je uspešen. Lahko govorite z našim osebjem.«

## 4) Validacije
- Vedno preveri ali imaš veljavno telefonsko številko gosta
- Če Twilio klic ne uspe → ponovi ali obvesti gosta o težavi

## 5) Pomirjanje
- Bodite empatični do jezih gostov
- Poslušajte njihove težave
- Ponudite hitro rešitev ali prenos
`,

  tools: [
    tool({
      name: 'transfer_to_staff',
      description: 'Transfer the call to restaurant staff using Twilio',
      parameters: {
        type: 'object',
        properties: {
          guest_number: {
            type: 'string',
            description: 'Guest phone number to transfer from',
          },
          staff_number: {
            type: 'string',
            description: 'Staff phone number to transfer to',
            default: '+38640341045',
          },
          reason: {
            type: 'string',
            description: 'Reason for transfer (optional)',
          },
        },
        required: ['guest_number'],
      },
      execute: async (input: any) => {
        try {
          const staffNumber = input.staff_number || '+38640341045';

          console.log(`Transferring call from ${input.guest_number} to ${staffNumber}`);

          const result = await twilioClient.transferCall(input.guest_number, staffNumber);

          return {
            success: true,
            call_sid: result.sid,
            status: result.status,
            message: 'Call transfer initiated successfully',
          };
        } catch (error) {
          console.error('Call transfer failed:', error);
          return {
            success: false,
            error: error.message,
            message: 'Call transfer failed, please try again',
          };
        }
      },
    }),

    tool({
      name: 'hangup_call',
      description: 'Hang up the current call',
      parameters: {
        type: 'object',
        properties: {
          call_sid: {
            type: 'string',
            description: 'Twilio call SID to hang up',
          },
        },
        required: ['call_sid'],
      },
      execute: async (input: any) => {
        try {
          const result = await twilioClient.hangupCall(input.call_sid);

          return {
            success: true,
            message: 'Call ended successfully',
          };
        } catch (error) {
          console.error('Call hangup failed:', error);
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),
  ],

  handoffs: [], // No further handoffs from this agent
});
