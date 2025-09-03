import type { NextConfig } from "next";

// Opomba: Ne uporabljamo nextConfig.env za strežniške skrivnosti (Twilio ipd.).
// Next.js sam naloži .env za strežniški runtime; tako se izognemo statičnemu vbrizgu.
const nextConfig: NextConfig = {};

export default nextConfig;
