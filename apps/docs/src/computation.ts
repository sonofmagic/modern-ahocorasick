import type { ExperimentInputs, WorkerResult } from './experiment'

export interface ComputeWorker {
  onmessage: ((event: MessageEvent<WorkerResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage: (input: ExperimentInputs) => void
  terminate: () => void
}

/** Debounce edits; terminate in-flight work so stale results cannot overwrite input. */
export class Computation {
  private worker: ComputeWorker | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private busy = false
  private generation = 0
  constructor(
    private readonly create: () => ComputeWorker,
    private readonly receive: (result: WorkerResult) => void,
  ) {}

  schedule(input: ExperimentInputs, delay = 120): void {
    this.cancel()
    const generation = this.generation
    this.timer = setTimeout(() => {
      this.timer = undefined
      try {
        this.worker ??= this.create()
        this.busy = true
        this.worker.onmessage = (event) => {
          if (generation !== this.generation) {
            return
          }
          this.busy = false
          this.receive(event.data)
        }
        this.worker.onerror = (event) => {
          event.preventDefault()
          if (generation !== this.generation) {
            return
          }
          this.cancel()
          this.receive({ error: 'error' })
        }
        this.worker.postMessage(input)
      }
      catch {
        this.cancel()
        this.receive({ error: 'error' })
      }
    }, delay)
  }

  cancel(): void {
    this.generation++
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.busy) {
      this.worker?.terminate()
      this.worker = undefined
    }
    this.busy = false
  }

  dispose(): void {
    this.cancel()
    this.worker?.terminate()
    this.worker = undefined
  }
}
