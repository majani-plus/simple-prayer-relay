import { describe, expect, it } from 'vitest';
import { markMessage } from '../src/push';
import type { MarkPayload } from '../src/protocol';
import type { SendBody } from '../src/validate';

const send = {
  pairId: 'a'.repeat(32),
  day: '2026-11-07',
  prayer: 'dhuhr',
  state: 'prayed',
  lang: 'en',
  notify: true,
  title: 'Your buddy has prayed Dhuhr.',
} as unknown as SendBody;
const data = { type: 'mark' } as unknown as MarkPayload;

describe('markMessage', () => {
  it('sends a visible mark at high priority, so Doze and APNs do not hold it back', () => {
    const message = markMessage('ExponentPushToken[x]', data, send);
    expect(message.priority).toBe('high');
    expect(message.title).toBe(send.title);
    expect(message.channelId).toBe('buddies');
  });

  it('keeps silent pushes at normal priority (iOS refuses high-priority background pushes)', () => {
    const undo = { ...send, state: 'cleared', title: undefined } as unknown as SendBody;
    const message = markMessage('ExponentPushToken[x]', data, undo);
    expect(message.priority).toBe('normal');
    expect(message.contentAvailable).toBe(true);
    expect(message.title).toBeUndefined();
  });
});
