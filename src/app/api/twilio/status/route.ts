import { NextRequest, NextResponse } from 'next/server';
import { twilioClient } from '@/app/lib/twilioClient';

// Handle call status updates from Twilio
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    console.log('Twilio status callback received:', body);

    // Parse the form data
    const params = new URLSearchParams(body);
    const statusData = {
      CallSid: params.get('CallSid'),
      CallStatus: params.get('CallStatus'),
      CallDuration: params.get('CallDuration'),
      From: params.get('From'),
      To: params.get('To'),
      Direction: params.get('Direction'),
      Timestamp: new Date().toISOString(),
    };

    console.log('Call status update:', statusData);

    // You can add logic here to:
    // - Update database with call status
    // - Send notifications
    // - Log call analytics
    // - Trigger follow-up actions

    switch (statusData.CallStatus) {
      case 'completed':
        console.log(`Call ${statusData.CallSid} completed successfully`);
        break;
      case 'busy':
        console.log(`Call ${statusData.CallSid} recipient was busy`);
        break;
      case 'no-answer':
        console.log(`Call ${statusData.CallSid} was not answered`);
        break;
      case 'failed':
        console.log(`Call ${statusData.CallSid} failed`);
        break;
      default:
        console.log(`Call ${statusData.CallSid} status: ${statusData.CallStatus}`);
    }

    return new NextResponse('', { status: 200 });
  } catch (error) {
    console.error('Twilio status callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

// Handle GET requests for status validation
export async function GET(request: NextRequest) {
  try {
    console.log('Twilio status callback validation request');
    return new NextResponse('Status callback endpoint active', { status: 200 });
  } catch (error) {
    console.error('Twilio status callback validation error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
