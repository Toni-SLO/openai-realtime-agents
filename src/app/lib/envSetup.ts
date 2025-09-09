import dotenv from 'dotenv';

// GPT Realtime Model Configuration
export const GPT_REALTIME_MODEL = process.env.GPT_REALTIME_MODEL || 'gpt-realtime';

// Strežniško nalaganje .env (brez odvisnosti od 'fs', varno za bundler)
dotenv.config({ path: '.env' });