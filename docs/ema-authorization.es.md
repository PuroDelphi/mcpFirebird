# Autorización Gestionada (EMA)

La **Autorización Gestionada** (o **EMA** por sus siglas en inglés, Environment Managed Authorization) es una nueva característica diseñada para mejorar la seguridad al conectar el servidor MCP de Firebird con interfaces que exigen controles de acceso estrictos, tales como servidores expuestos mediante contenedores, flujos automatizados (n8n), o implementaciones locales seguras.

En lugar de requerir que las contraseñas de las bases de datos y la configuración del servidor MCP se ingresen de forma estática en la línea de comandos (donde son visibles para otros procesos del sistema), EMA abstrae esto pidiendo solo una **Clave API**.

---

## 1. ¿Cómo Funciona EMA?

Cuando inicias `mcp-firebird`, en lugar de pasarle el nombre de usuario, host, y base de datos como flags, le pasas únicamente el flag `--api-key`.

Esta clave será utilizada por el servidor para verificar que el cliente tiene permitido conectarse y para inyectar, desde tu sistema de variables de entorno seguro (`.env` o secretos de Docker), los credenciales reales de Firebird (`FIREBIRD_REAL_PASSWORD`, etc.).

### Beneficios
- **Seguridad**: Las contraseñas nunca aparecen en el registro de procesos (evitando vulnerabilidades tipo `ps -ef`).
- **Control centralizado**: Los secretos se manejan mediante archivos `.env` seguros.
- **Transparente**: Al invocar el modo EMA mediante `--api-key`, el servidor sabe automáticamente que debe forzar el modo de conexión más seguro posible (como habilitar el Driver Nativo en automático).

---

## 2. Configuración de EMA

### Paso 1: Configurar el archivo `.env`
Asegúrate de contar con un archivo `.env` en el directorio desde donde ejecutas el servidor (o tener estas variables configuradas en tu entorno de contenedores).

```env
# Configuración real de tu servidor (Mantenla en secreto)
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=C:\camino\a\tu\base_datos.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=tu_super_secreto
FIREBIRD_ROLE=
```

### Paso 2: Iniciar el servidor usando EMA

Lanza el servidor `mcp-firebird` usando el flag `--api-key` y asígnale un token, o si lo omites pero proporcionas el flag, el sistema utilizará el valor de la variable de entorno `FIREBIRD_CLIENT_TOKEN`.

**Ejemplo desde línea de comandos local:**
```bash
npx -y mcp-firebird --api-key="mi-token-secreto"
```

**Ejemplo de configuración en un Cliente MCP (Claude Desktop):**
```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-firebird",
        "--api-key",
        "mi-token-secreto"
      ],
      "env": {
        "FIREBIRD_DATABASE": "F:\\Ruta\\a\\tu\\bd.FDB",
        "FIREBIRD_PASSWORD": "tu_password_real"
      }
    }
  }
}
```

---

## 3. EMA y el Driver Nativo

Una ventaja importante de EMA es que `mcp-firebird` ha sido programado para entender que, si pasas una `api-key` desde la interfaz CLI, **prioriza habilitar automáticamente el Driver Nativo de Firebird**. 

Esto es así porque EMA está pensado para entornos de producción, y el Driver Nativo es el único que soporta **Wire Encryption** (encriptación nativa en red de Firebird 3.0+) y el manejo confiable y robusto de **Eventos y Triggers**.

Por lo tanto:
> Al invocar `--api-key`, habilitas tanto la Autorización Gestionada como las capacidades de Streaming Bidireccional de la base de datos de manera simultánea.
