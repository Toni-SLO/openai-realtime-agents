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
        addTranscriptBreadcrumb(`📞 New SIP call detected (${message.sessionId.slice(-8)})`);
        
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
        addTranscriptBreadcrumb(`📞 SIP call ended (${message.sessionId.slice(-8)})`);
        break;
      }
    }
  };

  // Process individual transcript events
  const processTranscriptEvent = (sessionId: string, event: TranscriptEvent) => {
    const itemId = `${sessionId}-${Date.now()}-${Math.random()}`;
    
    switch (event.type) {
      case 'message': {
        if (event.role && event.content) {
          // Add SIP prefix to distinguish from local messages
          const content = event.role === 'user' 
            ? `📞 ${event.content}` 
            : `🎙️ ${event.content}`;
          
          addTranscriptMessage(itemId, event.role, content);
        }
        break;
      }
      
      case 'function_call': {
        addTranscriptBreadcrumb('SIP Function Call', event.metadata);
        break;
      }
      
      case 'session_start': {
        addTranscriptBreadcrumb(`SIP call started (${sessionId})`, event.metadata);
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
