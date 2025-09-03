import { NextRequest, NextResponse } from 'next/server';
import '@/app/lib/envSetup';
import { twilioClient } from '@/app/lib/twilioClient';

// Handle incoming calls from Twilio
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    console.log('Twilio webhook received:', body);

    // Parse the form data
    const params = new URLSearchParams(body);
    const callData = {
      CallSid: params.get('CallSid'),
      From: params.get('From'),
      To: params.get('To'),
      CallStatus: params.get('CallStatus'),
      Direction: params.get('Direction'),
      FromCity: params.get('FromCity'),
      FromState: params.get('FromState'),
      FromCountry: params.get('FromCountry'),
    };

    console.log('Parsed call data:', callData);

    // Preusmerimo klic na Twilio Media Streams → naš WS endpoint
    const twimlResponse = await twilioClient.handleIncomingCall(callData);

    // Return TwiML response
    return new NextResponse(twimlResponse, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Twilio webhook error:', error);

    // Return error TwiML
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="sl-SI" voice="woman">Žal nam je, prišlo je do tehnične težave. Prosimo, pokličite kasneje.</Say>
        <Hangup/>
    </Response>`;

    return new NextResponse(errorResponse, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}

// Handle GET requests for webhook validation
export async function GET(request: NextRequest) {
  try {
    // Twilio sends a GET request to validate the webhook URL
    console.log('Twilio webhook validation request');

    // Return a simple TwiML response for validation
    const validationResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="sl-SI" voice="woman">Webhook validacija uspešna.</Say>
    </Response>`;

    return new NextResponse(validationResponse, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Twilio webhook validation error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

// Handle call status updates
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Call status update:', body);

    // You can add logic here to handle call status changes
    // e.g., update database, send notifications, etc.

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Call status update error:', error);
    return NextResponse.json({ error: 'Failed to process status update' }, { status: 500 });
  }
}
