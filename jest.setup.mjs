// Configuración global para Jest
import { jest } from '@jest/globals';

// Aumentar el tiempo de espera para pruebas que puedan tardar más
jest.setTimeout(10000);

// Configuración global para mockear módulos ES
global.mockModule = (moduleToMock) => {
  // Función auxiliar para crear mocks en ES Modules
  return jest.fn().mockImplementation(() => moduleToMock);
};

// Silenciar advertencias específicas de Jest durante la ejecución de pruebas
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // Filtrar advertencias específicas de Jest o TypeScript que sabemos que son falsas alarmas
  if (
    args.length > 0 &&
    typeof args[0] === 'string' &&
    (args[0].includes('Invalid prop') || 
     args[0].includes('cannot be assigned to type') ||
     args[0].includes('has been imported after jest.mock()'))
  ) {
    return; // Ignorar esta advertencia
  }
  
  // Permitir que otras advertencias se muestren normalmente
  originalConsoleWarn(...args);
};
