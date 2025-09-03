import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node ESM loader so we can import TypeScript files (agent configs)
register('ts-node/esm', pathToFileURL('./'));

// Start the Agents bridge
import './twilio-bridge.mjs';


