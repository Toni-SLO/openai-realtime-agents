// Twilio Client for call handoff
export class TwilioClient {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;
  private staffNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.staffNumber = process.env.STAFF_PHONE_NUMBER || '';
  }

  async transferCall(fromNumber: string, toNumber: string = this.staffNumber) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`;

    const params = new URLSearchParams({
      From: this.phoneNumber,
      To: toNumber,
      Url: `http://demo.twilio.com/docs/voice.xml`, // Basic TwiML to connect the call
    });

    const auth = btoa(`${this.accountSid}:${this.authToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Twilio API error: ${response.status} - ${errorData}`);
    }

    return await response.json();
  }

  async hangupCall(callSid: string) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${callSid}.json`;

    const auth = btoa(`${this.accountSid}:${this.authToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Status: 'completed' }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Twilio hangup error: ${response.status}`);
    }

    return await response.json();
  }
}

// Singleton instance
export const twilioClient = new TwilioClient();
