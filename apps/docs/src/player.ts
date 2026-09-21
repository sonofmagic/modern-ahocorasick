/** One cancellable timeout; view state lives outside the scheduler. */
export class Player {
  #timer: ReturnType<typeof setTimeout> | undefined
  #running = false
  #delay = 500
  constructor(
    private readonly advance: () => boolean,
    private readonly changed: (running: boolean) => void,
  ) {}

  get running(): boolean {
    return this.#running
  }

  play(): void {
    if (this.#running) {
      return
    }
    this.#running = true
    this.changed(true)
    this.#schedule()
  }

  pause(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer)
    }
    this.#timer = undefined
    this.#running = false
    this.changed(false)
  }

  step(): void {
    this.pause()
    this.advance()
  }

  setDelay(delay: number): void {
    this.#delay = Math.max(20, delay)
    if (this.#running) {
      if (this.#timer !== undefined) {
        clearTimeout(this.#timer)
      }
      this.#schedule()
    }
  }

  dispose(): void {
    this.pause()
  }

  #schedule(): void {
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      if (!this.advance()) {
        this.pause()
      }
      else if (this.#running) {
        this.#schedule()
      }
    }, this.#delay)
  }
}
