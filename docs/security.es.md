# Seguridad en MCP Firebird

[English](security.md)

Esta guía corresponde a **2.11.0-alpha.2**, no a versiones anteriores de npm. Consulta también la [revisión de implementación](security-implementation-review.md) y el [historial de cambios](../CHANGELOG.md).

## Aviso de migración

La documentación anterior presentaba incorrectamente las opciones `sql` y varias funciones auxiliares como protecciones efectivas. Esta alpha conecta la política a la ejecución y rechaza consultas que no puede comprobar con seguridad.

- Un archivo seleccionado inválido o inexistente impide arrancar; ya no se continúa con valores predeterminados.
- `ALLOW_RAW_SQL=true` no omite las restricciones de operaciones. DDL necesita autorización adicional.
- Las consultas del usuario a tablas de sistema están bloqueadas por defecto; las consultas internas fijas de metadatos siguen disponibles con sus permisos.
- Ahora se aplican límites de filas, respuesta, cantidad de consultas, frecuencia y tiempo. Los metadatos también consumen cuota.
- Con restricciones de tablas, filas, enmascaramiento o roles se admite un subconjunto conservador de SQL de una sola tabla. Joins, CTE, subconsultas y rutinas opacas se rechazan.
- Las suscripciones compartidas a eventos no están disponibles con políticas restringidas: el gestor anterior no aísla usuarios.

Prueba tus consultas antes de desplegar la alpha. **Utiliza una cuenta Firebird con privilegios mínimos, no SYSDBA.** Las comprobaciones del MCP no sustituyen los permisos de la base ni inspeccionan todas las dependencias de vistas y rutinas.

## Cargar la configuración

Precedencia: ruta explícita programática; `--security-config`; `FIREBIRD_SECURITY_CONFIG`; `SECURITY_CONFIG`; `SECURITY_CONFIG_PATH`; por último `FIREBIRD_SECURITY_JSON` cuando no hay ruta seleccionada.

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES", "DEPARTMENTS"],
    "allowedOperations": ["SELECT"],
    "maxRows": 100
  },
  "sql": {
    "allowSystemTables": false,
    "allowedSystemTables": [],
    "allowDDL": false,
    "allowUnsafeQueries": false
  }
}
```

```bash
node dist/cli.js --security-config /ruta/absoluta/security-config.json
```

Se admiten JSON y CommonJS de confianza (`.cjs`, o `.js` en contexto CommonJS). CommonJS ejecuta código. JSON solo admite `security` y `sql` en la raíz; CommonJS puede conservar otras propiedades de la aplicación. La política se valida estrictamente, incluidas claves anidadas y expresiones regulares. Utiliza `--security-config`, no el ejemplo antiguo incorrecto `--config`.

Los errores de carga/validación detienen el inicio. No se mezclan fuentes. Los campos omitidos conservan valores predeterminados. Reinicia y comprueba el mensaje `Loaded security configuration from ...`.

## Configuración JSON sin archivos

`FIREBIRD_SECURITY_JSON` acepta el mismo objeto. Puedes poner `sql` en la raíz o dentro de `security`, pero nunca en ambos lugares. También se admite un objeto que solo contenga `sql`.

Ejemplo de `env` del cliente MCP, manteniendo tus parámetros de conexión:

```json
{
  "FIREBIRD_SECURITY_JSON": "{\"security\":{\"allowedOperations\":[\"SELECT\"],\"maxRows\":100},\"sql\":{\"allowedSystemTables\":[\"RDB$PROCEDURES\"],\"allowDDL\":false}}"
}
```

```powershell
$env:FIREBIRD_SECURITY_JSON = '{"security":{"allowedOperations":["SELECT"]},"sql":{"allowedSystemTables":["RDB$PROCEDURES"]}}'
node dist/cli.js
```

El límite es 64 KiB UTF-8; el sistema operativo puede imponer uno inferior. JSON vacío, inválido o demasiado grande detiene el inicio. Elimina la variable para desactivarla. El cargador no registra el JSON ni detalles de validación que puedan contener secretos.

Solo debe configurarla el administrador o lanzador de confianza. Los clientes HTTP/SSE no pueden modificarla mediante peticiones. Con `appsettings.json`, tu aplicación debe leerlo, serializar la política y pasarla al entorno del proceso hijo. El MCP no lee ese archivo automáticamente. Las rutas de archivo tienen prioridad; elimínalas si quieres seleccionar JSON.

## Opciones SQL

| Opción | Predeterminado | Efecto |
| --- | --- | --- |
| `allowSystemTables` | `false` | Bloquea consultas del usuario a relaciones `RDB$`, `MON$`, `SEC$`, salvo excepciones. `true` permite leerlas sin omitir otros permisos. |
| `allowedSystemTables` | `[]` | Nombres exactos permitidos como excepciones de solo lectura. |
| `allowDDL` | `false` | Puerta adicional para CREATE, ALTER, DROP, RECREATE, GRANT, REVOKE y COMMENT. |
| `allowUnsafeQueries` | `false` | Autoriza UNION y llamadas opacas en despliegues de confianza sin políticas restringidas; nunca desactiva los demás controles. |

Las escrituras directas en relaciones de sistema, múltiples sentencias, SQL dinámico y bloques procedurales se rechazan siempre. Los metadatos internos usan SQL fijo/parametrizado; el cliente no puede solicitar esa excepción. Si utilizas `allowedTables`, incluye también las relaciones de catálogo consultadas directamente: los permisos son acumulativos.

Para DDL necesitas `ALLOW_RAW_SQL=true`, `sql.allowDDL=true` y la operación en `allowedOperations`, sin aparecer en `forbiddenOperations`. Ejemplo:

```json
{
  "security": {
    "allowedOperations": ["SELECT", "CREATE"],
    "forbiddenOperations": ["DROP", "ALTER", "GRANT", "REVOKE"]
  },
  "sql": { "allowDDL": true }
}
```

Las llamadas a funciones no reconocidas y `EXECUTE PROCEDURE` requieren además `allowUnsafeQueries=true`, permiso EXECUTE y ausencia de restricciones de tablas, filas, enmascaramiento o roles. Sus cuerpos pueden tener efectos secundarios; el MCP no los inspecciona. Esto no es un parser completo de Firebird ni un entorno inmune a inyección: parametriza los valores y limita los privilegios de la cuenta.

## Tablas y operaciones

`allowedTables`, `forbiddenTables` y `tableNamePattern` se comprueban en la ejecución, los metadatos y la visibilidad de listados. Usa nombres exactos de la base: el SQL sin comillas convierte identificadores a mayúsculas; las comillas preservan el caso. Los metadatos de rutinas usan su nombre de objeto; los triggers usan su tabla asociada. Las herramientas que normalizan tablas a mayúsculas comprueban ese nombre normalizado.

Se permiten SELECT y EXECUTE por defecto; se prohíben DROP, TRUNCATE, ALTER, GRANT y REVOKE. Las listas de operaciones utilizan mayúsculas y la prohibición prevalece. Los metadatos de rutinas requieren EXECUTE y SELECT para su consulta interna.

Con políticas restringidas se aceptan sentencias de una sola tabla. Utiliza vistas con permisos y filtros definidos en Firebird para informes complejos; autorizar una vista no comprueba automáticamente todas sus dependencias.

## Filtrado de filas y enmascaramiento

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES"],
    "allowedOperations": ["SELECT"],
    "rowFilters": { "EMPLOYEES": "IS_PUBLIC_PROFILE = 1" },
    "dataMasking": [{ "columns": ["SSN"], "pattern": "^.*$", "replacement": "[REDACTED]" }]
  }
}
```

Los filtros son expresiones SQL del administrador de confianza. Se aplican en una tabla derivada antes del WHERE, paginación y agregación del usuario; un OR no puede eliminarlos. No se admiten placeholders ni subconsultas en el predicado configurado. Las tablas con filtro son de solo lectura: se rechazan escrituras en lugar de fingir comprobaciones equivalentes a permisos de escritura de la base.

El enmascaramiento ocurre tras resolver BLOB y antes de responder o auditar resultados. Los alias directos conservan la regla de su columna original. Se admite SELECT * o columnas directas con alias; se rechazan expresiones, nombres de salida duplicados y escrituras. Un fallo no devuelve datos sin ocultar. Usa regex confiables y eficientes. El enmascaramiento no evita inferencias mediante condiciones o tiempos: para eso usa vistas restringidas en Firebird.

`get-table-data` mantiene filtros estructurados parametrizados: eq, ne, gt, gte, lt, lte, like, in, isNull, isNotNull. No admite cláusulas where/orderBy libres. Las estadísticas y análisis también están sujetos a estas reglas y pueden rechazarse si requieren expresiones con enmascaramiento activo.

## Límites de recursos

Valores predeterminados: `maxRows=1000`, `queryTimeout=5000`; dentro de `resourceLimits`: `maxRowsPerQuery=5000`, `maxResponseSize=5242880`, `maxQueryCpuTime=10000`, `maxQueriesPerSession=100`, `rateLimit={"queriesPerMinute":60,"burstLimit":20}`.

Se aplica el menor límite de filas. Los resultados excesivos se rechazan, no se truncan silenciosamente. Se mide el tamaño JSON en bytes UTF-8, incluyendo comprobaciones de respuestas agregadas de herramientas/recursos. La comprobación ocurre después de materializar datos del driver: no limita la memoria del servidor Firebird. Utiliza FIRST/ROWS y controles de la base.

El menor de `queryTimeout` y el nombre heredado `maxQueryCpuTime` es un plazo de tiempo transcurrido, no una medición de CPU. Incluye conexión, consulta y lectura BLOB. Se descartan conexiones vencidas y conexiones que llegan tarde. No garantiza cancelación inmediata en Firebird; una escritura puede haberse confirmado. No la reintentes automáticamente.

La frecuencia utiliza un cubo de tokens con ráfaga inicial `burstLimit` y reposición `queriesPerMinute`. Cada consulta física, incluidas iteraciones de lotes y metadatos, consume cuota. La sesión de seguridad corresponde al proceso STDIO, sujeto OAuth, clave API compartida o IP del socket no autenticado. Abrir otra sesión MCP no reinicia el contador. Se reinicia al reiniciar el proceso; hay un máximo de 10.000 identidades y se rechazan identidades nuevas al alcanzarlo. Ajusta cuotas para esquemas grandes y procesos duraderos.

## Autenticación y roles HTTP/SSE

`FIREBIRD_API_KEY` conserva autenticación `Authorization: Bearer ...`. No utilices claves en URL y protege el transporte con HTTPS. Con `authorization.type="basic"`, esa clave representa el rol `user`; configura sus permisos. No es un directorio de contraseñas HTTP Basic. Sin permisos de rol, se deniega acceso a la base.

OAuth2 usa `authorization.type="oauth2"`, la sección `oauth2` con `tokenVerifyUrl` HTTPS, `clientId`, `clientSecret` y `scope` opcional, y `rolePermissions`. Ejemplo completo en la [guía inglesa](security.md#httpsse-authentication-and-role-permissions).

El servidor envía `token` como formulario al endpoint, con credenciales Basic del cliente, sin redirecciones y con un plazo de cinco segundos. Exige `active:true`, identidad sub/user_id y role o primer elemento de roles; comprueba expiración informada y scopes requeridos. El servidor de autorización debe validar audiencia y condiciones de emisión. Tokens inválidos, identidad ausente y fallos del servicio deniegan acceso.

En modo OAuth el Bearer es el token OAuth, no la clave estática. Identidad verificada, permisos de rol y restricciones globales se aplican juntos. Las sesiones HTTP/SSE pertenecen a su identidad original. STDIO no puede aportar esa identidad HTTP: utiliza una política independiente. Las suscripciones compartidas a eventos se deshabilitan con políticas restringidas.

## CORS

Se conserva origen `*`, cabecera Authorization permitida y credenciales del navegador desactivadas. STDIO y clientes de servidor no dependen de CORS. Para limitar navegadores configura `MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"`. CORS no sustituye autenticación; no expongas HTTP sin autenticación a Internet.

## Auditoría

Configura `security.audit` con `enabled:true`, `destination` (`file`, `database`, `both`), `auditFile`, `auditTable`, `detailLevel` (`basic`, `medium`, `full`) y banderas `logQueries`, `logParameters`, `logResponses`.

Los archivos son JSON por líneas. La auditoría de base usa nombre validado, inserts parametrizados y claves UUID; crea la tabla si falta con tipos compatibles con Firebird 2.5. La cuenta necesita permisos para esa configuración interna. Si existe un esquema antiguo incompatible, utiliza otro nombre de tabla: no se ignora el fallo de inicialización.

Se registra intención antes de ejecutar y resultado/fallo después. Basic omite SQL/parámetros/respuestas; medium admite SQL; full admite también parámetros/respuestas según sus banderas. Las respuestas llegan enmascaradas. SQL y parámetros pueden contener secretos: configura permisos, rotación y retención externos.

Si falla el registro, no se ejecuta la consulta o se retiene el resultado. Un fallo posterior a una escritura no la revierte; la auditoría no comparte transacción con ella. Los rechazos se registran cuando es posible. No se promete un registro inalterable de cumplimiento normativo.

## Comprobación

Ejecuta `npm run build` y `npm test -- --runInBand`. El script optativo `scripts/security-firebird-smoke.mjs` crea/elimina una base local temporal con UUID y prueba la ejecución real.

El MCP no proporciona aislamiento del sistema operativo, terminación TLS, contabilidad CPU de Firebird ni protección automática sobre toda dependencia indirecta. Usa privilegios mínimos, HTTPS, firewall, copias de seguridad y pruebas antes de desplegar.
