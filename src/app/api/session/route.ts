import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("[session] Using WebSocket with client_secrets (BETA)");
    console.log("[session] API Key:", process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
    console.log("[session] Model:", process.env.GPT_REALTIME_MODEL || "gpt-realtime");
    console.log("[session] TEST_VAR:", process.env.TEST_VAR || 'NOT SET');
    
    if (!process.env.OPENAI_API_KEY) {
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
          "OpenAI-Project": process.env.OPENAI_PROJECT_ID || "",
          "OpenAI-Beta": "realtime=v1",
          Origin: "https://api.openai.com",
        },
        body: JSON.stringify({}),
      }
    );
    
    console.log("[session] Response status:", response.status);
    const data = await response.json();
    
    if (!response.ok) {
      console.error("[session] OpenAI API error:", data);
      return NextResponse.json(
        { error: "OpenAI API error", details: data },
        { status: response.status }
      );
    }
    
    // Normaliziramo na { client_secret: { value } }
    if (data?.client_secret?.value) return NextResponse.json(data);
    if (typeof data?.client_secret === 'string') {
      return NextResponse.json({ client_secret: { value: data.client_secret } });
    }
    if (data?.value) {
      return NextResponse.json({ client_secret: { value: data.value } });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}