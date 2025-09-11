import { useEffect, useRef, useState } from 'react';
import { useTranscript } from '@/app/contexts/TranscriptContext';

interface TranscriptEvent {
  type: 'message' | 'function_call' | 'session_start' | 'session_end';
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  metadata?: any;
  timestamp?: number;
}

interface TranscriptBridgeMessage {
  type: 'transcript_update' | 'transcript_history' | 'session_ended' | 'new_sip_session';
  sessionId: string;
  event?: TranscriptEvent;
  transcript?: {
    sessionId: string;
    events: TranscriptEvent[];
  };
  startTime?: number;
}

export function useTranscriptBridge() {
  const [isConnected, setIsConnected] = useState(false);
  const [subscribedSessions, setSubscribedSessions] = useState<Set<string>>(new Set());
  const [activeSipSessions, setActiveSipSessions] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const { addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();

  // Connect to transcript bridge
  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const bridgeUrl = process.env.NEXT_PUBLIC_TRANSCRIPT_BRIDGE_URL || 'ws://localhost:3002';
    
    try {
      wsRef.current = new WebSocket(bridgeUrl);
      
      wsRef.current.onopen = () => {
        console.log('[transcript-bridge] Connected');
        setIsConnected(true);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: TranscriptBridgeMessage = JSON.parse(event.data);
          handleBridgeMessage(message);
        } catch (error) {
          console.error('[transcript-bridge] Failed to parse message:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('[transcript-bridge] Disconnected');
        setIsConnected(false);
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
      
      wsRef.current.onerror = (error) => {
        console.warn('[transcript-bridge] WebSocket connection failed - transcript bridge not available');
        setIsConnected(false);
      };
      
    } catch (error) {
      console.error('[transcript-bridge] Failed to connect:', error);
      setIsConnected(false);
    }
  };

  // Handle incoming bridge messages
  const handleBridgeMessage = (message: TranscriptBridgeMessage) => {
    switch (message.type) {
      case 'new_sip_session': {
        console.log(`[transcript-bridge] New SIP session detected: ${message.sessionId}`);
        setActiveSipSessions((prev) => new Set([...prev, message.sessionId]));
        // Use system message instead of breadcrumb for consistency
        addTranscriptMessage(
          `new-sip-${message.sessionId}`, 
          'system', 
          `📞 New SIP call detected (${message.sessionId.slice(-8)})`
        );
        
        // Auto-subscribe to new SIP sessions
        subscribe(message.sessionId);
        break;
      }
      
      case 'transcript_update': {
        if (message.event) {
          processTranscriptEvent(message.sessionId, message.event);
        }
        break;
      }
      
      case 'transcript_history': {
        if (message.transcript) {
          console.log(`[transcript-bridge] Received history for session ${message.sessionId}:`, message.transcript.events.length, 'events');
          message.transcript.events.forEach((event) => {
            processTranscriptEvent(message.sessionId, event);
          });
        }
        break;
      }
      
      case 'session_ended': {
        console.log(`[transcript-bridge] Session ended: ${message.sessionId}`);
        setActiveSipSessions((prev) => {
          const next = new Set(prev);
          next.delete(message.sessionId);
          return next;
        });
        // Use system message instead of breadcrumb for consistency
        addTranscriptMessage(
          `end-sip-${message.sessionId}`, 
          'system', 
          `📞 SIP call ended (${message.sessionId.slice(-8)})`
        );
        break;
      }
    }
  };

  // Process individual transcript events - ENHANCED to match SIP Transcripts quality
  const processTranscriptEvent = (sessionId: string, event: TranscriptEvent) => {
    const itemId = `${sessionId}-${Date.now()}-${Math.random()}`;
    const timestamp = new Date(event.timestamp || Date.now()).toLocaleTimeString('sl-SI');
    
    switch (event.type) {
      case 'session_start': {
        // Don't add breadcrumb, we'll add system message instead
        
        // Add detailed session info like SIP Transcripts
        if (event.metadata) {
          const phone = event.metadata.callerPhone || 'Unknown';
          const phoneShort = phone.match(/["\']?(\+?[0-9]{8,15})["\']?/)?.[1] || phone;
          const lang = event.metadata.initialLanguage || 'hr';
          const startTimeFormatted = event.metadata.startTimeFormatted || 
            new Date(event.metadata.startTime || Date.now()).toLocaleString('sl-SI');
          
          let sessionDisplay = `📞 Klic iz: ${phone} | 📅 ${startTimeFormatted} | 🌍 Jezik: ${lang}`;
          
          // Add full metadata like SIP Transcripts
          sessionDisplay += `\n📋 Metadata:\n${JSON.stringify(event.metadata, null, 2)}`;
          
          addTranscriptMessage(
            `${itemId}-session`, 
            'system', 
            sessionDisplay
          );
        }
        break;
      }
      
      case 'message': {
        if (event.role && event.content) {
          // Enhanced message display with language tags like SIP Transcripts
          const langMatch = event.content.match(/^\[([A-Z]{2})\]/);
          const content = event.role === 'user' 
            ? `👤 ${timestamp} message user\n${event.content}` 
            : `🤖 ${timestamp} message assistant\n${event.content}`;
          
          addTranscriptMessage(itemId, event.role, content);
        }
        break;
      }
      
      case 'tool_call': {
        // Enhanced tool call display like SIP Transcripts
        const toolName = event.tool_name || 'unknown_tool';
        let toolDisplay = `🔧 ${timestamp} tool_call ${toolName}`;
        
        // Add detailed reservation/order summary for MCP tools
        if (toolName.includes('rezervation') || toolName.includes('order')) {
          if (event.arguments) {
            try {
              const args = typeof event.arguments === 'string' ? JSON.parse(event.arguments) : event.arguments;
              if (args.name) {
                const summary = toolName.includes('rezervation') 
                  ? `${args.name} | ${args.date} ${args.time} | ${args.guests_number} oseba/e`
                  : `${args.name} | ${args.date} ${args.delivery_time} | ${args.items?.length || 0} stavki | ${args.total}€ | ${args.delivery_type || 'pickup'}`;
                toolDisplay += `\n📋 Podaci o rezervaciji:\n${summary}`;
              }
            } catch (e) {
              console.warn('Failed to parse tool arguments:', e);
            }
          }
        }
        
        // Add summary for end_call tool
        if (toolName === 'end_call') {
          if (event.arguments) {
            try {
              const args = typeof event.arguments === 'string' ? JSON.parse(event.arguments) : event.arguments;
              if (args.reason) {
                toolDisplay += `\n📋 Podaci o rezervaciji:\n${args.reason}`;
              }
            } catch (e) {
              console.warn('Failed to parse end_call arguments:', e);
            }
          }
        }
        
        // Prepare metadata object for expandable display
        let metadataObj: any = null;
        if (event.metadata || event.arguments) {
          metadataObj = {
            toolName: toolName,
            callId: event.call_id || 'unknown',
          };
          
          // Add argument count and reservation data
          if (event.arguments) {
            try {
              const args = typeof event.arguments === 'string' ? JSON.parse(event.arguments) : event.arguments;
              const argCount = Object.keys(args).length;
              metadataObj.argumentCount = argCount;
              metadataObj.reservationData = args;
            } catch (e) {
              console.warn('Failed to parse arguments for metadata:', e);
            }
          }
          
          // Add any additional metadata from event
          if (event.metadata) {
            Object.assign(metadataObj, event.metadata);
          }
        }
        
        // Add message with metadata as data parameter for blue styling
        const { addTranscriptMessage: addMsg } = require('@/app/contexts/TranscriptContext');
        const transcriptContext = require('@/app/contexts/TranscriptContext');
        
        // We need to use the context directly to add both title and data
        addTranscriptMessage(`${itemId}-tool`, 'system', toolDisplay);
        
        // If we have metadata, update the item to include data
        if (metadataObj) {
          // We'll need to modify the transcript context to support this
          // For now, let's add metadata in the title but formatted properly
          const fullDisplay = toolDisplay + `\n📋 Metadata:\n${JSON.stringify(metadataObj, null, 2)}`;
          addTranscriptMessage(`${itemId}-tool`, 'system', fullDisplay);
        } else {
          addTranscriptMessage(`${itemId}-tool`, 'system', toolDisplay);
        }
        break;
      }
      
      case 'session_update': {
        // Show session updates like SIP Transcripts
        addTranscriptMessage(
          `${itemId}-update`, 
          'system', 
          `📝 ${timestamp} session_update`
        );
        break;
      }
      
      case 'session_end': {
        addTranscriptMessage(
          `${itemId}-end`, 
          'system', 
          `🔴 ${timestamp} session_end`
        );
        break;
      }
    }
  };

  // Subscribe to a session
  const subscribe = (sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    if (subscribedSessions.has(sessionId)) return;
    
    console.log(`[transcript-bridge] Subscribing to session: ${sessionId}`);
    
    wsRef.current.send(JSON.stringify({
      type: 'subscribe',
      sessionId
    }));
    
    setSubscribedSessions((prev) => new Set([...prev, sessionId]));
  };

  // Unsubscribe from a session
  const unsubscribe = (sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    if (!subscribedSessions.has(sessionId)) return;
    
    console.log(`[transcript-bridge] Unsubscribing from session: ${sessionId}`);
    
    wsRef.current.send(JSON.stringify({
      type: 'unsubscribe',
      sessionId
    }));
    
    setSubscribedSessions((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  };

  // Send transcript event
  const sendEvent = (sessionId: string, event: TranscriptEvent) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'transcript_event',
      sessionId,
      event
    }));
  };

  // End session
  const endSession = (sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'session_end',
      sessionId
    }));
  };

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    subscribedSessions: Array.from(subscribedSessions),
    activeSipSessions: Array.from(activeSipSessions),
    subscribe,
    unsubscribe,
    sendEvent,
    endSession,
    connect
  };
}
