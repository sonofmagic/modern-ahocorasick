import type { SourceId } from '../src/performance-data'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { benchmarkFiles, bytesToMiB, changePercent, extractPerformanceData, loadPerformanceData, ratio } from '../src/performance-data'

const bytes = Object.fromEntries(Object.entries(benchmarkFiles).map(([id, file]) => [id, readFileSync(new URL(`../../../docs/${file}`, import.meta.url), 'utf8')])) as Record<SourceId, string>
const data = loadPerformanceData()

function changed(id: SourceId, edit: (report: any) => void): Record<SourceId, string> {
  const report = JSON.parse(bytes[id])
  edit(report)
  return { ...bytes, [id]: JSON.stringify(report) }
}

describe('performance documentation data', () => {
  it('extracts all measured scenarios without sending raw runs to the client', () => {
    expect(data.scan).toHaveLength(18 * 4)
    expect(data.versions).toHaveLength(14 * 4)
    expect(data.retained).toHaveLength(18)
    expect(data.builder.map(row => row.size)).toEqual([10000, 100000, 1000000])
    expect(data.stream).toHaveLength(4)
    expect(JSON.stringify(data)).not.toMatch(/roundMediansMs|rawRuns|memoryRuns/)
    expect(data.sources.versions.versions?.v1.version).toBe('1.1.0')
    expect(data.sources.versions.versions?.v2.version).toBe('2.0.4')
    expect(data.sources.scan.reportSha256).toBe(createHash('sha256').update(bytes.scan).digest('hex'))
  })

  it('uses explicit binary memory units and lower-is-better time ratios', () => {
    expect(bytesToMiB(1048576)).toBe(1)
    expect(ratio(5, 10)).toBe(0.5)
    expect(changePercent(5, 10)).toBe(-50)
    expect(changePercent(11, 10)).toBeCloseTo(10)
    expect(ratio(null, 10)).toBeNull()
    expect(ratio(10, 0)).toBeNull()
    const million = data.builder.find(row => row.size === 1000000)!
    expect(million.before.peakRssMiB).toBe(2300.21875)
    expect(million.after.peakRssMiB).toBe(660.15625)
    expect(million.peakRssChangePercent).toBeCloseTo(-71.300284, 4)
    const stream = data.stream.find(row => row.strategy === 'leftmost-longest' && row.variant === 'current')!
    expect(stream.points.at(-1)).toEqual({ utf16Units: 400000, emitted: 79997, heapKiB: 271.09375, arrayBufferKiB: 0 })
    expect(stream.finalEmitted).toBe(80000)
  })

  it('excludes incorrect v1 Unicode results from every performance ratio', () => {
    for (const scenario of ['emoji', 'zwj', 'combining', 'crlf']) {
      for (const row of data.versions.filter(row => row.scenario === scenario)) {
        expect(row.values.v1.correct).toBe(false)
        expect(row.values.v1.ratioToV2).toBeNull()
        expect(row.values.v1.timing).not.toBeNull()
        expect(row.values.v2.ratioToV2).toBe(1)
        expect(row.values.current.ratioToV2).not.toBeNull()
      }
    }
  })

  it('overlays only complete measured scenario/operation groups and retains original memory', () => {
    const original = JSON.parse(bytes.versions)
    const recheck = JSON.parse(bytes.versionRecheck)
    expect(data.versions.filter(row => row.source === 'versionRecheck')).toHaveLength(24)
    for (const row of data.versions) {
      const expectedSource = row.source === 'versionRecheck' ? recheck : original
      for (const variant of ['v1', 'v2', 'current'] as const) {
        expect(row.values[variant].timing?.ms).toBe(expectedSource.results.find((result: any) => result.scenario === row.scenario && result.variant === variant).metrics[row.operation].ms)
        expect(row.memory[variant]).toEqual(original.results.find((result: any) => result.scenario === row.scenario && result.variant === variant).memory)
      }
      expect(row.rounds).toBe(row.source === 'versionRecheck' ? 7 : 5)
    }
    // Top-level operations still list normalizedSearch, but ordinary did not rerun it.
    expect(data.versions.find(row => row.scenario === 'ordinary' && row.operation === 'normalizedSearch')?.source).toBe('versions')
    expect(data.versions.find(row => row.scenario === 'ordinary' && row.operation === 'build')?.source).toBe('versionRecheck')
  })

  it.each([
    ['parent report hash', (report: any) => { report.recheckOf.reportSha256 = 'wrong' }],
    ['revision', (report: any) => { report.revision = 'different-source' }],
    ['versions', (report: any) => { report.versions.current.implementationSha256 = 'wrong' }],
    ['environment', (report: any) => { report.environment.node = 'v26.0.0' }],
    ['runnerSha256', (report: any) => { report.runnerSha256 = 'wrong' }],
    ['corpusSha256', (report: any) => { report.corpusSha256 = 'wrong' }],
    ['timingMethod', (report: any) => { report.timingMethod = 'different warmup' }],
  ])('rejects an incompatible recheck: %s', (field, edit) => {
    expect(() => extractPerformanceData(changed('versionRecheck', edit))).toThrow(`Incompatible benchmark recheck: ${field}`)
  })

  it('honors explicit noncomparability even when result checks pass', () => {
    const filtered = extractPerformanceData(changed('versionRecheck', (report) => {
      report.comparisons.find((row: any) => row.scenario === 'ordinary' && row.operation === 'build' && row.baseline === 'v1').comparable = false
    }))
    const row = filtered.versions.find(row => row.scenario === 'ordinary' && row.operation === 'build')!
    expect(row.values.v1.correct).toBe(true)
    expect(row.values.v1.comparable).toBe(false)
    expect(row.values.v1.ratioToV2).toBeNull()
    expect(row.values.current.ratioToV2).not.toBeNull()
  })

  it('rejects partial recheck groups rather than mixing rounds', () => {
    expect(() => extractPerformanceData(changed('versionRecheck', (report) => {
      delete report.results.find((row: any) => row.scenario === 'ordinary' && row.variant === 'v2').metrics.build
    }))).toThrow('complete recheck ordinary/build/v2')
  })

  it('keeps later scanner rechecks separate from the original scanner snapshot', () => {
    const final = data.rechecks.find(row => row.source === 'builderRecheck' && row.scenario === 'ordinary' && row.operation === 'build')!
    expect(final.changePercent).toBeGreaterThan(5)
    expect(data.sources[final.source].implementationSha256).not.toBe(data.sources.scan.implementationSha256)
    expect(data.scan.every(row => row.source === 'scan')).toBe(true)
    expect(new Set(data.rechecks.map(row => row.source))).toEqual(new Set(['scanRecheck', 'builderRecheck', 'presenceRecheck']))
  })

  it('keeps missing measurements distinct from zero and rejects invalid data', () => {
    const partial = extractPerformanceData(changed('scan', (report) => {
      delete report.results.find((row: any) => row.variant === 'v3').metrics.search
    }))
    expect(partial.scan[0].after).toBeNull()
    expect(partial.scan[0].ratio).toBeNull()
    expect(() => extractPerformanceData(changed('builder', (report) => {
      report.results[0].buildMs = 'bad'
    }))).toThrow('Invalid benchmark number')
    expect(() => extractPerformanceData(changed('stream', (report) => {
      report.rawRuns[0].count += 1
    }))).toThrow('Inconsistent stream output')
  })
})
