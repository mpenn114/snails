import type { ErrorCode } from '@snails/protocol';
import type { ConnectionState } from '../net/client';

/** Uppercases and keeps only the first four letters. */
export function normaliseRoom(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}

/** Extracts a normalised room code from a query string such as `?room=abcd`. */
export function parseRoomParam(search: string): string {
  return normaliseRoom(new URLSearchParams(search).get('room') ?? '');
}

/** True when the trimmed name is 1-32 characters. */
export function isValidName(name: string): boolean {
  const n = name.trim().length;
  return n >= 1 && n <= 32;
}

/** True when the room code is four letters. */
export function isValidRoom(room: string): boolean {
  return /^[A-Z]{4}$/.test(room);
}

/** Whether the join button may be enabled. */
export function canJoin(name: string, room: string, busy: boolean): boolean {
  return !busy && isValidName(name) && isValidRoom(room);
}

/** User-facing status text for a connection state and last error; empty when nothing to show. */
export function statusText(state: ConnectionState, error: ErrorCode | undefined): string {
  if (error === 'no_room') return 'Room not found. Check the code.';
  if (error === 'room_full' || error === 'teams_full') return 'That room is full.';
  if (error === 'protocol_mismatch' || state === 'mismatch')
    return 'Your app is out of date. Please refresh the page.';
  if (error === 'bad_session') return 'Your session expired. Join again.';
  if (state === 'connecting') return 'Connecting...';
  if (state === 'reconnecting') return 'Connection lost. Reconnecting...';
  if (state === 'closed' && error) return 'Could not join.';
  return '';
}
