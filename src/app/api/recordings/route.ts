import { NextRequest, NextResponse } from 'next/server';
import '@/app/lib/envSetup';

// Get recordings for a specific call or all recordings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const callSid = searchParams.get('callSid');
    const limit = searchParams.get('limit') || '50';

    console.log('[recordings-api] 🔍 Request for callSid:', callSid);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    // Build Twilio API URL - always get all recordings first
    let url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings.json?Limit=${limit}`;

    // Make request to Twilio API
    const auth = btoa(`${accountSid}:${authToken}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter recordings if callSid is provided
    let filteredRecordings = data.recordings;
    if (callSid) {
      // Try exact match first
      filteredRecordings = data.recordings.filter((recording: any) => recording.call_sid === callSid);
      
      // If no exact match, try partial match (session ID might be part of call SID)
      if (filteredRecordings.length === 0) {
        filteredRecordings = data.recordings.filter((recording: any) => 
          recording.call_sid.includes(callSid) || callSid.includes(recording.call_sid.slice(-8))
        );
      }
      
      // If still no match, try time-based matching for OpenAI Realtime session IDs
      if (filteredRecordings.length === 0 && callSid.startsWith('rtc_')) {
        console.log('[recordings-api] 🕐 Trying time-based matching for OpenAI session:', callSid);
        
        // Try to find transcript file to get timestamp
        try {
          const fs = require('fs');
          const path = require('path');
          const transcriptPath = path.join(process.cwd(), 'server', 'logs', 'transcripts', `${callSid}.log`);
          
          if (fs.existsSync(transcriptPath)) {
            const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');
            const firstLine = transcriptContent.split('\n')[0];
            const timestampMatch = firstLine.match(/\[([^\]]+)\]/);
            
            if (timestampMatch) {
              const transcriptTime = new Date(timestampMatch[1]);
              console.log('[recordings-api] 📅 Transcript time:', transcriptTime.toISOString());
              
              // Find recordings within 2 minutes of transcript time
              filteredRecordings = data.recordings.filter((recording: any) => {
                const recordingTime = new Date(recording.date_created);
                const timeDiff = Math.abs(recordingTime.getTime() - transcriptTime.getTime());
                const withinRange = timeDiff <= 120000; // 2 minutes in milliseconds
                
                if (withinRange) {
                  console.log('[recordings-api] ✅ Time match found:', recording.call_sid, 'diff:', timeDiff + 'ms');
                }
                
                return withinRange;
              });
            }
          }
        } catch (error) {
          console.error('[recordings-api] ❌ Time-based matching failed:', error);
        }
      }
    }
    
    console.log('[recordings-api] 📊 Found recordings:', data.recordings?.length || 0);
    if (callSid) {
      console.log('[recordings-api] 🔍 Searching for callSid:', callSid);
      console.log('[recordings-api] 📋 Available call SIDs:', data.recordings?.map((r: any) => r.call_sid) || []);
      console.log('[recordings-api] 🎯 Filtered recordings:', filteredRecordings?.length || 0);
    }
    
    // Transform recordings data
    const recordings = filteredRecordings.map((recording: any) => ({
      sid: recording.sid,
      callSid: recording.call_sid,
      duration: recording.duration,
      dateCreated: recording.date_created,
      // Proxy URL for in-app audio playback (avoids CORS issues)
      downloadUrl: `/api/recordings/media/${recording.sid}`,
      // Direct Twilio URL for external download
      directDownloadUrl: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recording.sid}.mp3`,
      // Twilio Console URL for easy access
      twilioConsoleUrl: `https://console.twilio.com/us1/monitor/logs/calls/${recording.call_sid}`,
      // Recording details URL - pravilni format za call-recordings pogled
      recordingDetailsUrl: `https://console.twilio.com/us1/monitor/logs/call-recordings?frameUrl=%2Fconsole%2Fvoice%2Frecordings%2Frecording-logs%2F${recording.sid}%3F__override_layout__%3Dembed%26bifrost%3Dtrue%26x-target-region%3Dus1&currentFrameUrl=%2Fconsole%2Fvoice%2Frecordings%2Frecording-logs%2F${recording.sid}%3F__override_layout__%3Dembed%26x-target-region%3Dus1%26bifrost%3Dtrue`,
      // Alternativni krajši URL
      recordingSimpleUrl: `https://console.twilio.com/us1/monitor/logs/recordings/${recording.sid}`
    }));

    return NextResponse.json({
      success: true,
      recordings: recordings,
      total: recordings.length
    });

  } catch (error) {
    console.error('Get recordings error:', error);
    return NextResponse.json({ 
      error: 'Failed to get recordings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
