import { config } from 'dotenv';

// Cargar variables de entorno
config();

// Configuración global para pruebas
process.env.NODE_ENV = 'test';

// Aumentar el timeout para las pruebas
jest.setTimeout(10000);

// Limpiar todos los mocks después de cada prueba
afterEach(() => {
  jest.clearAllMocks();
}); 