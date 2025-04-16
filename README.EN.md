<p align="center">
  <a href="./README.md">中文</a> | EN
</p>

# mcp-host-use

### mcp-host-use is a Node.js-based Model Context Protocol (MCP) host application for connecting and managing multiple MCP servers. The Host provides a unified interface that allows clients to interact with multiple MCP servers through HTTP APIs, accessing and invoking tools (or resources). You can use it to quickly test and run your MCP Servers.

## Architecture Diagram

```mermaid
graph TD
    Client[Client] -->|HTTP Request| HostServer[MCP Host Server]
    HostServer -->|Manage| ConnectionManager[Connection Manager]
    ConnectionManager -->|Create/Manage| MCPClient1[MCP Client 1]
    ConnectionManager -->|Create/Manage| MCPClient2[MCP Client 2]
    ConnectionManager -->|Create/Manage| MCPClientN[MCP Client N]
    MCPClient1 -->|STDIO/SSE| MCPServer1[MCP Server 1]
    MCPClient2 -->|STDIO/SSE| MCPServer2[MCP Server 2]
    MCPClientN -->|STDIO/SSE| MCPServerN[MCP Server N]
```

## Key Features
- Support for connecting multiple MCP servers simultaneously, managed through a `json` file
- Support for both STDIO and SSE transport methods
- Provides unified HTTP API interfaces for:
    - Retrieving tool lists from all servers
    - Invoking tools on specific servers
    - Getting resource lists from all servers
    - Accessing resources from specific servers
    - Triggering Host to actively update Server connections

## Project Structure
```bash
mcp-host-use/
├── src/                      # Source code directory
│   ├── main.ts               # Main entry file
│   ├── host.ts               # MCP connection manager
│   ├── client.ts             # MCP client implementation
│   ├── server.ts             # HTTP server implementation
│   ├── types.ts              # Type definitions
│   └── utils.ts              # Utility functions
```

## Requirements
- **For connecting to STDIO MCP Server, requires `npx` or `uvx` system runtime environment.**
  - `npx` requires Nodejs (>=18)
  - `uvx` requires Python (uv)

## Usage

### 1. Using `npm` package, no local build required (Recommended)

`npx mcp-host-use`

### 2. Local build, clone this repository `git clone https://github.com/liujilongObject/mcp-host-use.git`

#### Install dependencies
- `npm install`

#### Development mode
- `npm run dev`

#### Production mode
- `npm run build`
  - For production use:
    - Using custom Node.js environment: `production_node.exe dist/index.js`
    - Using host machine's Node.js environment: `node dist/index.js`

## Servers Configuration File

`mcp-host-use` reads the `mcp_servers.config.json` file from the **current working directory**, with the following format:

```json
{
    "mcp_servers": [
        {
            "enabled": true, // Whether to enable the server
            "type": "stdio", // 'stdio' | 'sse'
            "server_name": "server-puppeteer", // Custom name
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-puppeteer"
            ]
        },
        {
            "enabled": true,
            "type": "sse",
            "server_name": "server-everything-sse",
            "sse_url": "http://localhost:3001/sse"
        },
        {
            "enabled": true,
            "type": "stdio",
            "server_name": "github",
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-github"
            ],
            "env": { // Supports environment variable configuration
                "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
            }
        }
    ]
}
```

## Notes
- The server runs on port 17925 by default
- Ensure server information in the configuration file is correct
- For STDIO transport method, ensure the following commands are executable:
    - `npx`
    - `uvx`
- For SSE transport method, ensure the URL is accessible

## API Endpoints

## Tools

### 1. Get All Tools List

```bash
GET http://localhost:17925/api/tools
```

#### Response
```json
{
  "code": 0,
  "data": [
    {
      "server_name": "Server1",
      "tools": [
        {
          "name": "Tool Name",
          "description": "Tool Description",
          "inputSchema": { ... }
        }
      ]
    }
  ]
}
```

### 2. Invoke Tool

```bash
POST http://localhost:17925/api/tools/toolCall
Content-Type: application/json

{
  "server_name": "Server Name",
  "tool_name": "Tool Name",
  "tool_args": { ... }
}
```

#### Response

```json
{
  "code": 0,
  "data": {
    "result": "Tool Execution Result"
  }
}
```

## Resources

### 1. Get All Resources List

```bash
GET http://localhost:17925/api/resources
```

#### Response
```json
{
  "code": 0,
  "data": [
    {
      "server_name": "Server1",
      "resources": [
        {
          "uri": "Resource URI",
          "mimeType": "Resource Type",
          "name": "Resource Name"
        }
      ]
    }
  ]
}
```

### 2. Read Specific Resource

```bash
POST http://localhost:17925/api/resources/read
Content-Type: application/json

{
  "server_name": "Server Name",
  "resource_uri": "Resource URI"
}
```

#### Response

```json
{
  "code": 0,
  "data":  [
      {
        "mimeType": "Resource Type",
        "text": "Text type resource",
        "blob": "Blob type resource"
      }
    ]
}
```

## Connections

### 1. Update Server Connection

> **After calling this API, the Host will actively read the configuration file and create/restart/delete Server connections based on the updated configuration. No need to restart the Host service, continue calling `/api/tools` and other APIs to get the updated Server information.**

```bash
POST http://localhost:17925/api/connections/update
Content-Type: application/json
```

#### Response
```json
{"code":0,"message":"Successfully updated server connections"}
```

## License

MIT
