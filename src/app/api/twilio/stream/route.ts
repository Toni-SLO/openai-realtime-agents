import type { NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Twilio Media Streams WebSocket endpoint (stub: sprejme in logira dogodke)
export async function GET(request: NextRequest) {
  const upgradeHeader = request.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // @ts-ignore - WebSocketPair is available in edge runtime
  const { 0: client, 1: server } = new WebSocketPair();

  // @ts-ignore
  server.accept();

  let streamSid: string | null = null;

  // @ts-ignore
  server.addEventListener('message', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data.event === 'start') {
        streamSid = data.start?.streamSid || null;
        // @ts-ignore
        server.send(JSON.stringify({ event: 'mark', streamSid, name: 'connected' }));
      } else if (data.event === 'media') {
        // data.media.payload is base64 (PCMU 8k). Tu bomo kasneje premostili na OpenAI.
      } else if (data.event === 'stop') {
        // @ts-ignore
        server.close(1000, 'stream stopped');
      }
    } catch (err) {
      // @ts-ignore
      server.close(1011, 'invalid message');
    }
  });

  // @ts-ignore
  server.addEventListener('close', () => {
    // cleanup
  });

  // @ts-ignore
  return new Response(null, { status: 101, webSocket: client });
}


