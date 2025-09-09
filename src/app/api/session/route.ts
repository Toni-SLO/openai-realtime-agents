import { NextResponse } from "next/server";
import * as dotenv from "dotenv";
import * as path from "path";

export async function GET() {
  try {
    // FORCE load .env.local and .env files
    console.log("[session] 🚨 FORCE LOADING ENV FILES");
    const projectRoot = process.cwd();
    const envLocalPath = path.join(projectRoot, '.env.local');
    const envPath = path.join(projectRoot, '.env');
    
    console.log(`[session] 📂 Loading from: ${envLocalPath}`);
    console.log(`[session] 📂 Loading from: ${envPath}`);
    
    dotenv.config({ path: envLocalPath, override: true });
    dotenv.config({ path: envPath });
    
    // Debug environment variables  
    const modelToUse = process.env.OPENAI_REALTIME_MODEL || process.env.GPT_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-10-01";
    console.log("[session] 🔧 Environment check:");
    console.log(`[session] 🔑 API Key: ${process.env.OPENAI_API_KEY ? 'SET (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : 'MISSING'}`);
    console.log(`[session] 🔑 API Key FULL LENGTH: ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length + ' chars' : 'MISSING'}`);
    console.log(`[session] 🧪 TEST_VAR: ${process.env.TEST_VAR || 'NOT_SET'}`);
    console.log(`[session] 🤖 Model: ${modelToUse}`);
    console.log(`[session] 🔍 OPENAI_REALTIME_MODEL: ${process.env.OPENAI_REALTIME_MODEL || 'NOT_SET'}`);
    console.log(`[session] 🔍 GPT_REALTIME_MODEL: ${process.env.GPT_REALTIME_MODEL || 'NOT_SET'}`);
    console.log(`[session] 📂 ENV FILES CHECK - cwd: ${process.cwd()}`);
    
    if (!process.env.OPENAI_API_KEY) {
      console.error("[session] ❌ OPENAI_API_KEY is missing!");
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelToUse,
        }),
      }
    );
    
    console.log(`[session] 📡 OpenAI API response status: ${response.status}`);
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("[session] ❌ OpenAI API error:", data);
      return NextResponse.json(
        { error: "OpenAI API error", details: data },
        { status: response.status }
      );
    }
    
    console.log("[session] ✅ Session created successfully");
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
