import type { MessageKey } from '../messages';

export type { MessageKey };
export type ErrorKey = Extract<MessageKey, `error.${string}`>;
export type MessageParams = Record<string, string | number>;
export interface Message {
  key: MessageKey;
  params?: MessageParams;
  location?: { unit: 'byte' | 'line'; position: number };
  source?: { filename: string; line?: number };
}

// Plain descriptors survive structured cloning and can be translated after a locale change.
export class MessageError extends Error {
  constructor(readonly diagnostic: Message) {
    super(diagnostic.key);
    this.name = 'MessageError';
  }
}

export function messageOf(error: unknown, fallback: ErrorKey = 'error.unexpected'): Message {
  return error instanceof MessageError ? error.diagnostic : { key: fallback };
}
