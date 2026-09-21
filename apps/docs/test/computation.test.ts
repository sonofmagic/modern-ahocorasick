import type { ComputeWorker } from '../src/computation'
import type { WorkerResult } from '../src/experiment'
import { Computation } from '../src/computation'
import { experimentDefaults } from '../src/experiment'
import { defaults } from '../src/storage'

const input = { ...defaults, ...experimentDefaults }
function setup() {
  const workers: ComputeWorker[] = []
  const create = vi.fn(() => {
    const worker: ComputeWorker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    }
    workers.push(worker)
    return worker
  })
  const receive = vi.fn()
  return {
    workers,
    create,
    receive,
    computation: new Computation(create, receive),
  }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('debounces multi-field edits and retains an idle worker for dictionary reuse', () => {
  const { computation, create, workers, receive } = setup()
  computation.schedule(input)
  computation.schedule({ ...input, text: 'she' })
  vi.advanceTimersByTime(119)
  expect(create).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(create).toHaveBeenCalledTimes(1)
  expect(workers[0].postMessage).toHaveBeenCalledExactlyOnceWith({
    ...input,
    text: 'she',
  })
  workers[0].onmessage!({
    data: { error: 'limit' },
  } as MessageEvent<WorkerResult>)
  expect(receive).toHaveBeenCalledTimes(1)
  computation.schedule(input)
  vi.advanceTimersByTime(120)
  expect(create).toHaveBeenCalledTimes(1)
  computation.dispose()
  expect(workers[0].terminate).toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('terminates in-flight work, ignores late responses and disposes pending timers', () => {
  const { computation, workers, receive } = setup()
  computation.schedule(input, 0)
  vi.runOnlyPendingTimers()
  const stale = workers[0].onmessage!
  computation.schedule({ ...input, text: 'new' })
  expect(workers[0].terminate).toHaveBeenCalledTimes(1)
  stale({ data: { error: 'limit' } } as MessageEvent<WorkerResult>)
  expect(receive).not.toHaveBeenCalled()
  computation.dispose()
  vi.runAllTimers()
  expect(workers).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('recovers from worker startup and runtime failures', () => {
  const receive = vi.fn()
  const failing = new Computation(() => {
    throw new Error('worker unavailable')
  }, receive)
  failing.schedule(input, 0)
  vi.runOnlyPendingTimers()
  expect(receive).toHaveBeenCalledWith({ error: 'error' })
  failing.dispose()
  const { computation, workers, create } = setup()
  computation.schedule(input, 0)
  vi.runOnlyPendingTimers()
  const preventDefault = vi.fn()
  workers[0].onerror!({ preventDefault } as unknown as ErrorEvent)
  expect(preventDefault).toHaveBeenCalled()
  expect(workers[0].terminate).toHaveBeenCalled()
  computation.schedule(input, 0)
  vi.runOnlyPendingTimers()
  expect(create).toHaveBeenCalledTimes(2)
  computation.dispose()
})
