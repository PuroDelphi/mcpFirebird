// Este archivo se ejecutará antes de cada prueba para configurar el entorno Jest
import { jest } from '@jest/globals';

// Configuración global para Jest

// Asegurar que los mocks tengan todas las propiedades necesarias
beforeAll(() => {
  // Extender todas las funciones mock con los métodos necesarios
  const originalMock = jest.fn;
  jest.fn = (...args) => {
    const mockFn = originalMock(...args);
    
    // Asegurar que todas las funciones de mock estén disponibles
    if (!mockFn.mockResolvedValue) {
      mockFn.mockResolvedValue = (value) => {
        return mockFn.mockImplementation(() => Promise.resolve(value));
      };
    }
    
    if (!mockFn.mockRejectedValue) {
      mockFn.mockRejectedValue = (err) => {
        return mockFn.mockImplementation(() => Promise.reject(err));
      };
    }
    
    return mockFn;
  };
  
  // Configurar un gestor global de errores para las pruebas
  global.handleTestError = (error) => {
    console.error('Error en prueba:', error);
    throw error;
  };
});

// Limpiar todos los mocks después de cada prueba
afterEach(() => {
  jest.clearAllMocks();
});
