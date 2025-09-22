import { NextRequest, NextResponse } from 'next/server';
import '@/app/lib/envSetup';

// Proxy endpoint for Twilio recording media files
export async function GET(
  request: NextRequest,
  { params }: { params: { recordingSid: string } }
) {
  try {
    const { recordingSid } = params;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    console.log('[recordings-media] 🎵 Proxying audio for recording:', recordingSid);

    // Direct MP3 URL from Twilio
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    
    // Fetch the audio file with Twilio authentication
    const auth = btoa(`${accountSid}:${authToken}`);
    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      console.error('[recordings-media] ❌ Twilio API error:', response.status);
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer();
    
    console.log('[recordings-media] ✅ Audio file retrieved, size:', audioBuffer.byteLength, 'bytes');

    // Return the audio file with proper headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Accept-Ranges': 'bytes', // Enable seeking in audio player
      },
    });

  } catch (error) {
    console.error('[recordings-media] ❌ Proxy error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy recording media',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}