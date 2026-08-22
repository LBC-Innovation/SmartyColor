"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function describeSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the mic in your browser settings and try again.";
    case "audio-capture":
      return "We could not find a microphone on this device.";
    case "network":
      return "Voice needs an internet connection in this browser.";
    case "no-speech":
      return "We did not hear anything. Tap the mic and try again.";
    case "aborted":
      return "";
    default:
      return "We could not hear that. Try again?";
  }
}

export function useSpeechToText() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef<
    ((text: string, isFinal: boolean) => void) | null
  >(null);

  useEffect(() => {
    queueMicrotask(() => {
      setSupported(Boolean(getSpeechRecognition()));
    });
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(
    (onTranscript: (text: string, isFinal: boolean) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) return;

      if (listening && recognitionRef.current) {
        stop();
        return;
      }

      setError(null);
      onTranscriptRef.current = onTranscript;

      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalChunk += piece;
          else interimChunk += piece;
        }
        if (finalChunk) onTranscriptRef.current?.(finalChunk, true);
        else if (interimChunk) onTranscriptRef.current?.(interimChunk, false);
      };
      recognition.onerror = (event) => {
        const message = describeSpeechError(event.error);
        if (message) setError(message);
        stop();
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        setError("Could not start the microphone. Try again?");
        stop();
      }
    },
    [listening, stop],
  );

  return { supported, listening, error, toggle, stop };
}
