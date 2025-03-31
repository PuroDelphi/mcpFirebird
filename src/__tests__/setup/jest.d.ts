// Define tipos para los mocks de Jest
import { jest } from '@jest/globals';

declare global {
  interface MockWithJestFunctions<T> extends Function {
    mockImplementation: (implementation: (...args: any[]) => any) => MockWithJestFunctions<T>;
    mockResolvedValue: (value: any) => MockWithJestFunctions<T>;
    mockRejectedValue: (error: Error) => MockWithJestFunctions<T>;
    mockReturnValue: (value: any) => MockWithJestFunctions<T>;
  }
}

// Extiende los tipos para que TypeScript reconozca las funciones jest.fn()
declare module '@jest/globals' {
  interface JestInterface {
    fn<T = any>(): MockWithJestFunctions<T>;
  }
}
