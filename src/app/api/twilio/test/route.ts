import { NextRequest, NextResponse } from 'next/server';
import '@/app/lib/envSetup';
import { twilioClient } from '@/app/lib/twilioClient';

// Test Twilio configuration
export async function GET(request: NextRequest) {
  try {
    console.log('Testing Twilio configuration...');
    console.log('ENV check (server):', {
      hasSID: !!process.env.TWILIO_ACCOUNT_SID,
      hasTOKEN: !!process.env.TWILIO_AUTH_TOKEN,
      hasFROM: !!process.env.TWILIO_PHONE_NUMBER,
      hasSTAFF: !!process.env.STAFF_PHONE_NUMBER,
    });

    const testResults = {
      twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'missing',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'missing',
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || 'not set',
      staffPhoneNumber: process.env.STAFF_PHONE_NUMBER || 'not set',
      timestamp: new Date().toISOString(),
    };

    console.log('Twilio test results:', testResults);

    return NextResponse.json({
      success: true,
      message: 'Twilio configuration test completed',
      data: testResults,
    });
  } catch (error: any) {
    console.error('Twilio test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Test outgoing call
export async function POST(request: NextRequest) {
  try {
    const { to, from } = await request.json();

    console.log('Testing outgoing call:', { to, from });

    if (!to) {
      return NextResponse.json({
        success: false,
        error: 'Missing "to" parameter',
      }, { status: 400 });
    }

    const result = await twilioClient.transferCall(from || '+1234567890', to);

    return NextResponse.json({
      success: true,
      message: 'Test call initiated',
      data: result,
    });
  } catch (error: any) {
    console.error('Twilio test call error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Test TwiML generation
export async function PUT(request: NextRequest) {
  try {
    const { message } = await request.json();

    const twiml = twilioClient.createTwiMLResponse(message || 'Test message');

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error('TwiML test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
