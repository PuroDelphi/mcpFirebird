# MCP Firebird

Implementación del protocolo MCP (Model Context Protocol) de Anthropic para bases de datos Firebird.

## ¿Qué es MCP Firebird?

MCP Firebird es un servidor que implementa el [Protocolo de Contexto de Modelo (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) de Anthropic para bases de datos [Firebird SQL](https://firebirdsql.org/). Permite a los Modelos de Lenguaje de Gran Tamaño (LLMs) como Claude acceder, analizar y manipular datos en bases de datos Firebird de manera segura y controlada.

## Características principales

- **Consultas SQL**: Ejecuta consultas SQL en bases de datos Firebird
- **Análisis de esquema**: Obtiene información detallada sobre tablas, columnas y relaciones
- **Gestión de bases de datos**: Realiza operaciones de backup, restore y validación
- **Análisis de rendimiento**: Analiza el rendimiento de consultas y sugiere optimizaciones
- **Múltiples transportes**: Soporta transportes STDIO y SSE (Server-Sent Events)
- **Integración con Claude**: Funciona perfectamente con Claude Desktop y otros clientes MCP
- **Seguridad**: Incluye validación de consultas SQL y opciones de configuración de seguridad

## Instalación rápida

```bash
# Instalación global
npm install -g mcp-firebird

# Ejecutar el servidor
npx mcp-firebird --database /path/to/database.fdb
```

Para operaciones de backup/restore, necesitarás instalar las herramientas cliente de Firebird. Ver [Instalación completa](./docs/installation.md) para más detalles.

## Uso básico

### Con Claude Desktop

1. Edita la configuración de Claude Desktop:
   ```bash
   code $env:AppData\Claude\claude_desktop_config.json  # Windows
   code ~/Library/Application\ Support/Claude/claude_desktop_config.json  # macOS
   ```

2. Añade la configuración de MCP Firebird:
   ```json
   {
     "mcpServers": {
       "mcp-firebird": {
         "command": "npx",
         "args": [
           "mcp-firebird",
           "--database",
           "C:\\path\\to\\database.fdb"
         ],
         "type": "stdio"
       }
     }
   }
   ```

3. Reinicia Claude Desktop

### Con transporte SSE

```bash
# Iniciar con transporte SSE
npx mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb
```

## Documentación

Para información más detallada, consulta los siguientes documentos:

- [Instalación completa](./docs/installation.md)
- [Opciones de configuración](./docs/configuration.md)
- [Herramientas disponibles](./docs/tools.md)
- [Configuración de Docker](./docs/docker.md)
- [Uso desde diferentes lenguajes](./docs/clients.md)
- [Seguridad](./docs/security.md)
- [Solución de problemas](./docs/troubleshooting.md)
- [Casos de uso y ejemplos](./docs/use-cases.md)

## Versiones recientes

### Versión 2.0.7-alpha.3

- Mejorada la detección de herramientas cliente de Firebird
- Actualizado el Dockerfile para usar Debian en lugar de Alpine
- Corregidos problemas con las operaciones de backup/restore
- Mejorada la documentación y organización

### Versión 2.0.5-alpha.27

- Añadido soporte para transporte SSE
- Mejorada la compatibilidad con Claude Desktop
- Añadidas herramientas de análisis de rendimiento
- Corregidos problemas de conexión a la base de datos

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.
