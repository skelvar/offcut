export interface Store {
  get(key: string): string | undefined;
}

export class MemoryStore implements Store {
  private data = new Map<string, string>();
  get(key: string) {
    return this.data.get(key);
  }
}
