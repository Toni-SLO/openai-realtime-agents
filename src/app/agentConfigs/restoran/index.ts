import { greeterAgent } from './greeter';
import { reservationAgent } from './reservation';
import { orderAgent } from './order';
import { handoffAgent } from './handoff';

// Connect agents with handoffs
greeterAgent.handoffs = [reservationAgent, orderAgent, handoffAgent];
reservationAgent.handoffs = [greeterAgent, orderAgent, handoffAgent];
orderAgent.handoffs = [greeterAgent, reservationAgent, handoffAgent];
handoffAgent.handoffs = [greeterAgent, reservationAgent, orderAgent];

export const restoranScenario = [
  greeterAgent,
  reservationAgent,
  orderAgent,
  handoffAgent,
];

// Company name for guardrails
export const restoranCompanyName = 'Restoran Fančita';
