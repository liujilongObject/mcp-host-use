import express, { Request, Response, NextFunction } from 'express'
import { MCPClient } from './client.js'

const app = express()

let allConnections: Map<string, MCPClient>

let allClients: MCPClient[]

// 解析JSON请求体
app.use(express.json())

// 统一设置响应 content-type为application/json
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json')
  next()
})

// 统一错误响应处理中间件
const errorHandler = (fn: Function) => async (req: Request, res: Response) => {
  try {
    await fn(req, res)
  } catch (error) {
    console.error(`请求失败: ${req.method} ${req.path}`, error)
    res.status(500).json({
      code: 1,
      message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`
    })
  }
}

// GET /api/tools - 获取所有工具
app.get('/api/tools', errorHandler(async (req: Request, res: Response) => {
  const toolsOfServer = []
  for (const [server_name, client] of allConnections.entries()) {
    const tools = await client.listTools()
    toolsOfServer.push({
      server_name,
      tools
    })
  }

  res.json({
    code: 0,
    data: toolsOfServer
  })
}))

// GET /api/resources - 获取所有资源
app.get('/api/resources', errorHandler(async (req: Request, res: Response) => {
  const resourcesOfServer = []
  for (const [server_name, client] of allConnections.entries()) {
    const resources = await client.listResources()
    resourcesOfServer.push({
      server_name,
      resources
    })
  }
  res.json({
    code: 0,
    data: resourcesOfServer
  })
}))

// POST /api/tools/toolCall - 调用指定 server 的工具
app.post('/api/tools/toolCall', errorHandler(async (req: Request, res: Response) => {
  const toolCallArgs = req.body
  const { server_name, tool_name, tool_args } = toolCallArgs
  const thatClient = allConnections.get(server_name) as MCPClient
  const result = await thatClient.callTool(tool_name, tool_args)
  res.json({
    code: 0,
    data: result
  })
}))

const PORT = 36003

export function createHostServer(connections: Map<string, MCPClient>) {
  allConnections = connections
  allClients = Array.from(connections.values())
  app.listen(PORT, () => {
    console.log(`[MCP Host Server] running on: http://localhost:${PORT}`)
  })
}
