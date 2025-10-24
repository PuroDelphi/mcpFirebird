"""
MCP Firebird - Streamable HTTP Client Example (Python)

This example demonstrates how to connect to an MCP Firebird server
using the modern Streamable HTTP transport.

Prerequisites:
- pip install mcp httpx

Usage:
python streamable_http_client.py
"""

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client


async def main():
    print("🚀 Connecting to MCP Firebird server...")

    # Connect using Streamable HTTP transport
    async with streamable_http_client("http://localhost:3012/mcp") as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize the connection
            await session.initialize()
            print("✅ Connected to MCP Firebird server\n")

            # List available tools
            print("📋 Listing available tools...")
            tools = await session.list_tools()
            print(f"Found {len(tools.tools)} tools:")
            for tool in tools.tools:
                print(f"  - {tool.name}: {tool.description}")
            print()

            # List available prompts
            print("💬 Listing available prompts...")
            prompts = await session.list_prompts()
            print(f"Found {len(prompts.prompts)} prompts:")
            for prompt in prompts.prompts:
                print(f"  - {prompt.name}: {prompt.description}")
            print()

            # Example: List tables
            print("🗂️  Listing database tables...")
            tables_result = await session.call_tool(
                "list-tables_mcp-firebird",
                arguments={"schemas": ["PUBLIC"]}
            )
            print(f"Tables: {tables_result.content[0].text}")
            print()

            # Example: Execute a query
            print("🔍 Executing a sample query...")
            query_result = await session.call_tool(
                "execute-query_mcp-firebird",
                arguments={"query": "SELECT FIRST 5 * FROM RDB$DATABASE"}
            )
            print(f"Query result: {query_result.content[0].text}")
            print()

            # Example: Get a prompt
            print("📝 Getting database-analysis prompt...")
            prompt = await session.get_prompt(
                "database-analysis",
                arguments={"analysisType": "performance"}
            )
            print(f"Prompt messages: {len(prompt.messages)}")
            print()

            print("✅ All operations completed successfully!")
            print("👋 Connection closed")


if __name__ == "__main__":
    asyncio.run(main())

