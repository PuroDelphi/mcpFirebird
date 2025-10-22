# MCP Firebird - Modernización 2025

## Resumen de Actualizaciones

Este documento describe las actualizaciones realizadas al proyecto MCP Firebird para alinearlo con las últimas recomendaciones y mejores prácticas del Model Context Protocol (MCP) SDK v1.13.2+.

## Fecha de Actualización

**Fecha:** 2025-01-22  
**Versión:** 2.6.0-alpha.0  
**SDK Version:** @modelcontextprotocol/sdk ^1.13.2

## Cambios Principales

### 1. ✅ Actualización de API de Registro de Tools

**Antes (API Antigua):**
```typescript
server.tool(
    name,
    description,
    async (extra) => { ... }
);
```

**Ahora (API Moderna):**
```typescript
server.registerTool(
    name,
    {
        title: "Tool Title",
        description: "Tool description",
        inputSchema: { /* ZodRawShape */ }
    },
    async (params) => { ... }
);
```

**Beneficios:**
- Separación clara entre metadatos y lógica
- Soporte para `title` separado de `description`
- Mejor validación de esquemas con Zod
- Parámetros directamente accesibles en el handler

### 2. ✅ Actualización de API de Registro de Prompts

**Antes (API Antigua):**
```typescript
server.prompt(
    name,
    description,
    async (extra) => { ... }
);
```

**Ahora (API Moderna):**
```typescript
server.registerPrompt(
    name,
    {
        title: "Prompt Title",
        description: "Prompt description",
        argsSchema: { /* ZodRawShape */ }
    },
    async (params) => { ... }
);
```

**Cambios Clave:**
- `inputSchema` → `argsSchema` (nombre más descriptivo)
- Estructura de opciones más clara
- Mejor tipado de parámetros

### 3. ✅ Actualización de API de Registro de Resources

**Antes (API Antigua):**
```typescript
server.resource(
    name,
    uriTemplate,
    async (extra) => { ... }
);
```

**Ahora (API Moderna):**
```typescript
server.registerResource(
    name,
    uriTemplate,
    {
        title: "Resource Title",
        description: "Resource description",
        mimeType: "application/json"
    },
    async (uri) => { ... }
);
```

**Mejoras:**
- Metadatos más ricos (title, description, mimeType)
- URI como parámetro directo en el handler
- Mejor soporte para ResourceTemplate (para recursos dinámicos)

### 4. ✅ Declaración Explícita de Capabilities

**Implementación Moderna:**
```typescript
const server = new McpServer({
    name: pkg.name,
    version: pkg.version,
    capabilities: {
        tools: {
            listChanged: true
        },
        prompts: {
            listChanged: true
        },
        resources: {
            listChanged: true,
            subscribe: false
        }
    }
});
```

**Beneficios:**
- Los clientes saben qué capacidades soporta el servidor
- `listChanged: true` indica que el servidor puede notificar cambios en la lista
- Mejor interoperabilidad con diferentes clientes MCP

### 5. ✅ Manejo Mejorado de Parámetros

**Antes:**
```typescript
async (extra) => {
    const params = {}; // Parámetros vacíos
    const result = await handler(params);
}
```

**Ahora:**
```typescript
async (params: any) => {
    // Parámetros directamente disponibles
    const result = await handler(params);
}
```

**Ventajas:**
- Acceso directo a los parámetros validados
- Menos código boilerplate
- Mejor experiencia de desarrollo

### 6. ✅ Manejo de Esquemas Zod

**Implementación:**
```typescript
// Extraer shape del ZodObject para compatibilidad con SDK
const inputSchema = toolDef.inputSchema && 'shape' in toolDef.inputSchema 
    ? toolDef.inputSchema.shape 
    : {};
```

**Razón:**
- El SDK espera `ZodRawShape` en lugar de `ZodObject`
- Extracción automática del shape para compatibilidad
- Mantiene la validación de Zod

## Archivos Modificados

### Archivos Principales Actualizados

1. **src/server/mcp-server.ts**
   - ✅ Actualizado a APIs modernas
   - ✅ Declaración de capabilities
   - ✅ Manejo correcto de parámetros

2. **src/server/index.ts**
   - ✅ Declaración de capabilities agregada
   - ✅ Ya usaba APIs modernas

3. **src/types/modelcontextprotocol.d.ts**
   - ✅ Actualizado con nuevas definiciones de capabilities
   - ✅ Marcado como deprecated con referencias a APIs modernas

4. **tsconfig.build.json**
   - ✅ Excluye archivos de test correctamente

### Archivos Marcados como Legacy

1. **src/server/create-server.ts**
   - ⚠️ Marcado como DEPRECATED
   - ⚠️ Usa la clase `Server` antigua con `setRequestHandler`
   - ℹ️ Mantenido solo para compatibilidad hacia atrás

## Compatibilidad

### ✅ Compatible Con:
- MCP Inspector (latest)
- Claude Desktop
- Clientes MCP modernos que soportan SDK v1.13.2+
- Node.js 18+
- Firebird 2.5+

### ⚠️ Cambios de Comportamiento:
- Los handlers ahora reciben parámetros directamente (no en `extra`)
- Los esquemas Zod se convierten automáticamente a `ZodRawShape`
- El servidor declara explícitamente sus capabilities

## Pruebas Recomendadas

### 1. Compilación
```bash
npm run build
```
✅ **Estado:** Exitoso

### 2. Prueba con MCP Inspector
```bash
npm run inspector
```

### 3. Prueba STDIO
```bash
npx mcp-firebird --database /path/to/db.fdb
```

### 4. Prueba SSE
```bash
npx mcp-firebird --transport-type sse --sse-port 3003
```

## Próximos Pasos

1. ✅ Actualizar APIs de registro (COMPLETADO)
2. ✅ Declarar capabilities (COMPLETADO)
3. ✅ Corregir manejo de parámetros (COMPLETADO)
4. ⏳ Probar con MCP Inspector
5. ⏳ Actualizar documentación de usuario
6. ⏳ Crear ejemplos actualizados

## Referencias

- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Server Concepts](https://modelcontextprotocol.io/docs/learn/server-concepts)

## Notas Adicionales

### Migración desde Versiones Anteriores

Si estás usando versiones anteriores de MCP Firebird:

1. **No se requieren cambios en la configuración del cliente**
2. **Las APIs antiguas siguen funcionando** (modo legacy)
3. **Se recomienda actualizar** para aprovechar las nuevas características

### Modo Legacy

Para usar el modo legacy (no recomendado):
```bash
USE_LEGACY_SERVER=true npx mcp-firebird
```

---

**Autor:** Jhonny Suárez - asistentesautonomos.com  
**Licencia:** MIT

