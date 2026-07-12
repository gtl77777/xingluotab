import type { LocalStoragePort } from "../../src/platform/storage";

export type MemoryLocalStorage = LocalStoragePort & {
  dump(): Record<string, string>;
};

export function createMemoryStorage(seed: Record<string, string> = {}): MemoryLocalStorage {
  const data = new Map(Object.entries(seed));

  return {
    async getString(key) {
      return data.get(key) ?? "";
    },
    async setString(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
    async getKeys() {
      return [...data.keys()];
    },
    dump() {
      return Object.fromEntries(data);
    }
  };
}

export function json(value: unknown) {
  return JSON.stringify(value);
}
