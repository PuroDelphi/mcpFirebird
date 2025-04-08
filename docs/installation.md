# Instalación de MCP Firebird

Este documento proporciona instrucciones detalladas para instalar MCP Firebird y sus dependencias.

## Instalación del paquete Node.js

MCP Firebird está disponible como un paquete npm que puede instalarse globalmente o como dependencia de un proyecto:

```bash
# Instalación global
npm install -g mcp-firebird

# Instalación en un proyecto
npm install mcp-firebird
```

## Herramientas cliente de Firebird

Para las funciones de gestión de bases de datos (backup, restore, validación), necesitas instalar las herramientas cliente de Firebird:

### Windows

1. Descarga Firebird desde https://firebirdsql.org/en/downloads/
2. Ejecuta el instalador y selecciona "Componentes cliente" durante la instalación
3. Añade el directorio bin de Firebird a tu variable de entorno PATH
   (típicamente C:\Program Files\Firebird\Firebird_X_X\bin)
4. Reinicia tu terminal o aplicación

### macOS

```bash
# Usando Homebrew
brew install firebird
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get install firebird3.0-utils
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install firebird-utils
```

### Alpine Linux

Alpine Linux no incluye las herramientas cliente de Firebird necesarias para operaciones de backup/restore.
Se recomienda usar Debian/Ubuntu para estas operaciones.

## Verificación de la instalación

Para verificar que MCP Firebird se ha instalado correctamente, ejecuta:

```bash
npx mcp-firebird --version
```

Deberías ver la versión actual de MCP Firebird.

## Próximos pasos

Una vez instalado, puedes:

1. [Configurar MCP Firebird](./configuration.md)
2. [Ejecutar MCP Firebird con Docker](./docker.md)
3. [Explorar las herramientas disponibles](./tools.md)
