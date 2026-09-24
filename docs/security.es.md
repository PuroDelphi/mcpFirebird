# Seguridad en MCP Firebird

[English](security.md)

Esta guía corresponde a **2.11.0-alpha.3**, no a versiones anteriores de npm. Consulta también la [revisión de implementación](security-implementation-review.md) y el [historial de cambios](../CHANGELOG.md).

## Aviso de migración

**La seguridad avanzada es optativa.** Sin configuración (o con objetos `security`/`sql` vacíos) se conserva el soporte anterior de catálogo, procedimientos ejecutables/seleccionables, funciones, joins y CTE. No se imponen límites nuevos de filas/tamaño, plazos de cinco segundos, cuotas de 100 consultas ni frecuencia. Se mantienen la validación anterior, filtros parametrizados, autenticación por clave API y CORS. `ALLOW_RAW_SQL=true` sigue habilitando escrituras, incluido DDL, si ninguna política explícita las prohíbe.

Las funciones de seguridad antes desconectadas ahora están implementadas, pero solo se aplican al configurarlas. Consideraciones al activarlas:

- Un archivo seleccionado inválido o inexistente impide arrancar; ya no se continúa con valores predeterminados.
- `ALLOW_RAW_SQL=true` no omite restricciones explícitas de operaciones ni `sql.allowDDL=false`.
- Las restricciones de catálogo se activan con `sql.allowSystemTables=false` o una lista `sql.allowedSystemTables`. Los metadatos internos siguen sujetos a sus permisos.
- Cada límite de filas, tamaño, cantidad, frecuencia o tiempo se activa por separado. Los omitidos quedan inactivos; los metadatos consumen cuota solo si se ha configurado.
- Con restricciones de tablas, filas, enmascaramiento o roles se admite un subconjunto conservador de SQL de una sola tabla. Joins, CTE, subconsultas y rutinas opacas se rechazan.
- Las suscripciones compartidas a eventos no están disponibles con políticas restringidas: el gestor anterior no aísla usuarios.

Prueba tus consultas antes de desplegar la alpha. **Utiliza una cuenta Firebird con privilegios mínimos, no SYSDBA.** Las comprobaciones del MCP no sustituyen los permisos de la base ni inspeccionan todas las dependencias de vistas y rutinas.

Para conservar la compatibilidad, deja sin establecer las fuentes de seguridad. Para activar únicamente un límite de filas usa `FIREBIRD_SECURITY_JSON='{"security":{"maxRows":1000}}'`: no activa plazos, cuotas ni restricciones SQL adicionales. Para desactivar un control elimina su propiedad y reinicia. Si una configuración antigua ya contiene opciones antes inactivas, ahora sí se aplican porque se han especificado expresamente. No elimines indiscriminadamente políticas cuyos permisos necesites conservar.

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
| `allowSystemTables` | Omitido | Acceso histórico al catálogo. `false` restringe lecturas RDB$/MON$/SEC$ a la lista; `true` permite lecturas generales sin omitir otros permisos. |
| `allowedSystemTables` | Omitido | Configurar una lista activa la restricción de catálogo salvo `allowSystemTables=true`; `[]` no permite ninguna. |
| `allowDDL` | Omitido | Conserva la puerta de escritura histórica. `false` bloquea CREATE, ALTER, DROP, RECREATE, GRANT, REVOKE y COMMENT; `true` permite considerarlos, respetando ALLOW_RAW_SQL y los permisos configurados. |
| `allowUnsafeQueries` | Omitido | Validación y soporte de rutinas anteriores. `false` activa análisis conservador y bloquea UNION/rutinas opacas; `true` permite SQL de confianza como UNION si no contradice políticas de tablas, filas, roles, enmascaramiento o catálogo. |

Se siguen rechazando múltiples sentencias. El análisis conservador se activa con políticas de tablas/filas/enmascaramiento/roles, restricciones de catálogo o `allowUnsafeQueries=false`; rechaza además escrituras de sistema, SQL dinámico, bloques y sintaxis que no puede comprobar (incluidos joins con coma y procedimientos seleccionables). Configurar solo límites o auditoría no restringe las formas SQL. Los metadatos internos usan SQL fijo/parametrizado; el cliente no puede solicitar esa excepción. Si utilizas `allowedTables`, incluye también las relaciones de catálogo consultadas directamente: los permisos son acumulativos.

Para DDL necesitas `ALLOW_RAW_SQL=true` y respetar las listas de operaciones si las configuras. `sql.allowDDL=false` lo bloquea; sin política SQL no hace falta una bandera adicional. Ejemplo de permisos explícitos:

```json
{
  "security": {
    "allowedOperations": ["SELECT", "CREATE"],
    "forbiddenOperations": ["DROP", "ALTER", "GRANT", "REVOKE"]
  },
  "sql": { "allowDDL": true }
}
```

Las funciones opacas y `EXECUTE PROCEDURE` mantienen su disponibilidad anterior sin banderas nuevas cuando no hay políticas restrictivas. Se bloquean con restricciones de tablas, filas, enmascaramiento, roles, catálogo o `allowUnsafeQueries=false`: sus cuerpos podrían eludir esos controles. Pueden tener efectos secundarios y no se inspeccionan. No es un parser completo ni un entorno inmune a inyección: parametriza y limita privilegios. La ruta compatible conserva la validación heurística anterior, incluido rechazar comentarios y UNION salvo habilitación explícita de consultas de confianza.

## Tablas y operaciones

`allowedTables`, `forbiddenTables` y `tableNamePattern` se comprueban en la ejecución, los metadatos y la visibilidad de listados. Usa nombres exactos de la base: el SQL sin comillas convierte identificadores a mayúsculas; las comillas preservan el caso. Los metadatos de rutinas usan su nombre de objeto; los triggers usan su tabla asociada. Las herramientas que normalizan tablas a mayúsculas comprueban ese nombre normalizado.

Las listas de operaciones están omitidas por defecto: SELECT/EXECUTE no necesitan ALLOW_RAW_SQL; el resto sí. Configura `allowedOperations` y `forbiddenOperations` para restringirlas, utilizando mayúsculas. Una lista de permitidas vacía deniega todo; una lista de prohibidas vacía no añade prohibiciones. Las denegaciones prevalecen incluso con ALLOW_RAW_SQL. Los metadatos de rutinas requieren EXECUTE y SELECT para su consulta interna.

Con políticas restringidas se aceptan sentencias de una sola tabla. Utiliza vistas con permisos y filtros definidos en Firebird para informes complejos; autorizar una vista no comprueba automáticamente todas sus dependencias.

Una política de operaciones que excluya o prohíba EXECUTE también activa el análisis conservador para impedir llamadas opacas ocultas dentro de SELECT. No activa cuotas ni restricciones de catálogo.

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

Todos los límites quedan inactivos si se omiten, incluso dentro de un objeto `resourceLimits` parcial. Ejemplo optativo, no valores predeterminados:

```json
{"security":{"maxRows":1000,"queryTimeout":5000,"resourceLimits":{"maxRowsPerQuery":5000,"maxResponseSize":5242880,"maxQueryCpuTime":10000,"maxQueriesPerSession":100,"rateLimit":{"queriesPerMinute":60,"burstLimit":20}}}}
```

Especifica solo los límites que quieras activar. Usa enteros positivos; para desactivar un límite elimina la propiedad y reinicia (cero/null no son válidos).

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
