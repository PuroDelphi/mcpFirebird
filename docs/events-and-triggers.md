# Triggers and Proactive Events (POST_EVENT)

MCP Firebird includes native support for Firebird's asynchronous event system. This means that when a `POST_EVENT` is executed inside a trigger or stored procedure in your database, the MCP server listens to the event and notifies your client (LLM, Claude, or n8n) in real-time.

## How does it work?

1. An action occurs in the database (e.g. a record is inserted) and the Firebird Trigger executes `POST_EVENT 'NEW_ORDER'`.
2. The MCP server, which uses the native driver (`node-firebird-driver-native`), intercepts this event asynchronously.
3. The MCP server sends a proactive `notifications/resources/updated` notification to the client using **Streamable HTTP / SSE**.
4. The client (e.g. Claude) receives the notification that the resource `firebird://events/NEW_ORDER` has been updated, and can then query what changed.

> [!WARNING]
> To use this feature, you **MUST** be using the **Streamable HTTP (SSE)** transport. The classic stdio transport generally doesn't support the efficient delivery of server notifications without the client actively requesting them. Additionally, you must have the native driver `node-firebird-driver-native` installed.

## How to Use It (Detailed Example)

### 1. Set up the event in Firebird

Create a Trigger in your database to fire the event when something important happens:

```sql
CREATE OR ALTER TRIGGER TRG_NEW_ORDER FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
    POST_EVENT 'NEW_ORDER';
END
```

### 2. Subscribe your MCP client to the event

Your AI agent (LLM) or n8n workflow must use the `subscribe_to_event` tool to tell the server it is interested in that event.

**Request to the server (Calling the tool):**
- Tool Name: `subscribe_to_event`
- Arguments: `{"eventName": "NEW_ORDER"}`

### 3. Wait for the Notification!

The MCP client, listening via the HTTP Stream (SSE), will instantly receive a notification when an INSERT is made in the `ORDERS` table.

The client receives a notification that the URI `firebird://events/NEW_ORDER` has changed, and can proceed to use `read_resource` to read the state of the event, or execute a SQL query to check the new data.

## Advantages for Intelligent Agents

Instead of your LLM agent asking every 5 minutes "Is there any new order?" using repetitive queries that overload the database, the agent simply subscribes and "sleeps." When the event occurs, the agent wakes up and reacts. This is true proactive automation!
