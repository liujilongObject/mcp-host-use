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
      message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
    })
  }
}

// GET /api/tools - 获取所有工具
app.get(
  '/api/tools',
  errorHandler(async (req: Request, res: Response) => {
    const toolsOfServers = []
    for (const [server_name, client] of allConnections.entries()) {
      const tools = await client.listTools()
      toolsOfServers.push({
        server_name,
        tools,
      })
    }

    res.json({
      code: 0,
      data: toolsOfServers,
    })
  })
)

// GET /api/resources - 获取所有资源
app.get(
  '/api/resources',
  errorHandler(async (req: Request, res: Response) => {
    const resourcesOfServers = []
    for (const [server_name, client] of allConnections.entries()) {
      const resources = await client.listResources()
      resourcesOfServers.push({
        server_name,
        resources,
      })
    }

    res.json({
      code: 0,
      data: resourcesOfServers.filter((item) => item.resources.length > 0),
    })
  })
)

// POST /api/resources/read - 获取指定的资源
app.post(
  '/api/resources/read',
  errorHandler(async (req: Request, res: Response) => {
    const { server_name, resource_uri } = req.body
    const thatClient = allConnections.get(server_name)!
    const result = await thatClient.readResource(resource_uri)

    res.json({
      code: 0,
      data: result,
    })
  })
)

// POST /api/tools/toolCall - 调用指定 server 的工具
app.post(
  '/api/tools/toolCall',
  errorHandler(async (req: Request, res: Response) => {
    const { server_name, tool_name, tool_args } = req.body
    const thatClient = allConnections.get(server_name)!
    const result = await thatClient.callTool(tool_name, tool_args)

    res.json({
      code: 0,
      data: result,
    })
  })
)

const PORT = 17925

export function createHostServer(connections: Map<string, MCPClient>) {
  allConnections = connections
  allClients = Array.from(connections.values())
  app.listen(PORT, () => {
    console.log(`[MCP Host Server] running on: http://localhost:${PORT} \n`)
  })
}
