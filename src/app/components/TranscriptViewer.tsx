-'use client';

import { useState, useEffect, useRef } from 'react';

interface TranscriptEvent {
  timestamp: string;
  type: string;
  role?: string;
  content?: string;
  metadata?: any;
  tool_name?: string;
  arguments?: string;
  result?: string;
  call_id?: string;
  tool_call_id?: string;
}

interface TranscriptFile {
  sessionId: string;
  filename: string;
  size: number;
  lastModified: string;
  created: string;
}

export function TranscriptViewer() {
  const [transcripts, setTranscripts] = useState<TranscriptFile[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptEvent[] | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transcriptMetadata, setTranscriptMetadata] = useState<{[key: string]: any}>({});
  const [isVisible, setIsVisible] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<{[sessionId: string]: TranscriptEvent[]}>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const loadTranscripts = async () => {
    try {
      const response = await fetch('/api/transcripts');
      if (response.ok) {
        const data = await response.json();
        const transcriptList = data.transcripts || [];
        setTranscripts(transcriptList);
        
        // Load metadata for each transcript
        const metadata: {[key: string]: any} = {};
        for (const transcript of transcriptList) {
          try {
            const transcriptResponse = await fetch(`/api/transcripts?sessionId=${transcript.sessionId}`);
            if (transcriptResponse.ok) {
              const transcriptData = await transcriptResponse.json();
              const events = transcriptData.content || [];
              
              // Find session_start event for metadata
              const sessionStart = events.find((event: TranscriptEvent) => event.type === 'session_start');
              if (sessionStart && sessionStart.metadata) {
                metadata[transcript.sessionId] = {
                  callerPhone: sessionStart.metadata.callerPhone || 'Unknown',
                  startTime: sessionStart.metadata.startTimeFormatted || sessionStart.metadata.startTime || transcript.created,
                  duration: calculateDuration(events)
                };
              }
            }
          } catch (error) {
            console.warn(`Failed to load metadata for ${transcript.sessionId}:`, error);
          }
        }
        setTranscriptMetadata(metadata);
      } else {
        console.warn('Failed to load transcripts:', response.status);
      }
    } catch (error) {
      console.warn('Failed to load transcripts:', error);
      // Continue silently, transcripts are not critical
    }
  };

  const calculateDuration = (events: TranscriptEvent[]): string => {
    const sessionStart = events.find(e => e.type === 'session_start');
    const sessionEnd = events.find(e => e.type === 'session_end');
    
    if (sessionStart && sessionEnd) {
      const start = new Date(sessionStart.timestamp);
      const end = new Date(sessionEnd.timestamp);
      const diffMs = end.getTime() - start.getTime();
      const diffSec = Math.round(diffMs / 1000);
      const minutes = Math.floor(diffSec / 60);
      const seconds = diffSec % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return 'N/A';
  };

  const loadTranscript = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/transcripts?sessionId=${sessionId}`);
      const data = await response.json();
      setSelectedTranscript(data.events || []);
      setSelectedSessionId(sessionId);
    } catch (error) {
      console.error('Failed to load transcript:', error);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket connection for real-time transcript updates
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3002');
    
    ws.onopen = () => {
      console.log('[TranscriptViewer] Connected to transcript bridge');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'transcript_update' || data.type === 'transcript_event') {
          const { sessionId, event: transcriptEvent } = data;
          
          setLiveTranscripts(prev => ({
            ...prev,
            [sessionId]: [...(prev[sessionId] || []), transcriptEvent]
          }));
          
          // Auto-select new live sessions
          if (!selectedSessionId || selectedSessionId === sessionId) {
            setSelectedTranscript(prev => prev ? [...prev, transcriptEvent] : [transcriptEvent]);
            setSelectedSessionId(sessionId);
            
            // Auto-scroll to bottom for live sessions
            if (autoScroll && liveTranscripts[sessionId]) {
              setTimeout(() => {
                transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          }
          
          // Refresh transcript list to show new sessions
          if (isVisible) {
            loadTranscripts();
          }
        } else if (data.type === 'new_sip_session') {
          const { sessionId } = data;
          console.log('[TranscriptViewer] New SIP session started:', sessionId);
          
          // Initialize empty transcript for new session
          setLiveTranscripts(prev => ({
            ...prev,
            [sessionId]: []
          }));
        } else if (data.type === 'session_ended') {
          const { sessionId } = data;
          console.log('[TranscriptViewer] SIP session ended:', sessionId);
          
          // Move from live to completed after a delay
          setTimeout(() => {
            setLiveTranscripts(prev => {
              const newLive = { ...prev };
              delete newLive[sessionId];
              return newLive;
            });
            
            // Refresh to show in completed list
            if (isVisible) {
              loadTranscripts();
            }
          }, 5000); // 5 second delay
        }
      } catch (error) {
        console.error('[TranscriptViewer] Error processing message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('[TranscriptViewer] Disconnected from transcript bridge');
    };
    
    ws.onerror = (error) => {
      console.error('[TranscriptViewer] WebSocket error:', error);
    };
    
    return () => {
      ws.close();
    };
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) {
      loadTranscripts();
      // Auto-refresh every 5 seconds when visible
      const interval = setInterval(loadTranscripts, 5000);
      return () => clearInterval(interval);
    }
  }, [isVisible]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('sl-SI');
  };

  const getEventIcon = (event: TranscriptEvent) => {
    switch (event.type) {
      case 'session_start': return '🔵';
      case 'session_end': return '🔴';
      case 'message': 
        return event.role === 'user' ? '👤' : '🤖';
      case 'tool_call': return '🔧';
      case 'tool_result': return '📊';
      case 'function_call': return '⚙️';
      case 'language_change': return '🌍';
      default: return '📝';
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 z-50"
      >
        📋 View SIP Transcripts
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">📋 SIP Call Transcripts</h2>
          <button
            onClick={() => setIsVisible(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - Transcript list */}
          <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
            <div className="p-4">
              {/* Live calls section */}
              {Object.keys(liveTranscripts).length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold text-green-600 mb-3">🔴 LIVE Pozivi</h3>
                  <div className="space-y-2">
                    {Object.entries(liveTranscripts).map(([sessionId, events]) => (
                      <div
                        key={sessionId}
                        onClick={() => {
                          setSelectedTranscript(events);
                          setSelectedSessionId(sessionId);
                        }}
                        className={`p-3 rounded cursor-pointer border border-green-200 bg-green-50 hover:bg-green-100 ${
                          selectedSessionId === sessionId ? 'ring-2 ring-green-400' : ''
                        }`}
                      >
                        <div className="flex items-center text-sm font-semibold text-green-700 mb-1">
                          🔴 LIVE - {sessionId.slice(-8)}
                        </div>
                        <div className="text-xs text-green-600">
                          {events.length} događaja
                        </div>
                        <div className="text-xs text-green-500">
                          Poslednji: {events.length > 0 ? formatTimestamp(events[events.length - 1].timestamp) : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Recent Calls</h3>
                <button
                  onClick={loadTranscripts}
                  className="text-blue-500 hover:text-blue-700 text-sm"
                >
                  🔄 Refresh
                </button>
              </div>
              
              {transcripts.length === 0 ? (
                <p className="text-gray-500 text-sm">No transcripts found</p>
              ) : (
                <div className="space-y-2">
                  {transcripts.map((transcript) => {
                    const metadata = transcriptMetadata[transcript.sessionId];
                    return (
                      <div
                        key={transcript.sessionId}
                        onClick={() => loadTranscript(transcript.sessionId)}
                        className={`p-3 rounded cursor-pointer border ${
                          selectedSessionId === transcript.sessionId
                            ? 'bg-blue-100 border-blue-300'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {/* Phone number */}
                        <div className="flex items-center text-sm font-semibold text-blue-600 mb-1">
                          📞 {metadata?.callerPhone || 'Unknown'}
                        </div>
                        
                        {/* Date and time */}
                        <div className="text-sm text-gray-800 mb-1">
                          📅 {metadata?.startTime || formatTimestamp(transcript.lastModified)}
                        </div>
                        
                        {/* Duration and session ID */}
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-gray-500">
                            ⏱️ {metadata?.duration || 'N/A'}
                          </div>
                          <div className="font-mono text-xs text-gray-400">
                            {transcript.sessionId.slice(-8)}
                          </div>
                        </div>
                        
                        {/* File size */}
                        <div className="text-xs text-gray-400 mt-1">
                          {Math.round(transcript.size / 1024)} KB
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          {/* Right panel - Transcript content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading transcript...</div>
              </div>
            ) : selectedTranscript ? (
              <div className="p-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {liveTranscripts[selectedSessionId] ? '🔴 LIVE' : '📋'} Call: {selectedSessionId.slice(-8)}
                    </h3>
                    {liveTranscripts[selectedSessionId] && (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full animate-pulse">
                        UŽIVO
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {selectedTranscript.length} događaja
                      {liveTranscripts[selectedSessionId] && (
                        <span className="ml-2 text-green-600">• Poziv u toku</span>
                      )}
                    </div>
                    {liveTranscripts[selectedSessionId] && (
                      <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`text-xs px-2 py-1 rounded ${
                          autoScroll 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {autoScroll ? '📍 Auto-scroll' : '📍 Manual'}
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-3">
                  {selectedTranscript.map((event, index) => (
                    <div
                      key={index}
                      className="border-l-4 border-gray-200 pl-4 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <span>{getEventIcon(event)}</span>
                        <span>{formatTimestamp(event.timestamp)}</span>
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {event.type}
                        </span>
                        {event.role && (
                          <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                            {event.role}
                          </span>
                        )}
                        {event.tool_name && (
                          <span className="text-xs bg-green-100 px-2 py-1 rounded">
                            {event.tool_name}
                          </span>
                        )}
                      </div>
                      
                      {event.content && (
                        <div className="text-gray-800 bg-gray-50 p-2 rounded text-sm">
                          {event.type === 'tool_call' || event.type === 'tool_result' ? (
                            <pre className="whitespace-pre-wrap font-mono text-xs">
                              {event.content}
                            </pre>
                          ) : event.type === 'session_start' ? (
                            <div className="font-semibold text-blue-700 text-base">
                              {event.content}
                            </div>
                          ) : (
                            event.content
                          )}
                        </div>
                      )}
                      
                      {/* Reservation summary for tool calls */}
                      {(event as any).reservation_summary && (
                        <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                          <div className="text-sm font-medium text-blue-800 mb-1">
                            📋 Podaci o rezervaciji:
                          </div>
                          <div className="text-sm text-blue-700">
                            {(event as any).reservation_summary}
                          </div>
                        </div>
                      )}
                      
                      {/* Result summary for tool results */}
                      {(event as any).result_summary && (
                        <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                          <div className="text-sm font-medium text-green-800 mb-1">
                            📊 Rezultat:
                          </div>
                          <div className="text-sm text-green-700">
                            {(event as any).result_summary}
                          </div>
                        </div>
                      )}

                      {/* Show metadata for tool events and session events */}
                      {event.metadata && (event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'session_start' || event.type === 'language_change') && (
                        <div className="mt-2 text-xs bg-blue-50 p-2 rounded border-l-2 border-blue-200">
                          <div className="font-semibold text-blue-700 mb-1">📋 Metadata:</div>
                          <pre className="text-blue-600 font-mono">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                    </div>
                  ))}
                  {/* Auto-scroll anchor for live transcripts */}
                  <div ref={transcriptEndRef} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Select a transcript to view</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
