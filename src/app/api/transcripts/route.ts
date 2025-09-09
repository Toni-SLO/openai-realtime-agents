import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    const transcriptsDir = path.join(process.cwd(), 'server', 'logs', 'transcripts');
    
    // If sessionId provided, return specific transcript
    if (sessionId) {
      const logFile = path.join(transcriptsDir, `${sessionId}.log`);
      
      if (!fs.existsSync(logFile)) {
        return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
      }
      
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const events = lines.map(line => {
        try {
          const match = line.match(/^\[(.*?)\] (.*)$/);
          if (match) {
            const timestamp = match[1];
            const eventData = JSON.parse(match[2]);
            return { timestamp, ...eventData };
          }
          return null;
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      
      return NextResponse.json({
        sessionId,
        events,
        totalEvents: events.length
      });
    }
    
    // If no sessionId, return list of available transcripts
    if (!fs.existsSync(transcriptsDir)) {
      return NextResponse.json({ transcripts: [] });
    }
    
    const files = fs.readdirSync(transcriptsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(transcriptsDir, file);
        const stats = fs.statSync(filePath);
        const sessionId = file.replace('.log', '');
        
        return {
          sessionId,
          filename: file,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    
    return NextResponse.json({ transcripts: files });
    
  } catch (error: any) {
    console.error('Transcripts API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
