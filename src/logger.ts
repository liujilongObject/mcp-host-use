import fs from 'node:fs'
import path from 'node:path'

const MCP_LOG_DIR = '_mcp_logs'

class Logger {
  private logDir: string = ''
  private logFile: string = ''

  private logStream: fs.WriteStream | null = null
  private originalStdoutWrite!: NodeJS.WriteStream['write']
  private originalStderrWrite!: NodeJS.WriteStream['write']

  private isInitialized: boolean = false

  constructor() {}

  public async init(): Promise<void> {
    if (this.isInitialized) return

    try {
      await this.ensureLogDirExists()
      await this.cleanupOldLogs()
      this.logFile = this.createLogFileName()
      this.logStream = this.createLogStream()
      this.redirectConsoleOutput()
      this.isInitialized = true
    } catch (error) {
      console.error('日志系统初始化失败:', error)
    }
  }

  private async ensureLogDirExists(): Promise<void> {
    try {
      this.logDir = path.join(process.cwd(), MCP_LOG_DIR)

      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
        console.log(`日志目录已创建: ${this.logDir}`)
      }
    } catch (error) {
      console.error('创建日志目录失败:', error)
      throw error
    }
  }

  private generateTimeFormat(): string {
    const now = new Date()
    // 使用本地时间格式，包含毫秒以避免文件名冲突
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0')

    const formattedDate = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${milliseconds}`
    return formattedDate
  }

  private createLogFileName(): string {
    const formattedDate = this.generateTimeFormat()
    return path.join(this.logDir, `mcp_log_${formattedDate}.txt`)
  }

  private createLogStream(): fs.WriteStream {
    try {
      return fs.createWriteStream(this.logFile, { flags: 'a' })
    } catch (error) {
      console.error('创建日志文件流失败:', error)
      throw error
    }
  }

  private redirectConsoleOutput(): void {
    if (!this.logStream) {
      console.error('日志流未初始化，无法重定向输出')
      return
    }

    // 保存原始的输出方法
    this.originalStdoutWrite = process.stdout.write
    this.originalStderrWrite = process.stderr.write

    // 重定向标准输出
    const self = this
    process.stdout.write = (function (write: NodeJS.WriteStream['write']) {
      return function (chunk: any, encoding?: any, callback?: any): boolean {
        // 写入日志文件
        if (typeof encoding === 'function') {
          callback = encoding
          encoding = undefined
        }
        if (self.logStream) {
          const timePrefix = `[${self.generateTimeFormat()}]: `
          const content = typeof chunk === 'string' ? chunk : chunk.toString()
          self.logStream.write(timePrefix + content, encoding)
        }
        // 保持原来的控制台输出
        return write.call(process.stdout, chunk, encoding, callback)
      }
    })(this.originalStdoutWrite)

    // 重定向标准错误
    process.stderr.write = (function (write: NodeJS.WriteStream['write']) {
      return function (chunk: any, encoding?: any, callback?: any): boolean {
        // 写入日志文件
        if (typeof encoding === 'function') {
          callback = encoding
          encoding = undefined
        }
        if (self.logStream) {
          const timePrefix = `[${self.generateTimeFormat()}]: `
          const content = typeof chunk === 'string' ? chunk : chunk.toString()
          self.logStream.write(timePrefix + content, encoding)
        }
        // 保持原来的控制台输出
        return write.call(process.stderr, chunk, encoding, callback)
      }
    })(this.originalStderrWrite)

    console.log(`日志文件已创建: ${this.logFile}`)
  }

  public restore(): void {
    if (!this.isInitialized) return

    // 恢复原始的输出方法
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite
    }
    // 关闭日志文件流
    if (this.logStream) {
      this.logStream.end()
      this.logStream = null
    }
    this.isInitialized = false
    console.log('日志系统已关闭')
  }

  // 清理旧日志文件：保留当天和前一天的日志
  private async cleanupOldLogs(): Promise<void> {
    try {
      if (!fs.existsSync(this.logDir)) return

      const files = fs.readdirSync(this.logDir)
      const now = new Date()

      // 获取当天的开始时间（00:00:00）
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // 获取前一天的开始时间
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

      for (const file of files) {
        if (!file.startsWith('mcp_log_')) continue

        try {
          // 从文件名解析日期 (格式: mcp_log_YYYY-MM-DD_HH-MM-SS-MS.txt)
          const dateStr = file.substring(8, 18) // 提取 YYYY-MM-DD 部分
          const [year, month, day] = dateStr.split('-').map((num) => parseInt(num))

          // 月份要减1，因为JavaScript中月份是从0开始的
          const fileDate = new Date(year, month - 1, day)

          // 如果文件日期早于昨天，则删除
          if (fileDate < yesterday) {
            const filePath = path.join(this.logDir, file)
            fs.unlinkSync(filePath)
            console.log(`已删除旧日志文件: ${file}`)
          }
        } catch (err) {
          console.error(`处理日志文件 ${file} 时出错:`, err)
        }
      }

      console.log('日志清理完成，已保留当天和前一天的日志')
    } catch (error) {
      console.error('清理旧日志文件失败:', error)
    }
  }
}

// 创建单例实例
export const logger = new Logger()

// 处理进程退出时的清理
process.on('exit', () => {
  logger.restore()
})

process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err)
  logger.restore()
  process.exit(1)
})
