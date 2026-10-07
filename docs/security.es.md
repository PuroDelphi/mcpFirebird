# Seguridad en MCP Firebird

[English](security.md)

Esta guía describe la estable **2.12.0**, incluidos los controles SQL de 2.11.0 y todas las mejoras HTTP/OAuth, de timeouts y de compatibilidad SQL de las cinco alphas de 2.12.0. Ya no es necesario instalar la alpha. Consulta las [notas de lanzamiento](releases/2.12.0.md), la [revisión de implementación](security-implementation-review.md) y el [historial de cambios](../CHANGELOG.md).

## Aviso de migración

**La seguridad avanzada es optativa.** Sin configuración (o con objetos `security`/`sql` vacíos) se conserva el soporte anterior de catálogo, procedimientos, funciones, joins y CTE. No se imponen límites nuevos de filas/tamaño, tiempo, cantidad de consultas ni frecuencia. Se mantienen los filtros parametrizados, autenticación por clave API y compatibilidad HTTP/CORS/OAuth. `ALLOW_RAW_SQL=true` sigue habilitando escrituras y DDL si ninguna política explícita las prohíbe. El endurecimiento HTTP se activa expresamente, como se explica más abajo.

Las funciones de seguridad antes desconectadas ahora están implementadas, pero solo se aplican al configurarlas. Consideraciones al activarlas:

- Un archivo seleccionado inválido o inexistente impide arrancar; ya no se continúa con valores predeterminados.
- `ALLOW_RAW_SQL=true` no omite restricciones explícitas de operaciones ni `sql.allowDDL=false`.
- Las restricciones de catálogo se activan con `sql.allowSystemTables=false` o una lista `sql.allowedSystemTables`. Los metadatos internos siguen sujetos a sus permisos.
- Cada límite de filas, tamaño, cantidad, frecuencia o tiempo se activa por separado. Los omitidos quedan inactivos; los metadatos consumen cuota solo si se ha configurado.
- Con restricciones de tablas, filas, enmascaramiento o roles se admite un subconjunto conservador de SQL de una sola tabla. Joins, CTE, subconsultas y rutinas opacas se rechazan.
- Las suscripciones compartidas a eventos no están disponibles con políticas restringidas: el gestor anterior no aísla usuarios.

Prueba tus consultas y políticas existentes antes de actualizar producción. **Utiliza una cuenta Firebird con privilegios mínimos, no SYSDBA.** Las comprobaciones del MCP no sustituyen los permisos de la base ni inspeccionan todas las dependencias de vistas y rutinas.

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

Desde `2.12.0-alpha.5`, el análisis conservador reconoce las formas simples `FROM (SELECT ...)`, `JOIN (SELECT ...)` y `JOIN ... USING (columna, ...)` (#41). Se admiten con políticas solo de operaciones/catálogo o con `allowUnsafeQueries=false` cuando no hay restricciones de tablas, filas, enmascaramiento o roles. Se siguen comprobando todas las relaciones y funciones anidadas; no se admiten joins por comas, relaciones calificadas ni rutinas opacas, incluidos nombres calificados por paquete que coincidan con funciones incorporadas. Esto no amplía el subconjunto de una sola tabla ni requiere habilitar consultas inseguras. No se añaden otras formas al subconjunto conservador, como joins entre paréntesis, fuentes laterales o listas de alias de columnas derivadas. La compatibilidad predeterminada no cambia.

`forbiddenTables: []` no activa restricciones por tabla; añadir una sola entrada sí lo hace. Con una lista no vacía u otra política restringida de las anteriores, las consultas complejas siguen necesitando una vista protegida en Firebird. No elimines una política necesaria ni habilites consultas inseguras para eludir este límite. La corrección del #41 no requiere nuevas variables ni interruptores: instala `mcp-firebird@2.12.0` (o selecciona `mcp-firebird@latest` en tu configuración existente de `npx`) y reinicia el MCP conservando la conexión y las políticas.

Desde alpha.4 se distingue el FROM de argumentos como `EXTRACT(MONTH FROM T.CREATED_AT)`, `SUBSTRING(T.NAME FROM 1 FOR 3)` y `TRIM(BOTH FROM T.NAME)` del FROM que introduce tablas, también en expresiones anidadas. Los alias de columnas no requieren `allowUnsafeQueries=true` ni desactivar la seguridad. Las tablas reales y subconsultas siguen sujetas a la política; las relaciones calificadas por esquema continúan sin admitirse en modo conservador. Con enmascaramiento activo se siguen rechazando proyecciones con expresiones, como se explica a continuación. Los valores optativos de alpha.3 no cambian.

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

El menor de `queryTimeout` y `maxQueryCpuTime` es un plazo de tiempo transcurrido que incluye conexión, consulta y lectura BLOB. Desde **2.12.0-alpha.2** (#38), el timeout rechaza la petición pero mantiene la conexión ocupada hasta terminar el trabajo pendiente del driver, su limpieza y lecturas BLOB; después la destruye una sola vez, sin reutilizarla. Un resultado tardío no inicia nuevas lecturas BLOB y una conexión que llega tarde se cierra sin ejecutar SQL. Se observan los rechazos de promesas del driver aunque lleguen después del callback o timeout, evitando que cierren el proceso MCP. El trabajo pendiente sigue ocupando su plaza del pool: si todas están ocupadas, las consultas nuevas esperan y pueden vencer también. Así se evitan cierres inseguros y conexiones de reemplazo ilimitadas. No mide CPU ni cancela la ejecución en Firebird; una escritura vencida aún puede confirmarse. No la reintentes automáticamente. Los límites siguen siendo optativos; no hay que configurar un timeout para recibir la corrección.

La frecuencia utiliza un cubo de tokens con ráfaga inicial `burstLimit` y reposición `queriesPerMinute`. Cada consulta física, incluidas iteraciones de lotes y metadatos, consume cuota. La sesión de seguridad corresponde al proceso STDIO, sujeto OAuth, clave API compartida o IP del socket no autenticado. Abrir otra sesión MCP no reinicia el contador. Se reinicia al reiniciar el proceso; hay un máximo de 10.000 identidades y se rechazan identidades nuevas al alcanzarlo. Ajusta cuotas para esquemas grandes y procesos duraderos.

### Configurar el timeout de las consultas

Los probes de conexión del pool también esperan la limpieza asíncrona del driver antes de reutilizar o descartar una conexión (#39). Su plazo independiente de cinco segundos reserva esa conexión para cerrarla cuando termine el trabajo pendiente, sin desconectar operaciones en curso. Las demás plazas disponibles del pool pueden seguir atendiendo peticiones. Si todas están ocupadas, las peticiones esperan y sigue aplicándose su timeout configurado. El plazo del probe no cancela SQL en el servidor.

Desde **2.12.0-alpha.3**, `QUERY_TIMEOUT` se lee al inicializar la seguridad. Antes aparecía en ejemplos pero no se aplicaba. Esta versión activa los valores no vacíos que ya existan, incluido `30000` en los ejemplos de entorno/Compose; revísalos al actualizar. Sin ninguno de los ajustes de timeout no se impone un plazo.

Elige una de estas opciones y conserva el resto de tu conexión y políticas:

- Define `QUERY_TIMEOUT=30000` en el entorno del servidor MCP para 30 segundos. En el objeto `env` existente de tu cliente añade `"QUERY_TIMEOUT": "30000"`. PowerShell: `$env:QUERY_TIMEOUT = '30000'`; Bash: `export QUERY_TIMEOUT=30000`.
- Añade `"queryTimeout": 30000` al objeto `security` de tu archivo de seguridad JSON/CJS. Si no hay archivo seleccionado, también puedes establecer `FIREBIRD_SECURITY_JSON` a `{"security":{"queryTimeout":30000}}` (combínalo con las políticas existentes, no las reemplaces).

El archivo seleccionado tiene prioridad sobre el JSON del entorno según la precedencia indicada arriba. Su `security.queryTimeout` explícito (o el del JSON cuando no se selecciona archivo) tiene prioridad sobre `QUERY_TIMEOUT`, incluso si la variable contiene un valor menor. Si la política omite `queryTimeout`, la variable lo aporta sin reemplazar otros campos. Una variable desplazada por un valor explícito se ignora, incluida su validación. El plazo efectivo será el **menor** entre el `queryTimeout` resultante y `security.resourceLimits.maxQueryCpuTime`, si existen ambos. Pese a su nombre histórico, `maxQueryCpuTime` mide milisegundos transcurridos, no CPU.

`QUERY_TIMEOUT` acepta enteros decimales de **1 a 2147483647 milisegundos**, con espacios externos opcionales. Otros valores no vacíos impiden la inicialización con un error de configuración; así se evita que un desbordamiento del temporizador de Node se convierta en un plazo de 1 ms. Ausente o vacía desactiva solo el valor de respaldo del entorno. Para desactivar el plazo por completo, elimina también ambas propiedades de timeout de la política. No uses `0` ni `null`. **Reinicia el proceso MCP** tras cada cambio. El timeout propio del cliente MCP es independiente: ajústalo por separado si termina antes. El plazo del servidor no cancela la ejecución SQL, como se explica arriba.

## Autenticación y roles HTTP/SSE

`FIREBIRD_API_KEY` conserva autenticación `Authorization: Bearer ...`. No utilices claves en URL y protege el transporte con HTTPS. Con `authorization.type="basic"`, esa clave representa el rol `user`; configura sus permisos. No es un directorio de contraseñas HTTP Basic. Sin permisos de rol, se deniega acceso a la base.

OAuth2 usa `authorization.type="oauth2"`, `tokenVerifyUrl` HTTPS, `clientId`, `clientSecret`, `scope` opcional y `rolePermissions`. En modo compat se aceptan las políticas antiguas sin `resourceUrl` ni `authorizationServers`, con un aviso: no validan localmente la audiencia ni ofrecen descubrimiento, por lo que requieren un proveedor de introspección confiable y dedicado a este recurso. Para activar ambas protecciones configura los dos campos juntos. Una configuración parcial o inválida se rechaza. En modo HTTP estricto son obligatorios. Ejemplo completo en la [guía inglesa](security.md#httpsse-authentication-and-role-permissions).

El servidor envía `token` como formulario al endpoint, con credenciales Basic del cliente, sin redirecciones y con un plazo de cinco segundos. Exige `active:true`, identidad sub/user_id y role o primer elemento de roles; comprueba audiencia, expiración informada, nbf y scopes requeridos. Tokens inválidos, identidad ausente y fallos del servicio deniegan acceso.

En modo OAuth el Bearer es el token OAuth, no la clave estática. Identidad verificada, permisos de rol y restricciones globales se aplican juntos. Las sesiones HTTP/SSE pertenecen a su identidad original. STDIO no puede aportar esa identidad HTTP: utiliza una política independiente. Las suscripciones compartidas a eventos se deshabilitan con políticas restringidas.

## HTTP, Host/Origin y CORS

Desde 2.12.0-alpha.1, `MCP_HTTP_SECURITY_MODE=compat` es el valor predeterminado: mantiene la escucha en `0.0.0.0`, CORS sin credenciales y comodín cuando `MCP_ALLOWED_ORIGIN` está vacío, ausente o vale `*`. No impone una lista de Host si no se configura. Emite un aviso: este modo no ofrece el aislamiento de navegador/DNS rebinding del modo estricto. Usa autenticación y una red confiable; no expongas la base sin protección. Las listas explícitas se respetan en ambos modos y `MCP_ALLOW_REMOTE=false` impide escuchar fuera de loopback.

Con `MCP_HTTP_SECURITY_MODE=strict` se activa loopback por defecto y se validan Host/Origin antes de cualquier petición, incluyendo OPTIONS. Se permiten inicialmente `localhost`, `127.0.0.1`, `[::1]` y el mismo origen. Los clientes nativos pueden omitir Origin; los orígenes inválidos, `null` o ajenos reciben HTTP 403. Un modo desconocido impide arrancar. Para volver a compatibilidad, elimina la variable o usa `compat` y reinicia; las listas y políticas explícitas siguen aplicándose.

Solo en modo estricto, `MCP_ALLOWED_ORIGIN=*` se rechaza. Déjalo sin definir/vacío para el mismo origen o configura orígenes exactos como `https://app.example.com`, sin rutas ni barra final. Para exposición remota estricta, incluso Docker, configura `HTTP_HOST=0.0.0.0`, `MCP_ALLOW_REMOTE=true` y `MCP_ALLOWED_HOSTS=mcp.example.com`. Los hosts no incluyen puertos; IPv6 usa corchetes. Un proxy TLS debe enviar un Host permitido; agrega el origen público HTTPS a la lista. Las cabeceras reenviadas no omiten estos controles.

Al configurar `resourceUrl` y `authorizationServers`, OAuth publica metadatos en `/.well-known/oauth-protected-resource` y la ruta del recurso, e incluye su URL en `WWW-Authenticate`. La introspección debe devolver `aud` con el `resourceUrl` exacto: se exige en ambos modos HTTP y nunca se vuelve automáticamente al comportamiento antiguo. Un token inválido da HTTP 401; scopes insuficientes dan HTTP 403. Consulta los detalles en la [guía inglesa](security.md#httpsse-authentication-and-role-permissions).

CORS permite las cabeceras de protocolo 2026, sesión heredada y caché, y expone las de sesión, desafío OAuth y caché. No sustituye autenticación: protege la exposición remota con HTTPS y clave API u OAuth. STDIO y las políticas SQL optativas no cambian.

## Auditoría

Configura `security.audit` con `enabled:true`, `destination` (`file`, `database`, `both`), `auditFile`, `auditTable`, `detailLevel` (`basic`, `medium`, `full`) y banderas `logQueries`, `logParameters`, `logResponses`.

Los archivos son JSON por líneas. La auditoría de base usa nombre validado, inserts parametrizados y claves UUID; crea la tabla si falta con tipos compatibles con Firebird 2.5. La cuenta necesita permisos para esa configuración interna. Si existe un esquema antiguo incompatible, utiliza otro nombre de tabla: no se ignora el fallo de inicialización.

Se registra intención antes de ejecutar y resultado/fallo después. Basic omite SQL/parámetros/respuestas; medium admite SQL; full admite también parámetros/respuestas según sus banderas. Las respuestas llegan enmascaradas. SQL y parámetros pueden contener secretos: configura permisos, rotación y retención externos.

Si falla el registro, no se ejecuta la consulta o se retiene el resultado. Un fallo posterior a una escritura no la revierte; la auditoría no comparte transacción con ella. Los rechazos se registran cuando es posible. No se promete un registro inalterable de cumplimiento normativo.

## Comprobación

Ejecuta `npm run verify:release` desde una copia de desarrollo con sus dependencias de desarrollo instaladas. Comprueba tipos, compila, comprueba errores de lint y ejecuta las pruebas unitarias, de protocolo y de seguridad compilada. `prepublishOnly` ejecuta esta validación antes de un `npm publish` normal; no debe omitirse con `--ignore-scripts`. Es local, sin GitHub Actions, y no se ejecuta al instalar ni iniciar el MCP. Jest solo descubre pruebas dentro de `src`, evitando copias temporales de revisiones.

Comando de publicación estable para mantenedores: `npm publish --tag latest --access public --ignore-scripts=false`; usa `--tag alpha` para versiones preliminares. La bandera explícita de scripts es importante si npm tiene configurado `ignore-scripts=true`, que omitiría los hooks. Esta validación reduce regresiones, pero no es una restricción de publicación impuesta por el servidor.

La matriz de regresión SQL combina subconsultas y separadores de funciones con variantes de mayúsculas, espacios, comentarios y anidación; prueba la política reportada, denegaciones explícitas y compatibilidad predeterminada. Incluye catálogos ocultos, funciones opacas o de paquetes, secuencias y listas de tablas no vacías. Se conserva el rechazo histórico de comentarios SQL por defecto; el analizador conservador los trata con políticas explícitas. Las futuras correcciones SQL deben ampliar este conjunto con casos válidos y adversarios, además de comprobar el punto de ejecución; no basta con agregar palabras SQL a una lista de funciones.

El script optativo `scripts/security-firebird-smoke.mjs` crea/elimina una base local temporal con UUID. Incluye los separadores de funciones del #36 y subconsultas/joins parametrizados del #41 con políticas explícitas. Estas pruebas reales son independientes de la validación de publicación porque necesitan un servicio Firebird local y credenciales de prueba. Las pruebas con controladores simulados no sustituyen las realizadas sobre la versión desplegada de Firebird.

El MCP no proporciona aislamiento del sistema operativo, terminación TLS, contabilidad CPU de Firebird ni protección automática sobre toda dependencia indirecta. Usa privilegios mínimos, HTTPS, firewall, copias de seguridad y pruebas antes de desplegar.
