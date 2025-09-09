import dotenv from 'dotenv';

// GPT Realtime Model Configuration
export const GPT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';

// Strežniško nalaganje .env (brez odvisnosti od 'fs', varno za bundler)
dotenv.config({ path: '.env' });