import { greeterAgent } from './greeter';
import { reservationAgent } from './reservation';
import { orderAgent } from './order';
import { handoffAgent } from './handoff';
import { unifiedRestoranAgent } from './unified';

// Multi-agent scenario (legacy)
greeterAgent.handoffs = [reservationAgent, orderAgent, handoffAgent];
reservationAgent.handoffs = [greeterAgent, orderAgent, handoffAgent];
orderAgent.handoffs = [greeterAgent, reservationAgent, handoffAgent];
handoffAgent.handoffs = [greeterAgent, reservationAgent, orderAgent];

const multiAgentScenario = [
  greeterAgent,
  reservationAgent,
  orderAgent,
  handoffAgent,
];

// Single unified agent scenario (recommended)
const unifiedScenario = [
  unifiedRestoranAgent,
];

// Export unified by default, multi-agent for backward compatibility
export const restoranScenario = process.env.USE_MULTI_AGENT === 'true' 
  ? multiAgentScenario 
  : unifiedScenario;

// Company name for guardrails
export const restoranCompanyName = 'Restoran Fančita';
