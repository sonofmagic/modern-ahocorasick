export interface FilterPart {
  text: string
  protected: boolean
}
export interface FilterSession {
  write: (chunk: string, final?: boolean) => FilterPart[]
  destroy: () => void
}
export interface StreamFilter {
  /** Each stream receives a fresh parser, including when a filter is reused. */
  create: () => FilterSession
}
export interface MarkdownOptions {
  heading?: boolean
  code?: boolean
}
export interface FilterOptions {
  urls?: boolean
  markdown?: boolean | MarkdownOptions
}
/** A deliberately small streaming syntax profile, not a CommonMark parser. */
export function protectedText(options: FilterOptions = {}): StreamFilter {
  if (!options || typeof options !== 'object') {
    throw new TypeError('filter options must be an object')
  }
  const enableUrls = options.urls === true
  const markdown = options.markdown
  const heading = !!markdown && (typeof markdown === 'boolean' || markdown.heading !== false)
  const code = !!markdown && (typeof markdown === 'boolean' || markdown.code !== false)
  return {
    create() {
      let pending = ''
      let lineStart = true
      let mode: 'text' | 'url' | 'heading' | 'fence' = 'text'
      let fence = ''
      let fenceSize = 0
      let inlineSearch = 0
      return {
        write(chunk, final = false) {
          pending += chunk
          const parts: FilterPart[] = []
          let position = 0
          function emit(length: number, protect: boolean) {
            if (length === 0) {
              return
            }
            const text = pending.slice(position, position + length)
            const previous = parts.at(-1)
            if (previous?.protected === protect) {
              previous.text += text
            }
            else {
              parts.push({ text, protected: protect })
            }
            lineStart = text.endsWith('\n')
            position += length
            inlineSearch = 0
          }
          while (position < pending.length) {
            const rest = pending.slice(position)
            if (mode === 'url') {
              const stop = rest.search(/\s/u)
              emit(stop === -1 ? rest.length : stop, true)
              if (stop === -1) {
                break
              }
              mode = 'text'
              continue
            }
            if (mode === 'heading') {
              const stop = rest.indexOf('\n')
              emit(stop === -1 ? rest.length : stop + 1, true)
              if (stop === -1) {
                break
              }
              mode = 'text'
              continue
            }
            if (mode === 'fence') {
              if (lineStart && rest.startsWith(fence)) {
                const newline = rest.indexOf('\n')
                if (newline === -1 && !final && new RegExp(`^${fence}+[^\\S\\n]*$`).test(rest)) {
                  break
                }
                const line = newline === -1 ? rest : rest.slice(0, newline)
                const delimiter = line.match(new RegExp(`^${fence}{${fenceSize},}[ \\t\\r]*$`))
                if (delimiter) {
                  emit(line.length + (newline === -1 ? 0 : 1), true)
                  mode = 'text'
                  continue
                }
              }
              const newline = rest.indexOf('\n')
              emit(newline === -1 ? rest.length : newline + 1, true)
              continue
            }
            if (enableUrls && /^h/i.test(rest)) {
              const lower = rest.toLowerCase()
              if (!final && ('http://'.startsWith(lower) || 'https://'.startsWith(lower))) {
                break
              }
              const scheme = rest.match(/^https?:\/\//i)
              if (scheme) {
                emit(scheme[0].length, true)
                mode = 'url'
                continue
              }
            }
            if (heading && lineStart && rest.startsWith('#')) {
              if (!final && /^#{1,6}$/.test(rest)) {
                break
              }
              const prefix = rest.match(/^#{1,6}(?:[ \t]|$)/)
              if (prefix) {
                emit(prefix[0].length, true)
                mode = 'heading'
                continue
              }
            }
            if (code && (rest.startsWith('`') || (lineStart && rest.startsWith('~')))) {
              const marker = rest[0]
              let length = 1
              while (rest[length] === marker) {
                length++
              }
              if (length === rest.length && !final) {
                break
              }
              if (lineStart && length >= 3) {
                fence = marker
                fenceSize = length
                emit(length, true)
                mode = 'fence'
                continue
              }
              if (marker === '`') {
                let search = Math.max(length, inlineSearch)
                let closing = -1
                while (search < rest.length) {
                  const start = rest.indexOf('`', search)
                  if (start === -1) {
                    search = rest.length
                    break
                  }
                  let end = start + 1
                  while (rest[end] === '`') {
                    end++
                  }
                  if (end === rest.length && !final) {
                    search = start
                    break
                  }
                  if (end - start === length) {
                    closing = end
                    break
                  }
                  search = end
                }
                if (closing !== -1) {
                  emit(closing, true)
                  continue
                }
                if (!final) {
                  inlineSearch = search
                  break
                }
                // An unclosed inline delimiter is literal; continue parsing its body.
                emit(length, false)
                continue
              }
            }
            emit(1, false)
          }
          pending = pending.slice(position)
          return parts
        },
        destroy() {
          pending = ''
          inlineSearch = 0
        },
      }
    },
  }
}
export function urls(): StreamFilter {
  return protectedText({ urls: true })
}
export function markdown(options: MarkdownOptions = {}): StreamFilter {
  return protectedText({ markdown: { ...options } })
}
