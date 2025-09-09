import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';

import { audioFormatForCodec, applyCodecPreferences } from '../lib/codecUtils';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [status, setStatus] = useState<
    SessionStatus
  >('DISCONNECTED');
  const sessionReadyRef = useRef<boolean>(false);
  const { logClientEvent } = useEvent();

  // WebAudio predvajalnik za WS audio delte
  const audioContextRef = useRef<AudioContext | null>(null);
  const scheduledAtRef = useRef<number>(0);
  const outputSampleRateRef = useRef<number>(24000);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);

  function ensureAudioContextResumed() {
    if (typeof window === 'undefined') return;
    if (!audioContextRef.current) {
      // @ts-ignore - webkit prefix za stare Safarije
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctor();
      scheduledAtRef.current = audioContextRef.current?.currentTime ?? 0;
    }
    try { audioContextRef.current!.resume?.(); } catch {}
  }

  function enqueuePcm16Audio(ab: ArrayBuffer) {
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const int16 = new Int16Array(ab);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
      }
      const sampleRate = outputSampleRateRef.current;
      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0, 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, scheduledAtRef.current);
      src.start(startAt);
      scheduledAtRef.current = startAt + buffer.duration;
    } catch (e) {
      console.warn('[realtime][audio] enqueue failed', e);
    }
  }

  function downsampleTo(targetRate: number, input: Float32Array, inputRate: number): Float32Array {
    if (inputRate === targetRate) return input;
    const ratio = inputRate / targetRate;
    const newLen = Math.floor(input.length / ratio);
    const out = new Float32Array(newLen);
    let idx = 0;
    let i = 0;
    while (idx < newLen) {
      const nextI = Math.min(Math.round((idx + 1) * ratio), input.length);
      let sum = 0;
      let count = 0;
      for (; i < nextI; i++) { sum += input[i]; count++; }
      out[idx++] = sum / (count || 1);
    }
    return out;
  }

  function floatToPCM16(float32: Float32Array): ArrayBuffer {
    const ab = new ArrayBuffer(float32.length * 2);
    const view = new DataView(ab);
    let offset = 0;
    for (let i = 0; i < float32.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return ab;
  }

  async function startMicCapture() {
    ensureAudioContextResumed();
    const ctx = audioContextRef.current!;
    if (micProcessorRef.current) return; // already capturing
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.warn('[realtime][mic] getUserMedia failed', e);
      return;
    }
    try {
      micSourceRef.current = ctx.createMediaStreamSource(micStreamRef.current);
      const bufSize = 2048;
      micProcessorRef.current = ctx.createScriptProcessor(bufSize, 1, 1);
      micProcessorRef.current.onaudioprocess = (ev: AudioProcessingEvent) => {
        const inBuf = ev.inputBuffer.getChannelData(0);
        const srcRate = ev.inputBuffer.sampleRate;
        const targetRate = outputSampleRateRef.current;
        const down = downsampleTo(targetRate, inBuf, srcRate);
        const ab = floatToPCM16(down);
        try { (sessionRef.current as any)?.transport?.sendAudio?.(ab); } catch {}
      };
      micSourceRef.current.connect(micProcessorRef.current);
      micProcessorRef.current.connect(ctx.destination);
    } catch (e) {
      console.warn('[realtime][mic] processor setup failed', e);
    }
  }

  function stopMicCapture() {
    try { micProcessorRef.current?.disconnect(); } catch {}
    try { micSourceRef.current?.disconnect(); } catch {}
    micProcessorRef.current = null;
    micSourceRef.current = null;
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    micStreamRef.current = null;
  }

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks],
  );

  const { logServerEvent } = useEvent();

  const historyHandlers = useHandleSessionHistory().current;

  function handleTransportEvent(event: any) {
    // Handle additional server events that aren't managed by the session
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta": {
        historyHandlers.handleTranscriptionDelta(event);
        break;
      }
      default: {
        logServerEvent(event);
        break;
      } 
    }
  }

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  // Wrapper to pass current codec param
  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  const handleAgentHandoff = (item: any) => {
    const history = item.context.history;
    const lastMessage = history[history.length - 1];
    const agentName = lastMessage.name.split("transfer_to_")[1];
    callbacks.onAgentHandoff?.(agentName);
  };

  useEffect(() => {
    if (sessionRef.current) {
      // Označi sejo kot pripravljeno, ko strežnik potrdi posodobitev
      sessionRef.current.on("session.updated" as any, () => {
        sessionReadyRef.current = true;
      });
      // Log server errors
      sessionRef.current.on("error" as any, (...args: any[]) => {
        logServerEvent({
          type: "error",
          message: args[0],
        });
      });

      // history events
      sessionRef.current.on("agent_handoff" as any, handleAgentHandoff as any);
      sessionRef.current.on("agent_tool_start" as any, historyHandlers.handleAgentToolStart as any);
      sessionRef.current.on("agent_tool_end" as any, historyHandlers.handleAgentToolEnd as any);
      sessionRef.current.on("history_updated" as any, historyHandlers.handleHistoryUpdated as any);
      sessionRef.current.on("history_added" as any, historyHandlers.handleHistoryAdded as any);
      sessionRef.current.on("guardrail_tripped" as any, historyHandlers.handleGuardrailTripped as any);

      // additional transport events
      sessionRef.current.on("transport_event" as any, handleTransportEvent as any);
    }
  }, [sessionRef.current]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      audioElement,
      extraContext,
      outputGuardrails,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      const ek = await getEphemeralKey();
      const rootAgent = initialAgents[0];

      // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
      //  simulate how the voice agent sounds over a PSTN/SIP phone call.
      const codecParam = codecParamRef.current;
      const audioFormat = audioFormatForCodec(codecParam);

      sessionRef.current = new RealtimeSession(rootAgent, {
        // Uskladitev s trenutno verzijo SDK (WS + client_secrets)
        transport: 'websocket',
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
        config: {
          inputAudioFormat: audioFormat,
          outputAudioFormat: audioFormat,
          inputAudioTranscription: {
            model: 'gpt-4o-mini-transcribe',
          },
        },
        outputGuardrails: outputGuardrails ?? [],
        context: extraContext ?? {},
      });

      await sessionRef.current.connect({ apiKey: ek });

      // Takoj po povezavi označi sejo kot realtime
      try {
        sessionReadyRef.current = false;
        sessionRef.current.transport.sendEvent({
          type: 'session.update',
          session: { type: 'realtime' },
        } as any);
        // Inicializiraj WebAudio predvajanje za WS audio delte
        ensureAudioContextResumed();
        // Sprejem modelovega zvoka in predvajanje
        try {
          (sessionRef.current.transport as any).on?.('audio', (ev: any) => {
            const ab: ArrayBuffer = ev?.data as ArrayBuffer;
            if (ab) enqueuePcm16Audio(ab);
          });
          (sessionRef.current.transport as any).on?.('audio_done', () => {
            // lahko bi naredili cleanup/sync; zaenkrat ni potrebno
          });
        } catch {}
      } catch {}
      updateStatus('CONNECTED');
    },
    [callbacks, updateStatus],
  );

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    updateStatus('DISCONNECTED');
  }, [updateStatus]);

  const assertconnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertconnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
    startMicCapture();
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    stopMicCapture();
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as any);
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}