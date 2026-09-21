import type { ExperimentInputs, WorkerResult } from './experiment'
import { Experiment } from './experiment'

const experiment = new Experiment()
globalThis.onmessage = (event: MessageEvent<ExperimentInputs>) => {
  let response: WorkerResult
  try {
    response = { result: experiment.run(event.data) }
  }
  catch (error) {
    response = { error: error instanceof RangeError ? 'limit' : 'error' }
  }
  globalThis.postMessage(response)
}
