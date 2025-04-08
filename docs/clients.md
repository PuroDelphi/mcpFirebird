# Uso de MCP Firebird desde diferentes lenguajes

Este documento muestra cómo usar MCP Firebird desde diferentes lenguajes de programación.

## TypeScript/JavaScript

```typescript
// Ejemplo con TypeScript/JavaScript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

class McpFirebirdClient {
  private process: any;
  private readline: any;
  private requestId = 1;
  private responseHandlers = new Map();

  constructor(databasePath: string, user = 'SYSDBA', password = 'masterkey') {
    // Iniciar el proceso del servidor MCP
    this.process = spawn('npx', [
      'mcp-firebird',
      '--database', databasePath,
      '--user', user,
      '--password', password
    ]);

    // Configurar el lector de líneas para procesar respuestas
    this.readline = createInterface({
      input: this.process.stdout,
      terminal: false
    });

    this.readline.on('line', (line: string) => {
      try {
        const response = JSON.parse(line);
        const handler = this.responseHandlers.get(response.id);
        if (handler) {
          handler(response);
          this.responseHandlers.delete(response.id);
        }
      } catch (error) {
        console.error('Error parsing response:', error);
      }
    });

    this.process.stderr.on('data', (data: Buffer) => {
      console.error(`Server error: ${data.toString()}`);
    });
  }

  async sendRequest(method: string, params: any = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = JSON.stringify({ id, method, params }) + '\n';

      this.responseHandlers.set(id, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      });

      this.process.stdin.write(request);
    });
  }

  async listTables() {
    return this.sendRequest('list-tables');
  }

  async executeQuery(sql: string, params: any[] = []) {
    return this.sendRequest('execute-query', { sql, params });
  }

  async close() {
    this.process.kill();
  }
}

// Uso del cliente
async function main() {
  const client = new McpFirebirdClient('/path/to/database.fdb');
  
  try {
    // Listar tablas
    const tables = await client.listTables();
    console.log('Tables:', tables);
    
    // Ejecutar una consulta
    const results = await client.executeQuery('SELECT * FROM EMPLOYEES');
    console.log('Results:', results);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```

## Python

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
        self.request_id = 1
    
    def send_request(self, method, params=None):
        if params is None:
            params = {}
        
        request = {
            'id': self.request_id,
            'method': method,
            'params': params
        }
        self.request_id += 1
        
        # Enviar la solicitud al proceso
        request_str = json.dumps(request) + '\n'
        self.process.stdin.write(request_str)
        self.process.stdin.flush()
        
        # Leer la respuesta
        response_str = self.process.stdout.readline()
        response = json.loads(response_str)
        
        if 'error' in response:
            raise Exception(response['error'])
        
        return response['result']
    
    def list_tables(self):
        return self.send_request('list-tables')
    
    def execute_query(self, sql, params=None):
        if params is None:
            params = []
        return self.send_request('execute-query', {'sql': sql, 'params': params})
    
    def close(self):
        self.process.terminate()
        self.process.wait()

# Uso del cliente
client = McpFirebirdClient('/path/to/database.fdb')
try:
    # Obtener información del servidor
    server_info = client.send_request('ping')
    print(f"MCP Server: {server_info}")

    # Listar tablas
    tables = client.list_tables()
    print(f"Available tables: {tables}")

    # Ejecutar una consulta
    results = client.execute_query("SELECT FIRST 10 * FROM EMPLOYEES")
    print(f"Results: {results}")
finally:
    client.close()
```

## Delphi

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
    FProcess: TProcess;
    FRequestId: Integer;
    function ReadResponse: string;
  public
    constructor Create(const DatabasePath, User, Password: string);
    destructor Destroy; override;
    function SendRequest(const Method: string; const Params: TJSONObject = nil): TJSONObject;
    function ListTables: TJSONArray;
    function ExecuteQuery(const SQL: string; const Params: TJSONArray = nil): TJSONArray;
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
  Buffer: array[0..4095] of Byte;
  BytesRead: Integer;
  ResponseStr: string;
begin
  ResponseStr := '';
  repeat
    BytesRead := FProcess.Output.Read(Buffer, SizeOf(Buffer));
    if BytesRead > 0 then
    begin
      SetLength(ResponseStr, BytesRead div 2);
      Move(Buffer[0], ResponseStr[1], BytesRead);
      Break;
    end;
  until BytesRead = 0;
  Result := ResponseStr;
end;

function TMcpFirebirdClient.ListTables: TJSONArray;
var
  Response: TJSONObject;
begin
  Response := SendRequest('list-tables');
  try
    Result := Response.GetValue('result') as TJSONArray;
  finally
    Response.Free;
  end;
end;

function TMcpFirebirdClient.ExecuteQuery(const SQL: string; const Params: TJSONArray = nil): TJSONArray;
var
  QueryParams: TJSONObject;
  Response: TJSONObject;
begin
  QueryParams := TJSONObject.Create;
  try
    QueryParams.AddPair('sql', SQL);
    if Assigned(Params) then
      QueryParams.AddPair('params', Params)
    else
      QueryParams.AddPair('params', TJSONArray.Create);

    Response := SendRequest('execute-query', QueryParams);
    try
      Result := Response.GetValue('result') as TJSONArray;
    finally
      Response.Free;
    end;
  finally
    QueryParams.Free;
  end;
end;

var
  Client: TMcpFirebirdClient;
  Tables: TJSONArray;
  QueryResults: TJSONArray;
  I: Integer;

begin
  try
    WriteLn('Starting MCP Firebird client...');

    // Crear el cliente
    Client := TMcpFirebirdClient.Create('C:\Databases\example.fdb', 'SYSDBA', 'masterkey');
    try
      // Listar tablas
      Tables := Client.ListTables;
      WriteLn('Available tables:');
      for I := 0 to Tables.Count - 1 do
        WriteLn('- ', Tables.Items[I].GetValue<string>('name'));

      // Ejecutar una consulta
      QueryResults := Client.ExecuteQuery('SELECT FIRST 10 * FROM EMPLOYEES');
      WriteLn('Query results: ', QueryResults.Count, ' rows');
    finally
      Client.Free;
    end;
  except
    on E: Exception do
      WriteLn('Error: ', E.Message);
  end;

  WriteLn('Press ENTER to exit...');
  ReadLn;
end.
```
