import { vi } from 'vitest';

export function createMockAxios() {
  return {
    post: vi.fn(),
    get: vi.fn(),
  };
}
