import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { FANCITA_HANDOFF_INSTRUCTIONS, replaceInstructionVariables } from '../shared/instructions';
// Odstranjeno: neposreden uvoz twilioClient v agentskem (lahko konča v client bundle)
// Twilio klice izvedemo preko API route, ne neposredno prek SDK v clientskem kontekstu

export const handoffAgent = new RealtimeAgent({
  name: 'handoff',
  voice: 'marin',
  handoffDescription: 'Agent that handles complex cases and transfers calls to restaurant staff.',

  instructions: FANCITA_HANDOFF_INSTRUCTIONS,

  tools: [
    tool({
      name: 'transfer_to_staff',
      description: 'Transfer the call to restaurant staff with problem summary',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          guest_number: {
            type: 'string',
            description: 'Guest phone number to transfer from',
          },
          problem_summary: {
            type: 'string',
            description: 'Brief summary of the guest problem/request',
          },
          staff_number: {
            type: 'string',
            description: 'Staff phone number to transfer to',
            default: '+38640341045',
          },
        },
        required: ['guest_number', 'problem_summary'],
      },
      execute: async (input: any) => {
        try {
          const staffNumber = input.staff_number || '+38640341045';
          const problemSummary = input.problem_summary || 'Guest transfer request';

          console.log(`Transferring call from ${input.guest_number} to ${staffNumber}`);
          console.log(`Problem summary: ${problemSummary}`);

          // First call staff to inform them about the incoming transfer
          const staffCallRes = await fetch('/api/twilio/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              to: staffNumber, 
              from: '+385528940001', // Restaurant main number
              message: `Incoming transfer - Guest problem: ${problemSummary}. Press 1 to accept transfer.`
            }),
          } as any);
          
          if (!staffCallRes.ok) {
            const text = await staffCallRes.text();
            throw new Error(`Staff notification failed: ${staffCallRes.status} ${text}`);
          }

          // Wait a moment for staff to answer, then transfer the guest
          setTimeout(async () => {
            try {
              const guestTransferRes = await fetch('/api/twilio/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  to: staffNumber, 
                  from: input.guest_number,
                  conference: true // Enable conference to connect both parties
                }),
              } as any);
            } catch (e) {
              console.error('Guest transfer failed:', e);
            }
          }, 3000); // 3 second delay

          return {
            success: true,
            data: { 
              staff_number: staffNumber, 
              guest_number: input.guest_number,
              problem_summary: problemSummary
            },
            message: `Staff notified about: ${problemSummary}. Transferring guest now.`,
          };
        } catch (error: any) {
          console.error('Call transfer failed:', error);
          return {
            success: false,
            error: error.message,
            message: 'Call transfer failed, please try again',
          };
        }
      },
    }),

    // Hangup tool za zdaj odstranjen; lahko ga dodamo nazaj po potrebi
  ],

  handoffs: [], // No further handoffs from this agent
});
