# Depuración y solución de problemas en MCP Firebird

Este documento proporciona información para solucionar problemas comunes con MCP Firebird.

## Problemas comunes

### Error de conexión a la base de datos

**Síntoma**: Error "No se puede conectar a la base de datos" o "Connection refused".

**Posibles soluciones**:
1. Verifica que el servidor Firebird esté en ejecución.
2. Comprueba que la ruta de la base de datos sea correcta.
3. Verifica las credenciales de usuario y contraseña.
4. Asegúrate de que el host y puerto sean correctos.

```bash
# Verificar la conexión a la base de datos
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey --test-connection
```

### Error "No database specified"

**Síntoma**: Error "No database specified" al ejecutar herramientas de base de datos.

**Posibles soluciones**:
1. Asegúrate de que la variable de entorno `FIREBIRD_DATABASE` esté configurada.
2. Proporciona la ruta de la base de datos como parámetro.
3. Verifica que la ruta de la base de datos sea accesible.

```bash
# Configurar la variable de entorno
export FIREBIRD_DATABASE=/path/to/database.fdb

# O proporcionar como parámetro
npx mcp-firebird --database /path/to/database.fdb
```

### Error "spawn gbak ENOENT"

**Síntoma**: Error "spawn gbak ENOENT" al intentar hacer backup o restore.

**Posibles soluciones**:
1. Instala las herramientas cliente de Firebird.
2. Añade el directorio bin de Firebird a la variable PATH.
3. Usa la imagen Docker basada en Debian que incluye las herramientas.

```bash
# En Debian/Ubuntu
sudo apt-get install firebird3.0-utils

# En Windows, añade a PATH
# C:\Program Files\Firebird\Firebird_X_X\bin
```

### Error de transporte con Claude Desktop

**Síntoma**: Claude Desktop no puede conectar con MCP Firebird o muestra errores de transporte.

**Posibles soluciones**:
1. Verifica la configuración en `claude_desktop_config.json`.
2. Asegúrate de usar rutas absolutas en la configuración.
3. Reinicia Claude Desktop completamente.
4. Verifica que MCP Firebird esté instalado globalmente o usa la ruta completa.

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--database",
        "C:\\absolute\\path\\to\\database.fdb"
      ],
      "type": "stdio"
    }
  }
}
```

### Problemas con SSE

**Síntoma**: No se puede conectar al servidor SSE o no se reciben eventos.

**Posibles soluciones**:
1. Verifica que el puerto SSE esté expuesto y accesible.
2. Comprueba que no haya conflictos de puerto.
3. Verifica la configuración CORS si accedes desde un navegador.
4. Usa el proxy SSE si es necesario.

```bash
# Iniciar con transporte SSE en un puerto específico
npx mcp-firebird --transport-type sse --sse-port 3003
```

## Habilitando logs detallados

Para obtener más información sobre los problemas, puedes habilitar logs detallados:

```bash
# Configurar nivel de log a debug
export LOG_LEVEL=debug

# Iniciar MCP Firebird con logs detallados
npx mcp-firebird
```

## Verificando la instalación

Para verificar que MCP Firebird está instalado correctamente:

```bash
# Verificar la versión
npx mcp-firebird --version

# Verificar la conexión a la base de datos
npx mcp-firebird --test-connection
```

## Contacto y soporte

Si encuentras problemas que no puedes resolver, puedes:

1. Abrir un issue en el [repositorio de GitHub](https://github.com/PuroDelphi/mcpFirebird)
2. Consultar la documentación oficial en la carpeta `docs/`
3. Contactar al equipo de soporte en soporte@asistentesautonomos.com
