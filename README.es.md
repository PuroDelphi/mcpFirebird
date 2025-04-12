# MCP Firebird

Implementación del protocolo MCP de Anthropic para bases de datos Firebird.

![image](https://github.com/user-attachments/assets/7538524b-c65d-441d-b773-326a69cf8c56)

## ¿Qué es MCP Firebird y para qué sirve?

MCP Firebird es un servidor que implementa el [Protocolo de Contexto de Modelo (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) de Anthropic para bases de datos [Firebird SQL](https://firebirdsql.org/). Permite a los Modelos de Lenguaje de Gran Tamaño (LLMs) como Claude acceder, analizar y manipular datos en bases de datos Firebird de manera segura y controlada.

Más abajo encontrarás casos y ejemplos de uso.

## Instalación

```bash
# Instalación global
npm install -g mcp-firebird

# Instalación en un proyecto
npm install mcp-firebird
```

## Configuración

### Variables de entorno

Puedes configurar el servidor usando variables de entorno:

```bash
# Configuración básica
export FIREBIRD_HOST=localhost
export FIREBIRD_PORT=3050
export FIREBIRD_DATABASE=/path/to/database.fdb
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey
export FIREBIRD_ROLE=undefined  # Opcional

# Configuración de directorio (alternativa)
export FIREBIRD_DATABASE_DIR=/path/to/databases  # Directorio con bases de datos
```

### Uso con npx

Puedes ejecutar el servidor directamente con npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

### Uso con SSE (Server-Sent Events)

El servidor MCP Firebird también soporta transporte SSE, que permite a los clientes conectarse a través de HTTP:

```bash
# Configura el tipo de transporte como SSE en tu archivo .env
TRANSPORT_TYPE=sse
SSE_PORT=3003

# Ejecuta el servidor con transporte SSE
npm run sse
```

Puedes conectarte al servidor usando el Inspector MCP:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```

O usar el script proporcionado:

```bash
npm run inspector-sse
```

#### Ejemplos de clientes SSE

Proporcionamos varios ejemplos de clientes que demuestran cómo conectarse al servidor MCP Firebird usando SSE:

- **HTML/JavaScript**: Ver `examples/sse-client.html` para un cliente basado en navegador
- **Node.js**: Ver `examples/sse-client.js` para un cliente Node.js
- **Python**: Ver `examples/sse_client.py` para un cliente Python

Para documentación detallada sobre el uso del transporte SSE, consulta `docs/sse-examples.md`.

## Configuración con Claude Desktop

Para usar el servidor MCP de Firebird con Claude Desktop:

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
        "mcp-firebird",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--database",
        "C:\\Databases\\example.fdb",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ],
      "type": "stdio"
    }
  }
}
```

<Warning>
  Asegúrate de usar rutas absolutas en la configuración.
</Warning>

<Note>
  Después de guardar el archivo, necesitas reiniciar Claude Desktop completamente.
</Note>

## Ejemplo de Uso

Mira este video para ver MCP Firebird en acción con Claude:

<video src="https://github.com/PuroDelphi/mcpFirebird/raw/alpha/examples/ExampleClaudeV2.mp4" controls="controls" style="max-width: 730px;">
</video>

[Descargar Video de Ejemplo](https://github.com/PuroDelphi/mcpFirebird/raw/alpha/examples/ExampleClaudeV2.mp4)

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

La seguridad es una prioridad en MCP Firebird. A continuación, se detallan opciones avanzadas para controlar el acceso y las operaciones permitidas.

### Limitación de acceso a tablas y vistas

Puedes restringir qué tablas y vistas están disponibles para el servidor MCP usando filtros de inclusión y exclusión:

```javascript
// En tu configuración personalizada (config.js)
module.exports = {
  // Configuración básica...

  security: {
    // Sólo permitir acceso a estas tablas
    allowedTables: [
      'CUSTOMERS',
      'PRODUCTS',
      'ORDERS',
      'ORDER_ITEMS'
    ],

    // Excluir estas tablas explícitamente (tiene precedencia sobre allowedTables)
    forbiddenTables: [
      'USERS',
      'USER_CREDENTIALS',
      'AUDIT_LOG'
    ],

    // Filtro de patrón de nombre (expresión regular)
    tableNamePattern: '^(?!TMP_|TEMP_|BAK_).*$'  // Excluir tablas temporales/backup
  }
};
```

Para usar esta configuración:

```bash
npx mcp-firebird --config ./config.js
```

### Limitación de operaciones SQL

Puedes restringir qué operaciones SQL están permitidas:

```javascript
// En tu configuración personalizada
module.exports = {
  // Configuración básica...

  security: {
    // Operaciones SQL permitidas
    allowedOperations: ['SELECT', 'EXECUTE'],  // Solo consultas y procedimientos almacenados

    // Bloquear estas operaciones específicamente
    forbiddenOperations: ['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE'],

    // Número máximo de filas que se pueden devolver en una consulta
    maxRows: 1000,

    // Tiempo máximo de ejecución para consultas (en ms)
    queryTimeout: 5000
  }
};
```

### Restricción de datos sensibles

Puedes configurar reglas para enmascarar o filtrar datos sensibles:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    dataMasking: [
      {
        // Enmascarar columnas específicas
        columns: ['CREDIT_CARD_NUMBER', 'SSN', 'PASSWORD'],
        pattern: /^.*/,
        replacement: '************'
      },
      {
        // Enmascarar parcialmente emails
        columns: ['EMAIL'],
        pattern: /^(.{3})(.*)(@.*)$/,
        replacement: '$1***$3'
      }
    ],

    // Filtros de línea para excluir datos sensibles
    rowFilters: {
      'CUSTOMERS': 'GDPR_CONSENT = 1',  // Solo mostrar clientes con consentimiento GDPR
      'EMPLOYEES': 'IS_PUBLIC_PROFILE = 1'  // Solo perfiles públicos de empleados
    }
  }
};
```

### Registro de auditoría

Configura registro detallado de todas las operaciones realizadas a través del MCP:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    audit: {
      // Habilitar auditoría
      enabled: true,

      // Destino del log de auditoría
      destination: 'database',  // opciones: 'file', 'database', 'both'

      // Si destination incluye 'file'
      auditFile: '/path/to/audit.log',

      // Si destination incluye 'database'
      auditTable: 'MCP_AUDIT_LOG',

      // Nivel de detalle
      detailLevel: 'full',  // 'basic', 'medium', 'full'

      // Qué registrar
      logQueries: true,
      logResponses: true,
      logParameters: true
    }
  }
};
```

### Ejemplo de registro de auditoría

```sql
-- Estructura de tabla para auditoría
CREATE TABLE MCP_AUDIT_LOG (
  LOG_ID INT NOT NULL PRIMARY KEY,
  TIMESTAMP TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CLIENT_INFO VARCHAR(255),
  OPERATION_TYPE VARCHAR(50),
  TARGET_OBJECT VARCHAR(100),
  QUERY_TEXT BLOB SUB_TYPE TEXT,
  PARAMETERS BLOB SUB_TYPE TEXT,
  AFFECTED_ROWS INT,
  EXECUTION_TIME INT,
  USER_IDENTIFIER VARCHAR(100),
  SUCCESS BOOLEAN
);

-- Ejemplo de registro
INSERT INTO MCP_AUDIT_LOG (
  LOG_ID, CLIENT_INFO, OPERATION_TYPE, TARGET_OBJECT,
  QUERY_TEXT, PARAMETERS, AFFECTED_ROWS,
  EXECUTION_TIME, USER_IDENTIFIER, SUCCESS
) VALUES (
  NEXT VALUE FOR SEQ_AUDIT_LOG, 'Claude/agent', 'SELECT', 'CUSTOMERS',
  'SELECT CUSTOMER_NAME, CITY FROM CUSTOMERS WHERE REGION = ?',
  '["East"]', 24, 45, 'claude-session-123', TRUE
);
```

### Limitación por volumen de datos

Configura límites para evitar consultas que consuman demasiados recursos:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    resourceLimits: {
      // Límite de filas por consulta
      maxRowsPerQuery: 5000,

      // Límite de tamaño de resultados (en bytes)
      maxResponseSize: 1024 * 1024 * 5,  // 5 MB

      // Límite de tiempo de CPU por consulta (ms)
      maxQueryCpuTime: 10000,

      // Límite de consultas por sesión
      maxQueriesPerSession: 100,

      // Intervalo de limitación (consultas por minuto)
      rateLimit: {
        queriesPerMinute: 60,
        burstLimit: 20
      }
    }
  }
};
```

### Integración con sistemas de autorización externos

MCP Firebird se puede integrar con sistemas de autorización externos para un control de acceso más preciso:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    authorization: {
      // Usar un servicio de autorización externo
      type: 'oauth2',

      // Configuración para OAuth2
      oauth2: {
        tokenVerifyUrl: 'https://auth.example.com/verify',
        clientId: 'mcp-firebird-client',
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        scope: 'database:read'
      },

      // Mapeo de roles a permisos
      rolePermissions: {
        'analyst': {
          tables: ['SALES', 'PRODUCTS', 'CUSTOMERS'],
          operations: ['SELECT']
        },
        'manager': {
          tables: ['SALES', 'PRODUCTS', 'CUSTOMERS', 'EMPLOYEES'],
          operations: ['SELECT', 'INSERT', 'UPDATE']
        },
        'admin': {
          allTablesAllowed: true,
          operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        }
      }
    }
  }
};
```

### Ejemplos prácticos de seguridad

#### Ejemplo 1: Servidor MCP para análisis de ventas

```javascript
// config-sales-analysis.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Acceso limitado a tablas de ventas
    allowedTables: [
      'SALES', 'PRODUCTS', 'CUSTOMERS', 'REGIONS',
      'SALES_TARGETS', 'PRODUCT_CATEGORIES'
    ],

    // Solo permitir consultas SELECT
    allowedOperations: ['SELECT'],

    // Enmascarar datos sensibles de clientes
    dataMasking: [
      {
        columns: ['CUSTOMER_EMAIL', 'CUSTOMER_PHONE'],
        pattern: /^.*/,
        replacement: '[REDACTED]'
      }
    ],

    // Límites de recursos
    resourceLimits: {
      maxRowsPerQuery: 10000,
      maxQueryCpuTime: 5000
    }
  }
};
```

Claude Desktop config:

```json
{
  "mcpServers": {
    "mcp-firebird-sales": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--config",
        "C:\\config\\config-sales-analysis.js"
      ]
    }
  }
}
```

#### Ejemplo 2: Servidor MCP para gestión de inventario

```javascript
// config-inventory.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Acceso a tablas de inventario
    allowedTables: [
      'INVENTORY', 'PRODUCTS', 'WAREHOUSES',
      'STOCK_MOVEMENTS', 'SUPPLIERS'
    ],

    // Permitir operaciones de lectura y escritura limitadas
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE'],

    // Prevenir modificación de registros históricos
    rowFilters: {
      'STOCK_MOVEMENTS': 'MOVEMENT_DATE > DATEADD(-30 DAY TO CURRENT_DATE)'
    },

    // Auditoría completa
    audit: {
      enabled: true,
      destination: 'both',
      auditFile: 'C:\\logs\\inventory-audit.log',
      auditTable: 'MCP_INVENTORY_AUDIT',
      detailLevel: 'full'
    }
  }
};
```

#### Ejemplo 3: Configuración para desarrollo y pruebas

```javascript
// config-development.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE_DEV,
  user: process.env.FIREBIRD_USER_DEV,
  password: process.env.FIREBIRD_PASSWORD_DEV,

  security: {
    // En desarrollo, permitir más operaciones
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE'],

    // Excluir sólo tablas críticas
    forbiddenTables: ['SYSTEM_CONFIG', 'APP_SECRETS'],

    // Limitar impacto de consultas pesadas
    resourceLimits: {
      maxRowsPerQuery: 1000,
      maxQueryCpuTime: 3000,
      queriesPerMinute: 120
    },

    // Auditoría básica
    audit: {
      enabled: true,
      destination: 'file',
      auditFile: './logs/dev-audit.log',
      detailLevel: 'basic'
    }
  }
};
```

Estos ejemplos ilustran cómo MCP Firebird puede configurarse para diferentes casos de uso, cada uno con sus propias consideraciones de seguridad y acceso a datos.

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
- Prevención de inyección SQL
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
- Prevención de inyección SQL
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

### Soporte Prioritario

⭐ **Los donantes y patrocinadores reciben soporte y asistencia prioritaria** con problemas, solicitudes de funciones y orientación de implementación. Aunque nos esforzamos por ayudar a todos los usuarios, aquellos que apoyan financieramente el proyecto recibirán tiempos de respuesta más rápidos y asistencia dedicada.

¡Tu apoyo es muy apreciado y ayuda a asegurar el desarrollo continuo de MCP Firebird!

## Licencia

MIT
