# MCP Firebird


Implementación del protocolo MCP (Model Context Protocol) de Anthropic para bases de datos Firebird.

## Ejemplo de Uso

https://github.com/user-attachments/assets/e68e873f-f87b-4afd-874f-157086e223af

## ¿Qué es MCP Firebird y para qué sirve?

MCP Firebird es un servidor que implementa el [Protocolo de Contexto de Modelo (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) de Anthropic para bases de datos [Firebird SQL](https://firebirdsql.org/). Permite a los Modelos de Lenguaje de Gran Tamaño (LLMs) como Claude acceder, analizar y manipular datos en bases de datos Firebird de manera segura y controlada.

Más abajo encontrarás casos y ejemplos de uso.

## 🚀 Novedades MCP 2.7+ (Rendimiento y Seguridad)

Este servidor ha sido actualizado para soportar los últimos estándares empresariales del ecosistema MCP:

- ⚡ **Connection Pooling (Cero Latencia):** Las consultas repetitivas a la base de datos ahora utilizan conexiones persistentes en memoria, eliminando el overhead de handshake y ejecutándose casi instantáneamente.
- 🔔 **Eventos Proactivos (Triggers):** Integración nativa con `POST_EVENT` de Firebird. El servidor puede escuchar eventos de la base de datos en tiempo real y notificar proactivamente al cliente de IA sin necesidad de polling continuo. [Leer guía detallada y ejemplos de configuración](docs/proactive-events.md).
- 🔐 **Autorización Gestionada (EMA):** Configura una clave API para exigir `Authorization: Bearer` en HTTP/SSE. La contraseña de Firebird se configura por separado en el servidor; no se recibe mediante parámetros del cliente. [Guía de seguridad](docs/security.es.md).

---

## Modos de Transporte e Instalación

MCP Firebird soporta múltiples arquitecturas de despliegue. Selecciona la que mejor se adapte a tu caso de uso.

### 1. [RECOMENDADO] Transporte Moderno (Streamable HTTP / SSE)

Ideal para conectar n8n, plataformas cloud, agentes remotos o herramientas que no residen en la misma máquina que la base de datos.

**Instalación:**
```bash
npm install -g mcp-firebird
```

**Levantar el Servidor:**
Configura el entorno en tu terminal o mediante un archivo `.env`:
```bash
export TRANSPORT_TYPE=sse
export SSE_PORT=3003

# Credenciales reales de la BD protegidas en el servidor:
export FIREBIRD_PASSWORD=masterkey 
# Activa EMA para proteger el acceso desde clientes externos:
export FIREBIRD_API_KEY=mi_token_secreto_123

# Inicia el servidor
mcp-firebird --database /path/to/database.fdb --user SYSDBA
```

**Conexión desde el Cliente:**
El cliente de IA (ej. el Inspector MCP o n8n) se conectará a `http://localhost:3003` y, gracias a EMA, **solo necesitará proveer el API KEY** en vez de la contraseña real de la base de datos.

### 2. [LOCAL / LEGACY] Transporte Estándar (STDIO)

Este es el método clásico. Es recomendado únicamente para uso personal en la misma máquina (ej. Claude Desktop). En este modo, Claude levanta su propio subproceso de MCP Firebird en segundo plano.

**Configuración para Claude Desktop:**

<Tabs>
  <Tab title="MacOS/Linux">
    ```bash
    code ~/Library/Application\ Support/Claude/claude_desktop_config.json
    ```
  </Tab>
  <Tab title="Windows">
    ```powershell
    code $env:AppData\Claude\claude_desktop_config.json
    ```
  </Tab>
</Tabs>

Añade la siguiente configuración:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-firebird",
        "--database", "C:\\Databases\\example.fdb",
        "--user", "SYSDBA",
        "--api-key", "mi_token_secreto_123" 
      ]
    }
  }
}
```

<Warning>
  Asegúrate de usar rutas absolutas en la configuración.
</Warning>

<Note>
  En este ejemplo estamos utilizando `--api-key` (EMA). Si en tu entorno local no te importa guardar la contraseña directamente en el JSON, puedes reemplazar `--api-key` por `--password`. Después de guardar, reinicia Claude Desktop completamente.
</Note>

## Recursos y Funcionalidades

El servidor MCP Firebird ofrece:

- **Bases de datos**: Listado de todas las bases de datos disponibles
- **Tablas**: Lista de todas las tablas en la base de datos
- **Vistas**: Lista de todas las vistas en la base de datos
- **Procedimientos almacenados**: Acceso a los procedimientos en la base de datos
- **Esquemas de tablas**: Estructura detallada de cada tabla
- **Datos**: Acceso a los datos de las tablas

## Herramientas disponibles

1. **list-tables**: Lista todas las tablas en la base de datos
   ```json
   {}  // No requiere parámetros
   ```

2. **describe-table**: Describe la estructura de una tabla
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

3. **execute-query**: Ejecuta una consulta SQL en la base de datos
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": []  // Parámetros opcionales para consultas preparadas
   }
   ```

4. **get-field-descriptions**: Obtiene las descripciones de los campos
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

5. **analyze-query-performance**: Analiza el rendimiento de una consulta SQL
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": [],  // Parámetros opcionales para consultas preparadas
     "iterations": 3  // Número opcional de iteraciones para promediar (predeterminado: 3)
   }
   ```

6. **get-execution-plan**: Obtiene el plan de ejecución de una consulta SQL
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": []  // Parámetros opcionales para consultas preparadas
   }
   ```

7. **analyze-missing-indexes**: Analiza una consulta SQL para identificar índices faltantes
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10"
   }
   ```

8. **get-table-indexes**: Obtiene los índices y sus columnas ordenadas para una tabla
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

9. **get-table-constraints**: Obtiene claves primarias, foráneas, restricciones UNIQUE, NOT NULL y CHECK, incluidas sus relaciones
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

10. **get-table-triggers**: Obtiene únicamente los triggers asociados a una tabla
    ```json
    {
      "tableName": "EMPLOYEES"
    }
    ```

Estas tres herramientas reflejan los Resource Templates de metadatos equivalentes. Permiten que los clientes MCP que no leen recursos de forma autónoma consulten la misma información mediante herramientas normales.

La herramienta **get-field-descriptions** es especialmente útil para los modelos de IA, ya que obtiene los comentarios de metadatos RDB$DESCRIPTION de Firebird, proporcionando contexto semántico adicional sobre el propósito de cada campo.

Las herramientas de análisis de rendimiento (**analyze-query-performance**, **get-execution-plan** y **analyze-missing-indexes**) ayudan a optimizar las consultas de base de datos proporcionando información sobre el tiempo de ejecución, los planes de ejecución y las recomendaciones de índices.

## Prompts disponibles

1. **query-data**: Consulta datos usando lenguaje natural
   ```
   Encuentra todos los empleados del departamento de ventas contratados en 2023
   ```

2. **analyze-table**: Analiza la estructura de una tabla
   ```
   Analiza la tabla EMPLOYEES y explica su estructura
   ```

3. **optimize-query**: Optimiza una consulta SQL
   ```
   Optimiza: SELECT * FROM EMPLOYEES WHERE LAST_NAME = 'Smith'
   ```

4. **generate-sql**: Genera SQL a partir de una descripción
   ```
   Genera una consulta para obtener los 10 productos más vendidos
   ```

## Uso desde diferentes lenguajes

### TypeScript/JavaScript

```typescript
// Ejemplo con TypeScript
import { McpClient, ChildProcessTransport } from '@modelcontextprotocol/sdk';
import { spawn } from 'child_process';

async function main() {
  // Iniciar el proceso del servidor MCP
  const serverProcess = spawn('npx', [
    'mcp-firebird',
    '--database', '/path/to/database.fdb',
    '--user', 'SYSDBA',
    '--password', 'masterkey'
  ]);

  // Crear un transporte y un cliente MCP
  const transport = new ChildProcessTransport(serverProcess);
  const client = new McpClient(transport);

  try {
    // Obtener información del servidor
    const serverInfo = await client.getServerInfo();
    console.log('Servidor MCP:', serverInfo);

    // Listar tablas disponibles
    const tablesResult = await client.executeTool('list-tables', {});
    console.log('Tablas disponibles:', tablesResult);

    // Ejecutar una consulta SQL
    const queryResult = await client.executeTool('execute-query', {
      sql: 'SELECT FIRST 10 * FROM EMPLOYEES'
    });
    console.log('Resultados de la consulta:', queryResult);

    // Utilizar un prompt para generar SQL
    const sqlGeneration = await client.executePrompt('generate-sql', {
      description: 'Obtener todos los clientes premium'
    });
    console.log('SQL generado:', sqlGeneration);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cerrar el proceso del servidor
    serverProcess.kill();
  }
}

main().catch(console.error);
```

### Python

```python
# Ejemplo con Python
import json
import subprocess
from subprocess import PIPE

class McpFirebirdClient:
    def __init__(self, database_path, user='SYSDBA', password='masterkey'):
        # Iniciar el proceso del servidor MCP
        self.process = subprocess.Popen(
            ['npx', 'mcp-firebird', '--database', database_path, '--user', user, '--password', password],
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
            text=True,
            bufsize=1
        )

    def send_request(self, method, params={}):
        request = {
            'id': 1,
            'method': method,
            'params': params
        }
        # Enviar la solicitud al servidor
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()

        # Leer la respuesta
        response_line = self.process.stdout.readline()
        while not response_line.strip() or response_line.startswith('['):
            response_line = self.process.stdout.readline()

        # Parsear y devolver la respuesta JSON
        return json.loads(response_line)

    def get_server_info(self):
        return self.send_request('getServerInfo')

    def list_tables(self):
        return self.send_request('executeTool', {'name': 'list-tables', 'args': {}})

    def execute_query(self, sql, params=[]):
        return self.send_request('executeTool', {
            'name': 'execute-query',
            'args': {'sql': sql, 'params': params}
        })

    def generate_sql(self, description):
        return self.send_request('executePrompt', {
            'name': 'generate-sql',
            'args': {'description': description}
        })

    def close(self):
        self.process.terminate()

# Uso del cliente
client = McpFirebirdClient('/path/to/database.fdb')
try:
    # Obtener información del servidor
    server_info = client.get_server_info()
    print(f"Servidor MCP: {server_info}")

    # Listar tablas
    tables = client.list_tables()
    print(f"Tablas disponibles: {tables}")

    # Ejecutar una consulta
    results = client.execute_query("SELECT FIRST 10 * FROM EMPLOYEES")
    print(f"Resultados: {results}")

    # Generar SQL
    sql = client.generate_sql("Listar los productos más vendidos")
    print(f"SQL generado: {sql}")
finally:
    client.close()
```

### Delphi

```delphi
// Ejemplo con Delphi
program McpFirebirdClient;

{$APPTYPE CONSOLE}

uses
  System.SysUtils, System.Classes, System.JSON, System.Net.HttpClient,
  System.Diagnostics, System.IOUtils;

type
  TMcpFirebirdClient = class
  private
    FProcess: TProcess; //Para Delphi cambiar por TProcessDelphi y agregue https://github.com/ferruhkoroglu/TProcessDelphi
    FRequestId: Integer;

    function SendRequest(const Method: string; const Params: TJSONObject = nil): TJSONObject;
    function ReadResponse: string;
  public
    constructor Create(const DatabasePath, User, Password: string);
    destructor Destroy; override;

    function GetServerInfo: TJSONObject;
    function ListTables: TJSONObject;
    function ExecuteQuery(const SQL: string; Params: TArray<Variant> = nil): TJSONObject;
    function GenerateSQL(const Description: string): TJSONObject;
  end;

constructor TMcpFirebirdClient.Create(const DatabasePath, User, Password: string);
begin
  inherited Create;
  FRequestId := 1;

  // Crear y configurar el proceso
  FProcess := TProcess.Create(nil);
  FProcess.Executable := 'npx';
  FProcess.Parameters.Add('mcp-firebird');
  FProcess.Parameters.Add('--database');
  FProcess.Parameters.Add(DatabasePath);
  FProcess.Parameters.Add('--user');
  FProcess.Parameters.Add(User);
  FProcess.Parameters.Add('--password');
  FProcess.Parameters.Add(Password);

  FProcess.Options := [poUsePipes, poStderrToOutPut];
  FProcess.Execute;

  // Esperar a que el servidor se inicie
  Sleep(2000);
end;

destructor TMcpFirebirdClient.Destroy;
begin
  FProcess.Free;
  inherited;
end;

function TMcpFirebirdClient.SendRequest(const Method: string; const Params: TJSONObject = nil): TJSONObject;
var
  Request: TJSONObject;
  RequestStr, ResponseStr: string;
begin
  // Crear la solicitud JSON
  Request := TJSONObject.Create;
  try
    Request.AddPair('id', TJSONNumber.Create(FRequestId));
    Inc(FRequestId);
    Request.AddPair('method', Method);

    if Assigned(Params) then
      Request.AddPair('params', Params)
    else
      Request.AddPair('params', TJSONObject.Create);

    RequestStr := Request.ToString + #10;

    // Enviar la solicitud al proceso
    FProcess.Input.Write(RequestStr[1], Length(RequestStr) * 2);

    // Leer la respuesta
    ResponseStr := ReadResponse;
    Result := TJSONObject.ParseJSONValue(ResponseStr) as TJSONObject;
  finally
    Request.Free;
  end;
end;

function TMcpFirebirdClient.ReadResponse: string;
var
  Buffer: TBytes;
  BytesRead: Integer;
  ResponseStr: string;
begin
  SetLength(Buffer, 4096);
  ResponseStr := '';

  repeat
    BytesRead := FProcess.Output.Read(Buffer[0], Length(Buffer));
    if BytesRead > 0 then
    begin
      SetLength(Buffer, BytesRead);
      ResponseStr := ResponseStr + TEncoding.UTF8.GetString(Buffer);
    end;
  until BytesRead = 0;

  Result := ResponseStr;
end;

function TMcpFirebirdClient.GetServerInfo: TJSONObject;
begin
  Result := SendRequest('getServerInfo');
end;

function TMcpFirebirdClient.ListTables: TJSONObject;
var
  Params: TJSONObject;
begin
  Params := TJSONObject.Create;
  try
    Params.AddPair('name', 'list-tables');
    Params.AddPair('args', TJSONObject.Create);
    Result := SendRequest('executeTool', Params);
  finally
    Params.Free;
  end;
end;

function TMcpFirebirdClient.ExecuteQuery(const SQL: string; Params: TArray<Variant> = nil): TJSONObject;
var
  RequestParams, Args: TJSONObject;
  ParamsArray: TJSONArray;
  I: Integer;
begin
  RequestParams := TJSONObject.Create;
  Args := TJSONObject.Create;
  ParamsArray := TJSONArray.Create;

  try
    // Configurar los argumentos
    Args.AddPair('sql', SQL);

    if Length(Params) > 0 then
    begin
      for I := 0 to Length(Params) - 1 do
      begin
        case VarType(Params[I]) of
          varInteger: ParamsArray.Add(TJSONNumber.Create(Integer(Params[I])));
          varDouble: ParamsArray.Add(TJSONNumber.Create(Double(Params[I])));
          varBoolean: ParamsArray.Add(TJSONBool.Create(Boolean(Params[I])));
          else ParamsArray.Add(String(Params[I]));
        end;
      end;
    end;

    Args.AddPair('params', ParamsArray);
    RequestParams.AddPair('name', 'execute-query');
    RequestParams.AddPair('args', Args);

    Result := SendRequest('executeTool', RequestParams);
  finally
    RequestParams.Free;
  end;
end;

function TMcpFirebirdClient.GenerateSQL(const Description: string): TJSONObject;
var
  RequestParams, Args: TJSONObject;
begin
  RequestParams := TJSONObject.Create;
  Args := TJSONObject.Create;

  try
    Args.AddPair('description', Description);
    RequestParams.AddPair('name', 'generate-sql');
    RequestParams.AddPair('args', Args);

    Result := SendRequest('executePrompt', RequestParams);
  finally
    RequestParams.Free;
  end;
end;

var
  Client: TMcpFirebirdClient;
  ServerInfo, Tables, QueryResults, GeneratedSQL: TJSONObject;

begin
  try
    WriteLn('Iniciando cliente MCP Firebird...');

    // Crear el cliente
    Client := TMcpFirebirdClient.Create('C:\Databases\example.fdb', 'SYSDBA', 'masterkey');
    try
      // Obtener información del servidor
      ServerInfo := Client.GetServerInfo;
      WriteLn('Información del servidor: ', ServerInfo.ToString);

      // Listar tablas
      Tables := Client.ListTables;
      WriteLn('Tablas disponibles: ', Tables.ToString);

      // Ejecutar una consulta
      QueryResults := Client.ExecuteQuery("SELECT FIRST 10 * FROM EMPLOYEES");
      WriteLn('Resultados: ', QueryResults.ToString);

      // Generar SQL
      GeneratedSQL := Client.GenerateSQL("Listar los productos más vendidos");
      WriteLn('SQL generado: ', GeneratedSQL.ToString);
    finally
      Client.Free;
    end;
  except
    on E: Exception do
      WriteLn('Error: ', E.Message);
  end;

  WriteLn('Presiona ENTER para salir...');
  ReadLn;
end.
```

## Configuración de seguridad

Desde **2.11.0-alpha.2**, las opciones SQL, restricciones, filtros de filas, enmascaramiento, límites, auditoría y autorización se comprueban en la ejecución, no solo al leer la configuración. Los ejemplos anteriores se sustituyen por la [guía actualizada en español](docs/security.es.md) y su [versión inglesa](docs/security.md).

Usa `--security-config /ruta/politica.json` o `FIREBIRD_SECURITY_JSON`. Ambas fuentes admiten `security` y `sql`; una configuración seleccionada inválida detiene el inicio. En **2.11.0-alpha.3** las restricciones avanzadas son optativas: no hay cuotas, plazos, bloqueo de catálogo ni restricciones nuevas de rutinas implícitas. Se conserva `ALLOW_RAW_SQL=true` para escrituras, incluido DDL; los permisos configurados expresamente y `sql.allowDDL=false` no se pueden omitir.

**Activa solo los controles que necesites:** `{"security":{"maxRows":100}}` habilita únicamente ese límite. Los omitidos quedan inactivos; para desactivarlos elimina sus propiedades y reinicia. Una política antigua que incluya opciones antes inactivas ahora sí las aplica. Las políticas restringidas rechazan SQL complejo, las tablas con filtros son de solo lectura y los eventos compartidos se deshabilitan en ese modo. Los plazos no son cuotas CPU de Firebird. Consulta la guía y utiliza privilegios mínimos.

La [revisión de implementación](docs/security-implementation-review.md) relaciona los problemas encontrados con las correcciones y las pruebas realizadas.

## Integración con agentes IA

### Claude en la terminal

Puedes usar el servidor MCP Firebird con Claude en la terminal:

```bash
# Iniciar el servidor MCP en una terminal
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey

# En otra terminal, usar anthropic CLI con MCP
anthropic messages create \
  --model claude-3-opus-20240229 \
  --max-tokens 4096 \
  --mcp "npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey" \
  --message "Analiza la estructura de mi base de datos Firebird"
```

### Otros agentes IA

El servidor MCP Firebird es compatible con cualquier agente que implemente el protocolo MCP, simplemente proporcionando el comando para iniciar el servidor:

```
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## Seguridad

El servidor implementa las siguientes medidas de seguridad:

- Validación de entradas con Zod
- Sanitización de consultas SQL
- Manejo seguro de credenciales
- SQL parametrizado y política conservadora; no se garantiza protección frente a toda inyección o dependencia indirecta
- Limitación de operaciones destructivas

## Depuración y solución de problemas

Para habilitar el modo de depuración:

```bash
export LOG_LEVEL=debug
```

### Problemas comunes

1. **Error de conexión a la base de datos**:
   - Verifica las credenciales y ruta de la base de datos
   - Asegúrate de que el servidor Firebird esté en ejecución
   - Comprueba que el usuario tenga permisos suficientes

2. **El servidor no aparece en Claude Desktop**:
   - Reinicia Claude Desktop
   - Verifica la configuración en `claude_desktop_config.json`
   - Asegúrate de que la ruta de la base de datos sea absoluta

3. **Problemas con STDIO**:
   - Asegúrate de que la salida estándar no esté siendo redirigida
   - No utilices `console.log` para depuración (usa `console.error`)

## Actualizaciones Recientes

### Versión 1.0.93 (Actualizada desde 1.0.91)

MCP Firebird ha sido mejorado significativamente con:

1. **Interfaces TypeScript mejoradas**:
   - Nuevas interfaces para mejor tipado (FirebirdDatabase, ConfigOptions, DatabaseInfo, TableInfo, etc.)
   - Tipado más estricto para todos los parámetros y valores de retorno

2. **Manejo de errores mejorado**:
   - Clase personalizada `FirebirdError` para mejor categorización de errores
   - Detección detallada de diferentes tipos de errores (conexión, sintaxis, permisos, etc.)
   - Mensajes de error más informativos para facilitar la depuración

3. **Nuevas características y herramientas**:
   - Herramienta `get-methods` para descubrimiento de API
   - Nuevos prompts para analizar tablas y optimizar consultas
   - Función `describeTable` para obtener estructura detallada de tablas
   - Función `listTables` para listar nombres de tablas de manera simple

4. **Mejor documentación**:
   - JSDoc completo para todas las funciones
   - Descripciones mejoradas de herramientas MCP con información específica de Firebird
   - Especificación clara de que Firebird usa FIRST/ROWS en lugar de LIMIT para paginación

5. **Mejoras de seguridad**:
   - Validación explícita de parámetros SQL
   - Prevención mejorada de inyecciones SQL
   - Restricciones de acceso configurables para tablas y operaciones

6. **Calidad del código**:
   - Eliminación de archivos innecesarios (server.js, server.new.js, test-*.js, etc.)
   - Respuestas JSON más compactas (eliminación de espacios innecesarios)
   - Enfoque consistente de registro de actividad

## Integración con agentes IA

### Claude en la terminal

Puedes usar el servidor MCP Firebird con Claude en la terminal:

```bash
# Iniciar el servidor MCP en una terminal
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey

# En otra terminal, usar anthropic CLI con MCP
anthropic messages create \
  --model claude-3-opus-20240229 \
  --max-tokens 4096 \
  --mcp "npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey" \
  --message "Analiza la estructura de mi base de datos Firebird"
```

### Otros agentes IA

El servidor MCP Firebird es compatible con cualquier agente que implemente el protocolo MCP, simplemente proporcionando el comando para iniciar el servidor:

```
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## Seguridad

El servidor implementa las siguientes medidas de seguridad:

- Validación de entradas con Zod
- Sanitización de consultas SQL
- Manejo seguro de credenciales
- SQL parametrizado y política conservadora; no se garantiza protección frente a toda inyección o dependencia indirecta
- Limitación de operaciones destructivas

## Depuración y solución de problemas

Para habilitar el modo de depuración:

```bash
export LOG_LEVEL=debug
```

### Problemas comunes

1. **Error de conexión a la base de datos**:
   - Verifica las credenciales y ruta de la base de datos
   - Asegúrate de que el servidor Firebird esté en ejecución
   - Comprueba que el usuario tenga permisos suficientes

2. **El servidor no aparece en Claude Desktop**:
   - Reinicia Claude Desktop
   - Verifica la configuración en `claude_desktop_config.json`
   - Asegúrate de que la ruta de la base de datos sea absoluta

3. **Problemas con STDIO**:
   - Asegúrate de que la salida estándar no esté siendo redirigida
   - No utilices `console.log` para depuración (usa `console.error`)

## Apoya el Proyecto

### Donaciones

Si encuentras que MCP Firebird es útil para tu trabajo o proyectos, por favor considera apoyar su desarrollo a través de una donación. Tus contribuciones ayudan a mantener y mejorar esta herramienta.

- **GitHub Sponsors**: [Patrocinar a @PuroDelphi](https://github.com/sponsors/PuroDelphi)
- **PayPal**: [Donar vía PayPal](https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ)

![image](https://github.com/user-attachments/assets/d04cf0eb-32a8-48a7-9324-c02af5269370)

### Contrata Nuestros Agentes IA

Otra excelente manera de apoyar este proyecto es contratando nuestros agentes de IA a través de [Asistentes Autónomos](https://asistentesautonomos.com). Ofrecemos asistentes de IA especializados para diversas necesidades empresariales, ayudándote a automatizar tareas y mejorar la productividad.

### Soporte Prioritario

⭐ **Los donantes, patrocinadores y clientes reciben soporte y asistencia prioritaria** con problemas, solicitudes de funciones y orientación de implementación. Aunque nos esforzamos por ayudar a todos los usuarios, aquellos que apoyan financieramente el proyecto recibirán tiempos de respuesta más rápidos y asistencia dedicada.

¡Tu apoyo es muy apreciado y ayuda a asegurar el desarrollo continuo de MCP Firebird!

## Licencia

MIT
