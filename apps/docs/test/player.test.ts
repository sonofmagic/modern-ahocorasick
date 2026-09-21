import { Player } from '../src/player'
import { defaults, persist, restore, storageKey } from '../src/storage'

afterEach(() => vi.useRealTimers())

it('pauses, resumes, steps once and cancels its only timer', () => {
  vi.useFakeTimers()
  let progress = 0
  const change = vi.fn()
  const player = new Player(() => ++progress < 3, change)
  player.play()
  player.play()
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(500)
  expect(progress).toBe(1)
  player.pause()
  vi.advanceTimersByTime(5000)
  expect(progress).toBe(1)
  player.step()
  expect(progress).toBe(2)
  expect(vi.getTimerCount()).toBe(0)
  player.play()
  vi.advanceTimersByTime(500)
  expect(progress).toBe(3)
  expect(player.running).toBe(false)
  expect(change).toHaveBeenLastCalledWith(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('changes speed without changing progress and disposes pending callbacks', () => {
  vi.useFakeTimers()
  const advance = vi.fn(() => true)
  const player = new Player(advance, () => {})
  player.play()
  vi.advanceTimersByTime(400)
  player.setDelay(200)
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(199)
  expect(advance).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(advance).toHaveBeenCalledTimes(1)
  player.dispose()
  vi.advanceTimersByTime(5000)
  expect(advance).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('restores only valid namespaced session data and tolerates blocked storage', () => {
  const value = { keywords: ' a,a ', text: ' x\n ', speed: 4 }
  const setItem = vi.fn()
  persist({ setItem }, value)
  expect(setItem).toHaveBeenCalledWith(storageKey, JSON.stringify(value))
  expect(restore({ getItem: () => JSON.stringify(value) })).toEqual(value)
  for (const stored of [
    'null',
    '{',
    '{"speed":0}',
    JSON.stringify({ ...value, speed: '2' }),
    JSON.stringify({ ...value, speed: 11 }),
  ]) {
    expect(restore({ getItem: () => stored })).toEqual(defaults)
  }
  expect(
    restore({
      getItem: () => {
        throw new Error('denied')
      },
    }),
  ).toEqual(defaults)
  expect(() =>
    persist(
      {
        setItem: () => {
          throw new Error('denied')
        },
      },
      value,
    ),
  ).not.toThrow()
})
