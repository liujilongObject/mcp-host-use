import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import type { MCPClient } from './client.js'
import type { MCPConnectionManager } from './host.js'
import { withTimeoutPromise, getServerConfig } from './utils.js'

const app = express()

let connectionManager: MCPConnectionManager | null = null

let getActiveMcpConnections: () => Map<string, MCPClient>

// 添加服务器安装锁
const serverInstallLocks = new Map<string, Promise<any>>()

// 解决跨域问题
app.use(
  cors({
    origin: (origin, callback) => {
      // 允许没有来源的请求（如移动应用或Postman）
      if (!origin) return callback(null, true)

      // 检查是否是允许的域名
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true)
      }

      callback(new Error('不允许的CORS来源'))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // 允许携带凭证
  })
)

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
      msg: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
    })
  }
}

// GET /api/tools - 获取所有工具
app.get(
  '/api/tools',
  errorHandler(async (req: Request, res: Response) => {
    await connectionManager?.refreshConnections()

    const promises = []
    for (const [server_name, client] of getActiveMcpConnections().entries()) {
      promises.push(
        withTimeoutPromise(
          client.listTools().then((tools) => ({
            server_name,
            tools,
          })),
          5000, // 5秒超时
          { server_name, tools: [] } // 超时返回空工具列表
        )
      )
    }

    const toolsOfServers = (await Promise.allSettled(promises))
      .map((item) => {
        if (item.status === 'fulfilled') {
          return item.value
        }
        return null
      })
      .filter((item) => !!item)

    res.json({
      code: 0,
      data: toolsOfServers,
    })
  })
)

// POST /api/tools/batch - 批量获取指定服务器上的工具
app.post(
  '/api/tools/batch',
  errorHandler(async (req: Request, res: Response) => {
    const { server_names } = req.body

    // 验证参数
    if (!Array.isArray(server_names) || !server_names.length) {
      return res.status(400).json({
        code: 1,
        msg: '服务器名称列表缺失',
      })
    }

    // 并行处理所有服务器连接
    const connectionPromises = server_names.map(async (server_name) => {
      let client = getActiveMcpConnections().get(server_name)

      // 已有连接，直接复用
      if (client) {
        return { server_name, client, status: 'success' }
      }

      // 获取最新的服务器配置
      const serverConfigs = await getServerConfig()
      const serverConfig = serverConfigs?.find((c) => c.server_name === server_name)
      // 服务器配置不存在
      if (!serverConfig) {
        return {
          server_name,
          client: null,
          status: 'error',
          error: '服务器不存在',
        }
      }

      // 服务器已禁用
      if (!serverConfig.enabled) {
        return {
          server_name,
          client: null,
          status: 'error',
          error: '服务器已下线',
        }
      }

      // 尝试建立连接
      try {
        client = await connectionManager?.restartConnection(server_name, serverConfig)
        return { server_name, client, status: 'success' }
      } catch (error) {
        console.error(`创建服务器${server_name}连接失败:`, error)
        return {
          server_name,
          client: null,
          status: 'error',
          error: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
        }
      }
    })

    // 等待所有连接处理完成
    const connectionResults = await Promise.all(connectionPromises)

    // 并行获取工具
    const toolPromises = connectionResults.map((result) => {
      if (result.status === 'error' || !result.client) {
        return Promise.resolve({
          server_name: result.server_name,
          tools: [],
        })
      }

      // 有可用连接时，获取工具并设置超时
      return withTimeoutPromise(
        result.client.listTools().then((tools) => ({
          server_name: result.server_name,
          tools,
        })),
        5000, // 5秒超时
        { server_name: result.server_name, tools: [] } // 超时返回空工具列表
      )
    })

    const toolsResults = await Promise.all(toolPromises)
    // 过滤掉空工具列表
    const filteredToolsResults = toolsResults.filter((item) => item.tools.length > 0)

    res.json({
      code: 0,
      data: filteredToolsResults,
    })
  })
)

// POST /api/tools/toolCall - 调用指定 server 的工具
app.post(
  '/api/tools/toolCall',
  errorHandler(async (req: Request, res: Response) => {
    const { server_name, tool_name, tool_args } = req.body
    const thatClient = getActiveMcpConnections().get(server_name)!
    const result = await thatClient.callToolWithReconnect(tool_name, tool_args)

    res.json({
      code: 0,
      data: result,
    })
  })
)

// GET /api/resources - 获取所有资源
app.get(
  '/api/resources',
  errorHandler(async (req: Request, res: Response) => {
    const resourcesOfServers = []
    for (const [server_name, client] of getActiveMcpConnections().entries()) {
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
    const thatClient = getActiveMcpConnections().get(server_name)!
    const result = await thatClient.readResource(resource_uri)

    res.json({
      code: 0,
      data: result,
    })
  })
)

// POST /api/connections/update - 更新全部连接
app.post(
  '/api/connections/update',
  errorHandler(async (req: Request, res: Response) => {
    await connectionManager?.refreshConnections()

    res.json({
      code: 0,
      msg: '成功更新服务器连接',
    })
  })
)

// POST /api/server/install/batch - 批量安装服务器
app.post(
  '/api/server/install/batch',
  errorHandler(async (req: Request, res: Response) => {
    const { server_name } = req.body

    if (!server_name) {
      return res.status(400).json({
        code: 1,
        msg: '服务器名称缺失',
      })
    }

    const serverNameList = server_name.split(',') as string[]

    // 并行处理每个服务器的安装
    const installPromises = serverNameList.map(async (server_name) => {
      // 检查服务器是否已存在连接
      const existingClient = getActiveMcpConnections().get(server_name)
      if (existingClient) {
        return {
          server_name,
          installed: true,
          msg: '服务器已连接',
        }
      }

      // 使用锁确保同一服务器不会被并发安装
      let installPromise = serverInstallLocks.get(server_name)
      if (!installPromise) {
        // 创建新的安装任务
        installPromise = (async () => {
          try {
            // 获取服务器配置
            const serverConfigs = await getServerConfig()
            const config = serverConfigs.find((c) => c.server_name === server_name)

            // 配置不存在
            if (!config) {
              return {
                server_name,
                installed: false,
                msg: '服务器配置不存在',
              }
            }

            // 服务已下线
            if (!config.enabled) {
              return {
                server_name,
                installed: false,
                msg: '服务器已下线',
              }
            }

            // 创建新连接
            await connectionManager?.restartConnection(server_name, config)

            return {
              server_name,
              installed: true,
              msg: '安装成功',
            }
          } catch (error) {
            console.error('安装服务器失败:', error)
            return {
              server_name,
              installed: false,
              msg: `安装服务器失败: ${error instanceof Error ? error.message : '未知错误'}`,
            }
          } finally {
            // 无论成功失败，都要释放锁
            serverInstallLocks.delete(server_name)
          }
        })()

        // 设置锁
        serverInstallLocks.set(server_name, installPromise)
      }

      // 等待锁定的安装过程完成
      return await installPromise
    })

    // 等待所有安装完成
    const results = await Promise.all(installPromises)

    res.json({
      code: 0,
      data: results,
    })
  })
)

// POST /api/server/uninstall - 卸载服务器
app.post(
  '/api/server/uninstall',
  errorHandler(async (req: Request, res: Response) => {
    const { server_name } = req.body

    if (!server_name) {
      return res.status(400).json({
        code: 1,
        server_name,
        uninstalled: false,
        msg: '服务器名称缺失',
      })
    }

    const existingClient = getActiveMcpConnections().get(server_name)
    if (!existingClient) {
      return res.json({
        code: 1,
        server_name,
        uninstalled: false,
        msg: '服务器不存在',
      })
    }

    try {
      await connectionManager?.removeConnection(server_name)

      res.json({
        code: 0,
        server_name,
        uninstalled: true,
      })
    } catch (error) {
      console.error('卸载服务器失败:', error)
      throw new Error(`卸载服务器失败`)
    }
  })
)

const PORT = 17925

export function createHostServer(manager: MCPConnectionManager) {
  connectionManager = manager
  getActiveMcpConnections = () => manager.getAllConnections()

  return new Promise<void>((resolve) => {
    app
      .listen(PORT, () => {
        console.log(`[MCP Host Server] running on: http://localhost:${PORT} \n`)
        resolve()
      })
      .on('error', (error) => {
        console.error('[MCP Host Server] 启动失败:', error)
        process.exit(1)
      })
  })
}
