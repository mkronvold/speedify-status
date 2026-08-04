import '@testing-library/jest-dom/vitest';

const memoryStore = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return memoryStore.size;
  },
  clear() {
    memoryStore.clear();
  },
  getItem(key: string) {
    return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
  },
  key(index: number) {
    return [...memoryStore.keys()][index] ?? null;
  },
  removeItem(key: string) {
    memoryStore.delete(key);
  },
  setItem(key: string, value: string) {
    memoryStore.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
