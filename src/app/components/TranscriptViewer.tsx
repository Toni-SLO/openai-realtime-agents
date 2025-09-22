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
  const [autoScroll, setAutoScroll] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string>('');
  const [playingRecording, setPlayingRecording] = useState<string>('');
  const [recordingUrl, setRecordingUrl] = useState<string>('');
  const [showAudioPlayer, setShowAudioPlayer] = useState<string>(''); // sessionId of currently shown player
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Helper function to extract phone number from caller info
  const extractPhoneNumber = (callerPhone: string): string => {
    if (!callerPhone) return 'Unknown';
    
    // Extract just the phone number from complex string like:
    // "38641734134" <sip:+38641734134@pstn.twilio.com>;tag=...
    const phoneMatch = callerPhone.match(/["\']?(\+?[0-9]{8,15})["\']?/);
    return phoneMatch ? phoneMatch[1] : callerPhone.slice(0, 15) + '...';
  };

  // Helper function to get language name
  const getLanguageName = (langCode: string): string => {
    const languages: {[key: string]: string} = {
      'hr': 'HR',
      'sl': 'SL', 
      'en': 'EN',
      'de': 'DE',
      'it': 'IT',
      'nl': 'NL'
    };
    return languages[langCode] || langCode?.toUpperCase() || 'HR';
  };

  const playRecording = async (sessionId: string) => {
    try {
      setPlayingRecording(sessionId);

      // Get recordings for this call from Twilio REST API
      const response = await fetch(`/api/recordings?callSid=${sessionId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.recordings && data.recordings.length > 0) {
        const recording = data.recordings[0]; // Get first recording for this call
        
        // Show inline audio player instead of opening external URL
        setRecordingUrl(recording.downloadUrl);
        setShowAudioPlayer(sessionId);
      } else {
        alert('Posnetek ni na voljo za ta klic.');
      }
    } catch (error) {
      console.error('Failed to play recording:', error);
      alert('Napaka pri pridobivanju posnetka.');
    } finally {
      setPlayingRecording('');
    }
  };

  const closeAudioPlayer = () => {
    setShowAudioPlayer('');
    setRecordingUrl('');
  };

  const deleteTranscript = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/transcripts?sessionId=${sessionId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadTranscripts(); // Reload list
        if (selectedSessionId === sessionId) {
          setSelectedTranscript(null);
          setSelectedSessionId('');
        }
        setDeleteConfirm('');
      }
    } catch (error) {
      console.error('Failed to delete transcript:', error);
    }
  };

  const deleteAllTranscripts = async () => {
    try {
      const response = await fetch('/api/transcripts?deleteAll=true', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadTranscripts(); // Reload list
        setSelectedTranscript(null);
        setSelectedSessionId('');
        setDeleteConfirm('');
      }
    } catch (error) {
      console.error('Failed to delete all transcripts:', error);
    }
  };

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
              const events = transcriptData.events || [];
              
              // Find session_start event for metadata
              const sessionStart = events.find((event: TranscriptEvent) => event.type === 'session_start');
              
              // Find the actual language used (look for switch_language tool calls)
              const languageSwitch = events.find((event: TranscriptEvent) => 
                event.type === 'tool_call' && event.tool_name === 'switch_language'
              );
              
              // Find guest name from MCP tool calls (reservations or orders)
              const mcpToolCall = events.find((event: TranscriptEvent) => 
                event.type === 'tool_call' && 
                (event.tool_name === 's6792596_fancita_rezervation_supabase' || 
                 event.tool_name === 's6798488_fancita_order_supabase')
              );
              
              let guestName = '';
              if (mcpToolCall && mcpToolCall.arguments) {
                try {
                  const args = typeof mcpToolCall.arguments === 'string' 
                    ? JSON.parse(mcpToolCall.arguments) 
                    : mcpToolCall.arguments;
                  guestName = args.name || '';
                } catch (e) {
                  console.warn('Failed to parse MCP tool arguments:', e);
                }
              }
              
              if (sessionStart && sessionStart.metadata) {
                const rawPhone = sessionStart.metadata.callerPhone || 'Unknown';
                
                // Use switched language if available, otherwise initial language
                let finalLanguage = sessionStart.metadata.initialLanguage || 'hr';
                if (languageSwitch && languageSwitch.arguments) {
                  try {
                    const switchArgs = typeof languageSwitch.arguments === 'string' 
                      ? JSON.parse(languageSwitch.arguments) 
                      : languageSwitch.arguments;
                    finalLanguage = switchArgs.language_code || finalLanguage;
                  } catch (e) {
                    console.warn('Failed to parse switch_language arguments:', e);
                  }
                }
                
                metadata[transcript.sessionId] = {
                  callerPhone: rawPhone,
                  phoneNumber: extractPhoneNumber(rawPhone),
                  guestName: guestName,
                  language: getLanguageName(finalLanguage),
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
          
          // CRITICAL: Transcript events are received via WebSocket but need to be saved to files
          // The transcript-bridge receives events and stores them in memory, but we also need
          // them saved to logs/transcripts/ files for the SIP Transcripts UI
          
          console.log('[TranscriptViewer] Transcript event received:', sessionId, transcriptEvent.type);
          
          // Refresh transcript list to show new sessions (files are written by transcript-bridge)
          if (isVisible) {
            // Debounce refresh to avoid too many calls
            setTimeout(() => {
              loadTranscripts();
            }, 1000);
          }
        } else if (data.type === 'new_sip_session') {
          const { sessionId } = data;
          console.log('[TranscriptViewer] New SIP session started:', sessionId);
          
          // LIVE functionality disabled
        } else if (data.type === 'session_ended') {
          const { sessionId } = data;
          console.log('[TranscriptViewer] SIP session ended:', sessionId);
          
          // Refresh transcript list after session ends
          setTimeout(() => {
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
              {/* Delete buttons section */}
              <div className="mb-6">
                <h3 className="font-semibold text-red-600 mb-3">🗑️ Upravljanje</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setDeleteConfirm('all')}
                    className="w-full px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                  >
                    🗑️ Izbriši vse
                  </button>
                  {deleteConfirm === 'all' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm text-red-700 mb-2">Ali ste prepričani?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={deleteAllTranscripts}
                          className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        >
                          DA, izbriši vse
                        </button>
                        <button
                          onClick={() => setDeleteConfirm('')}
                          className="px-2 py-0.5 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                        >
                          Prekliči
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
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
                        className={`p-3 rounded border cursor-pointer ${
                          selectedSessionId === transcript.sessionId
                            ? 'bg-blue-100 border-blue-300'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {/* Header with phone and delete button */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center text-sm font-semibold text-blue-600 flex-1">
                            📞 {metadata?.phoneNumber || 'Unknown'}
                            {metadata?.guestName && (
                              <span className="ml-2 text-green-700 font-medium">
                                {metadata.guestName}
                              </span>
                            )}
                            {metadata?.language && (
                              <span className="ml-2 px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                {metadata.language}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playRecording(transcript.sessionId);
                              }}
                              disabled={playingRecording === transcript.sessionId}
                              className="px-1 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-gray-400"
                              title="Predvajaj posnetek klica"
                            >
                              {playingRecording === transcript.sessionId ? '⏳' : '🎵'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(transcript.sessionId);
                              }}
                              className="px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        
                        {/* Delete confirmation for this transcript */}
                        {deleteConfirm === transcript.sessionId && (
                          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-xs text-red-700 mb-1">Izbriši transcript?</p>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTranscript(transcript.sessionId);
                                }}
                                className="px-1 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                              >
                                DA
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm('');
                                }}
                                className="px-1 py-0.5 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                              >
                                NE
                              </button>
                            </div>
                          </div>
                        )}
                        
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
                        
                        {/* Inline Audio Player */}
                        {showAudioPlayer === transcript.sessionId && recordingUrl && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-blue-800">🎵 Posnetek klica</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    // Get recording details for external link
                                    try {
                                      const response = await fetch(`/api/recordings?callSid=${transcript.sessionId}`);
                                      const data = await response.json();
                                      if (data.success && data.recordings && data.recordings.length > 0) {
                                        window.open(data.recordings[0].recordingDetailsUrl, '_blank');
                                      }
                                    } catch (error) {
                                      console.error('Failed to open external link:', error);
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-sm"
                                  title="Odpri v Twilio Console"
                                >
                                  🔗
                                </button>
                                <button
                                  onClick={closeAudioPlayer}
                                  className="text-blue-600 hover:text-blue-800 text-lg"
                                  title="Zapri predvajalnik"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <audio
                              controls
                              className="w-full"
                              preload="metadata"
                              onError={(e) => {
                                console.error('Audio playback error:', e);
                                alert('Napaka pri predvajanju posnetka. Poskusite znova.');
                              }}
                            >
                              <source src={recordingUrl} type="audio/mpeg" />
                              <source src={recordingUrl} type="audio/wav" />
                              Vaš brskalnik ne podpira predvajanja zvoka.
                            </audio>
                            <div className="mt-2 text-xs text-blue-600">
                              💡 Tip: Če se posnetek ne predvaja, preverite Twilio kredenciale
                            </div>
                          </div>
                        )}
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
                      📋 Call: {selectedSessionId.slice(-8)}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {selectedTranscript.length} događaja
                    </div>
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
