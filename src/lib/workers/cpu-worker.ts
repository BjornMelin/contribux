/**
 * Worker thread implementation for CPU-intensive operations
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { cpus } from 'os'

export interface WorkerTask<T = any, R = any> {
  id: string
  type: string
  payload: T
  timestamp: number
}

export interface WorkerResult<R = any> {
  taskId: string
  success: boolean
  result?: R
  error?: string
  duration: number
  memoryUsage: number
}

export interface WorkerPoolConfig {
  maxWorkers: number
  taskTimeout: number
  idleTimeout: number
  memoryLimit: number
}

/**
 * CPU-intensive task types
 */
export type TaskType = 
  | 'vector_calculation'
  | 'data_transformation'
  | 'image_processing'
  | 'text_analysis'
  | 'encryption'
  | 'compression'

/**
 * Worker pool for managing CPU-intensive tasks
 */
export class CPUWorkerPool {
  private workers: Map<string, Worker> = new Map()
  private taskQueue: WorkerTask[] = []
  private activeTasks: Map<string, { workerId: string; startTime: number }> = new Map()
  private config: WorkerPoolConfig

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = {
      maxWorkers: Math.min(cpus().length - 1, 4), // Leave one CPU for main thread
      taskTimeout: 30000, // 30 seconds
      idleTimeout: 60000, // 1 minute
      memoryLimit: 512 * 1024 * 1024, // 512MB per worker
      ...config,
    }
  }

  /**
   * Execute a CPU-intensive task
   */
  async executeTask<T, R>(type: TaskType, payload: T): Promise<R> {
    const task: WorkerTask<T> = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.cancelTask(task.id)
        reject(new Error(`Task ${task.id} timed out after ${this.config.taskTimeout}ms`))
      }, this.config.taskTimeout)

      this.processTask(task)
        .then((result) => {
          clearTimeout(timeoutId)
          resolve(result.result as R)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Process a task with an available worker
   */
  private async processTask(task: WorkerTask): Promise<WorkerResult> {
    const worker = await this.getAvailableWorker()
    
    return new Promise((resolve, reject) => {
      const messageHandler = (result: WorkerResult) => {
        worker.off('message', messageHandler)
        worker.off('error', errorHandler)
        
        this.activeTasks.delete(task.id)
        this.releaseWorker(worker)
        
        if (result.success) {
          resolve(result)
        } else {
          reject(new Error(result.error))
        }
      }

      const errorHandler = (error: Error) => {
        worker.off('message', messageHandler)
        worker.off('error', errorHandler)
        
        this.activeTasks.delete(task.id)
        this.terminateWorker(worker)
        
        reject(error)
      }

      worker.on('message', messageHandler)
      worker.on('error', errorHandler)
      
      this.activeTasks.set(task.id, {
        workerId: this.getWorkerId(worker),
        startTime: Date.now(),
      })
      
      worker.postMessage(task)
    })
  }

  /**
   * Get an available worker or create a new one
   */
  private async getAvailableWorker(): Promise<Worker> {
    // Try to find an idle worker
    for (const [workerId, worker] of this.workers) {
      if (!this.isWorkerBusy(workerId)) {
        return worker
      }
    }

    // Create new worker if under limit
    if (this.workers.size < this.config.maxWorkers) {
      return this.createWorker()
    }

    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const [workerId, worker] of this.workers) {
          if (!this.isWorkerBusy(workerId)) {
            clearInterval(checkInterval)
            resolve(worker)
            return
          }
        }
      }, 100)
    })
  }

  /**
   * Create a new worker thread
   */
  private createWorker(): Worker {
    const worker = new Worker(__filename, {
      workerData: { isWorker: true },
      resourceLimits: {
        maxOldGenerationSizeMb: this.config.memoryLimit / (1024 * 1024),
      },
    })

    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    this.workers.set(workerId, worker)

    // Handle worker termination
    worker.on('exit', (code) => {
      this.workers.delete(workerId)
      if (code !== 0) {
        console.warn(`Worker ${workerId} exited with code ${code}`)
      }
    })

    // Set up idle timeout
    setTimeout(() => {
      if (!this.isWorkerBusy(workerId)) {
        this.terminateWorker(worker)
      }
    }, this.config.idleTimeout)

    return worker
  }

  /**
   * Check if worker is currently processing a task
   */
  private isWorkerBusy(workerId: string): boolean {
    for (const task of this.activeTasks.values()) {
      if (task.workerId === workerId) {
        return true
      }
    }
    return false
  }

  /**
   * Release a worker back to the pool
   */
  private releaseWorker(worker: Worker): void {
    // Worker is automatically available for next task
    // Cleanup happens in periodic maintenance
  }

  /**
   * Terminate a worker thread
   */
  private terminateWorker(worker: Worker): void {
    const workerId = this.getWorkerId(worker)
    this.workers.delete(workerId)
    worker.terminate()
  }

  /**
   * Get worker ID from worker instance
   */
  private getWorkerId(worker: Worker): string {
    for (const [id, w] of this.workers) {
      if (w === worker) return id
    }
    return 'unknown'
  }

  /**
   * Cancel a running task
   */
  private cancelTask(taskId: string): void {
    const task = this.activeTasks.get(taskId)
    if (task) {
      const worker = this.workers.get(task.workerId)
      if (worker) {
        this.terminateWorker(worker)
      }
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * Get worker pool statistics
   */
  getStats(): {
    totalWorkers: number
    activeWorkers: number
    queuedTasks: number
    activeTasks: number
  } {
    const activeWorkers = Array.from(this.workers.keys()).filter(id => this.isWorkerBusy(id)).length
    
    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
    }
  }

  /**
   * Shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    const terminationPromises = Array.from(this.workers.values()).map(worker => 
      worker.terminate()
    )
    
    await Promise.all(terminationPromises)
    this.workers.clear()
    this.activeTasks.clear()
    this.taskQueue.length = 0
  }
}

/**
 * Worker thread implementation
 */
if (!isMainThread && workerData?.isWorker) {
  parentPort?.on('message', async (task: WorkerTask) => {
    const startTime = Date.now()
    const startMemory = process.memoryUsage().heapUsed

    try {
      const result = await executeWorkerTask(task)
      
      const workerResult: WorkerResult = {
        taskId: task.id,
        success: true,
        result,
        duration: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed - startMemory,
      }
      
      parentPort?.postMessage(workerResult)
    } catch (error) {
      const workerResult: WorkerResult = {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed - startMemory,
      }
      
      parentPort?.postMessage(workerResult)
    }
  })
}

/**
 * Execute task based on type
 */
async function executeWorkerTask(task: WorkerTask): Promise<any> {
  switch (task.type) {
    case 'vector_calculation':
      return await executeVectorCalculation(task.payload)
    
    case 'data_transformation':
      return await executeDataTransformation(task.payload)
    
    case 'text_analysis':
      return await executeTextAnalysis(task.payload)
    
    case 'compression':
      return await executeCompression(task.payload)
    
    default:
      throw new Error(`Unknown task type: ${task.type}`)
  }
}

/**
 * Vector calculation implementation
 */
async function executeVectorCalculation(payload: any): Promise<any> {
  const { vectors, operation } = payload
  
  switch (operation) {
    case 'cosine_similarity':
      return calculateCosineSimilarity(vectors[0], vectors[1])
    
    case 'vector_add':
      return vectorAdd(vectors[0], vectors[1])
    
    case 'normalize':
      return normalizeVector(vectors[0])
    
    default:
      throw new Error(`Unknown vector operation: ${operation}`)
  }
}

/**
 * Data transformation implementation
 */
async function executeDataTransformation(payload: any): Promise<any> {
  const { data, transformType } = payload
  
  switch (transformType) {
    case 'sort_large_dataset':
      return data.sort((a: any, b: any) => a.score - b.score)
    
    case 'filter_and_map':
      return data
        .filter((item: any) => item.isActive)
        .map((item: any) => ({ ...item, processed: true }))
    
    case 'aggregate':
      return data.reduce((acc: any, item: any) => {
        acc[item.category] = (acc[item.category] || 0) + item.value
        return acc
      }, {})
    
    default:
      throw new Error(`Unknown transform type: ${transformType}`)
  }
}

/**
 * Text analysis implementation
 */
async function executeTextAnalysis(payload: any): Promise<any> {
  const { text, analysisType } = payload
  
  switch (analysisType) {
    case 'word_count':
      return text.split(/\s+/).length
    
    case 'sentiment_basic':
      // Simple sentiment analysis based on word lists
      const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful']
      const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst']
      
      const words = text.toLowerCase().split(/\s+/)
      const positive = words.filter(word => positiveWords.includes(word)).length
      const negative = words.filter(word => negativeWords.includes(word)).length
      
      return { positive, negative, sentiment: positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral' }
    
    default:
      throw new Error(`Unknown analysis type: ${analysisType}`)
  }
}

/**
 * Compression implementation
 */
async function executeCompression(payload: any): Promise<any> {
  const { data, compressionType } = payload
  
  switch (compressionType) {
    case 'simple_rle':
      // Simple run-length encoding
      const compressed = []
      let current = data[0]
      let count = 1
      
      for (let i = 1; i < data.length; i++) {
        if (data[i] === current) {
          count++
        } else {
          compressed.push([current, count])
          current = data[i]
          count = 1
        }
      }
      compressed.push([current, count])
      
      return compressed
    
    default:
      throw new Error(`Unknown compression type: ${compressionType}`)
  }
}

/**
 * Vector utility functions
 */
function calculateCosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dotProduct / (magnitudeA * magnitudeB)
}

function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i])
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return vector.map(val => val / magnitude)
}

/**
 * Global worker pool instance
 */
let globalWorkerPool: CPUWorkerPool | null = null

/**
 * Get or create global worker pool
 */
export function getWorkerPool(): CPUWorkerPool {
  if (!globalWorkerPool) {
    globalWorkerPool = new CPUWorkerPool()
  }
  return globalWorkerPool
}

/**
 * Shutdown global worker pool
 */
export async function shutdownWorkerPool(): Promise<void> {
  if (globalWorkerPool) {
    await globalWorkerPool.shutdown()
    globalWorkerPool = null
  }
}