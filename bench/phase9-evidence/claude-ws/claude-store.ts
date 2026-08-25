// again
export interface Store { get(k: string): string }
export class MemStore implements Store { get(k: string) { return String(k) } }
