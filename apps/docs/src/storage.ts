export const storageKey = 'modern-ahocorasick:workbench:v3'
export interface Inputs {
  keywords: string
  text: string
  speed: number
}
export const defaults: Inputs = {
  keywords: 'he,she,his,hers',
  text: 'ushers',
  speed: 2,
}

export function restore(storage: Pick<Storage, 'getItem'>): Inputs {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? 'null')
    if (
      value
      && typeof value.keywords === 'string'
      && typeof value.text === 'string'
      && typeof value.speed === 'number'
      && value.speed >= 0.5
      && value.speed <= 10
    ) {
      return value
    }
  }
  catch {
    /* Storage may be blocked or contain an old payload. */
  }
  return { ...defaults }
}

export function persist(
  storage: Pick<Storage, 'setItem'>,
  value: Inputs,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(value))
  }
  catch {
    /* The workbench remains usable without storage. */
  }
}
