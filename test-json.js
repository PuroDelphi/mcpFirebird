// Script para probar la función compactJsonStringify
import { compactJsonStringify } from './dist/utils/json.js';

// Objeto con múltiples niveles y diferentes tipos de datos
const testObject = {
  success: true,
  result: {
    id: 1,
    name: "Prueba\nCon\nSaltos\nDe\nLínea",
    items: [
      {
        id: 1,
        description: "Línea 1\nLínea 2"
      },
      {
        id: 2,
        description: "Línea 3\nLínea 4"
      }
    ],
    metadata: {
      created: "2025-03-31",
      status: "active\ninactive\npending"
    }
  }
};

console.log("JSON normal:");
console.log(JSON.stringify(testObject, null, 2));
console.log("\n------------------------------\n");

console.log("JSON compacto sin saltos de línea:");
console.log(compactJsonStringify(testObject));

// Verificar si hay saltos de línea en el JSON compacto
const compactJson = compactJsonStringify(testObject);
const hasNewlines = compactJson.includes("\n");

console.log("\n------------------------------\n");
console.log(`¿Contiene saltos de línea? ${hasNewlines ? 'SÍ (ERROR)' : 'NO (CORRECTO)'}`);

if (hasNewlines) {
  console.error("ERROR: El JSON compacto todavía contiene saltos de línea");
  process.exit(1);
} else {
  console.log("ÉXITO: El JSON compacto no contiene saltos de línea");
  process.exit(0);
}
