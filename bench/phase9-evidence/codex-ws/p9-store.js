// Store implementation.
export interface Store { get(k: string): string }
export class MemStore implements Store { get(k) { return String(k) } }
