# Events and Bidirectional Streaming (MCP 2.3+)

Starting from version 2.8.0-alpha, `mcp-firebird` offers full support for Firebird's native **Events (Triggers)** system via the bidirectional notification standard introduced in MCP 2.3.

This feature allows MCP clients (such as n8n, Claude, or custom applications) to subscribe to database events and receive real-time notifications **without the need to continuously poll the database**.

> [!IMPORTANT]
> **Core Requirement**: This functionality strictly requires the use of the **Native Firebird Driver**. The pure JavaScript driver (`node-firebird`) does not support robust asynchronous event listening without losing the connection, so enabling the native driver is mandatory.

---

## 1. How do Events work in Firebird?

In Firebird, you can define `POST_EVENT 'event_name';` within Triggers or Stored Procedures. When an action occurs in the database (e.g., inserting a new record), Firebird immediately notifies all clients subscribed to that event.

### Example of creating a Trigger in Firebird

Imagine you have a `USERS` table and want to send a notification every time a new user is inserted.

```sql
CREATE OR ALTER TRIGGER TRG_USERS_AFTER_INSERT FOR USERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
    /* Fire the event notifying that a user was added */
    POST_EVENT 'NEW_USER_CREATED';
END;
```

---

## 2. How to Configure the MCP Server for Events

Since the feature requires the **native driver**, you must start the MCP server with the appropriate flag:

```bash
# Start using NPX (recommended)
npx -y mcp-firebird --use-native-driver

# Or if you have Environment Managed Authorization (EMA) set up:
npx -y mcp-firebird --api-key="your-key"
```

The server will recognize that you are using the native driver and expose the event system to the MCP client.

---

## 3. Usage from the MCP Client

The MCP client will use tools and resources to interact with the events.

### Step 1: Subscribe to the event

The server exposes a tool called `subscribe_to_event`. The LLM or your automated flow must call it specifying the event name.

**Tool Call:**
- **Tool:** `subscribe_to_event`
- **Arguments:** `{"eventName": "NEW_USER_CREATED"}`

Once this tool is called, the MCP server does the following:
1. Creates a dedicated and persistent connection to the database using the native driver.
2. Registers the listener for `'NEW_USER_CREATED'`.
3. Instructs the MCP client to subscribe to notifications for the dynamic resource `firebird://events/NEW_USER_CREATED`.

### Step 2: Receive notifications (Bidirectional Streaming)

When Firebird fires the event, the MCP server will immediately send a JSON-RPC notification `notifications/resources/updated` to the client, indicating that the resource `firebird://events/NEW_USER_CREATED` has changed.

The client (n8n, Claude Desktop, etc.) will receive this notification in real-time.

### Step 3: Read event information

The MCP client, after receiving the notification that the resource was updated, can read the status of the event by reading the corresponding resource.

**Resource Read Call:**
- **URI:** `firebird://events/NEW_USER_CREATED`

**Response returned by the server:**
```json
{
  "event": "NEW_USER_CREATED",
  "count": 1,
  "timestamp": "2026-06-25T16:00:31.000Z",
  "status": "active"
}
```

---

## 4. Frequently Asked Questions

**Why does it fail saying `Error connecting to database: unsupported on-disk structure for file...`?**
If you receive this error when connecting with the native driver, it means the database you are connecting to has a different On-Disk Structure (ODS) version than the one supported by your locally installed `fbclient.dll`.
*Solution*: Make sure that the Firebird Client installed on your operating system matches the Firebird version where the database was created (for example, install the 3.0 client if the database is ODS 12.0).

**Does it consume additional connections?**
Yes, the MCP server's event manager opens **a single extra database connection** that is kept persistent exclusively to listen to all events. This connection remains dormant and does not block the general transaction pool.
