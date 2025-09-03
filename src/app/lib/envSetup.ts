import dotenv from 'dotenv';

// Strežniško nalaganje .env (brez odvisnosti od 'fs', varno za bundler)
dotenv.config({ path: '.env' });