import { IOType } from 'node:child_process'

export interface MCPClientConfig {
  /** 传输协议类型：stdio | sse | streamableHttp */
  transportType: 'stdio' | 'sse' | 'streamableHttp'

  /** 服务器配置（stdio需要命令参数，sse需要URL） */
  serverConfig: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    sseUrl?: string
    streamableHttpUrl?: string
    httpHeaders?: Record<string, string>
    stderr?: IOType
  }
}

/** Server 配置文件 */
export interface MCPServerConfig {
  enabled: boolean
  server_name: string
  type: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  stderr?: IOType
  sse_url?: string
  streamable_http_url?: string
  http_headers?: Record<string, string> // server 的自定义请求头
}

/** Server 连接状态 */
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'
