import express, { Request, Response } from 'express'
import { MCPClient } from './index.js'

const PORT = 36003
const app = express()

let _mcpClient: MCPClient

app.get('/list-tools', async (req: Request, res: Response) => {
  try {
    const tools = await _mcpClient.listTools()
    const toolNames = tools?.map((tool) => tool.function.name)
    res.send({
      code: 0,
      data: toolNames
    })
  } catch (error) {
    console.error('Failed to list tools:', error)
    res.status(500).send({
      code: 1,
      message: 'Failed to list tools'
    })
  }
})

app.get('/list-resources', async (req: Request, res: Response) => {
  try {
    const resources = await _mcpClient.listResources()
    res.send({
      code: 0,
      data: resources
    })
  } catch (error) {
    console.error('Failed to list resources:', error)
    res.status(500).send({
      code: 1,
      message: 'Failed to list resources'
    })
  }
})

app.post('/call-tool', async (req: Request, res: Response) => {
  try {
    const { toolName, toolArgs } = req.body
    const result = await _mcpClient.callTool(toolName, toolArgs)
    res.send({
      code: 0,
      data: result
    })
  } catch (error) {
    console.error('Failed to call tool:', error)
    res.status(500).send({
      code: 1,
      message: 'Failed to call tool'
    })
  }
})

export function createHostServer(mcpClient: MCPClient) {
  _mcpClient = mcpClient
  app.listen(PORT, () => {
    console.log(`[Host Server] is running on port http://localhost:${PORT}`)
  })
}
