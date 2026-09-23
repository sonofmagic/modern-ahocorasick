import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const benchmarkFiles = {
  scan: 'benchmarks-optimization.json',
  versions: 'benchmarks-versions-optimization.json',
  versionRecheck: 'benchmarks-versions-optimization-recheck.json',
  builder: 'benchmarks-builder-final.json',
  retained: 'benchmarks-retained-optimization.json',
  stream: 'benchmarks-stream-optimization.json',
  scanRecheck: 'benchmarks-optimization-recheck.json',
  builderRecheck: 'benchmarks-final-builder-recheck.json',
  presenceRecheck: 'benchmarks-presence-final-recheck.json',
} as const

export type SourceId = keyof typeof benchmarkFiles
export type Version = 'v1' | 'v2' | 'current'
export interface VersionImplementation {
  name: string
  version: string
  implementationSha256: string
}
export interface BenchmarkSource {
  file: string
  url: string
  date: string
  revision: string
  workingTreeDirty: boolean
  implementationSha256: string
  rounds: number
  environment: Record<string, string>
  baselineRef: string | null
  baselineSourceSha256: string | null
  runnerSha256: string | null
  corpusSha256: string | null
  reportSha256: string
  versions?: Record<Version, VersionImplementation>
}
export interface Timing {
  ms: number
  madMs: number | null
  betweenRoundsMadMs: number | null
}
export interface ComparisonRow {
  scenario: string
  operation: string
  source: SourceId
  before: Timing | null
  after: Timing | null
  ratio: number | null
  changePercent: number | null
}
export interface Memory {
  heapBytes: number
  arrayBufferBytes: number
}
export interface VersionMemory {
  dictionary: Memory
  nativeResults: Memory
  normalizedResults: Memory
}
export interface VersionRow {
  scenario: string
  operation: string
  source: SourceId
  rounds: number
  keywords: number
  utf16Length: number
  values: Record<Version, { timing: Timing | null, correct: boolean, comparable: boolean, ratioToV2: number | null }>
  memory: Record<Version, VersionMemory | null>
}
export interface BuilderMeasurement {
  buildMs: number
  peakRssMiB: number
  heapMiB: number
  arrayBufferMiB: number
  buildMadMs: number
  peakRssMadMiB: number
}
export interface BuilderRow {
  size: number
  source: SourceId
  before: BuilderMeasurement
  after: BuilderMeasurement
  buildChangePercent: number | null
  peakRssChangePercent: number | null
}
export interface RetainedRow {
  scenario: string
  source: SourceId
  before: Memory
  after: Memory
  heapChangePercent: number | null
}
export interface StreamRow {
  strategy: 'all' | 'leftmost-longest'
  variant: 'baseline' | 'current'
  source: SourceId
  points: { utf16Units: number, emitted: number, heapKiB: number, arrayBufferKiB: number }[]
  finalEmitted: number
  closedHeapKiB: number
  closedBufferKiB: number
}
export interface PerformanceData {
  sources: Record<SourceId, BenchmarkSource>
  scan: ComparisonRow[]
  rechecks: ComparisonRow[]
  versions: VersionRow[]
  builder: BuilderRow[]
  retained: RetainedRow[]
  stream: StreamRow[]
}

interface RawTiming {
  ms: number
  madMs?: number
  withinRoundMadMs?: number
  betweenRoundsMadMs?: number
}
interface RawReport<T> {
  startedAt: string
  revision: string
  workingTreeDirty: boolean
  implementationSha256?: string
  environment: Record<string, string>
  baselineRef?: string
  baselineSourceSha256?: string
  runnerSha256?: string
  corpusSha256?: string
  rounds: number
  results: T[]
}
interface ScanResult {
  scenario: string
  variant: 'v3-before' | 'v3'
  metrics: Record<string, RawTiming | undefined>
  dictionaryHeapBytes: number
  dictionaryBufferBytes: number
  checks: Record<string, string>
}
interface VersionResult {
  scenario: string
  variant: Version
  keywords: number
  utf16Length: number
  checks: { correct: boolean, actualDigest: string, expectedDigest: string }
  metrics: Record<string, RawTiming | undefined>
  memory: VersionMemory | null
}
interface VersionReport extends RawReport<VersionResult> {
  versions: Record<Version, VersionImplementation>
  comparisons: { scenario: string, operation: string, baseline: 'v1' | 'v2', comparable: boolean }[]
  lockfileSha256: string
  schemaVersion: number
  timingMethod: string
  recheckOf: { startedAt: string, reportSha256: string } | null
}
interface BuilderResult {
  size: number
  variant: 'baseline' | 'current'
  buildMs: number
  buildPeakRssBytes: number
  dictionaryHeapBytes: number
  dictionaryBufferBytes: number
  mad: { buildMs: number, buildPeakRssBytes: number }
}
interface StreamResult {
  strategy: StreamRow['strategy']
  variant: StreamRow['variant']
  samples: { utf16Units: number, emitted: number, heapBytes: number, arrayBufferBytes: number }[]
  closedHeapBytes: number
  closedBufferBytes: number
}
interface StreamReport extends RawReport<StreamResult> {
  rawRuns: { strategy: StreamRow['strategy'], variant: StreamRow['variant'], count: number }[]
}

const versions: Version[] = ['v1', 'v2', 'current']
const scanOperations = ['search', 'search:leftmost-first', 'search:leftmost-longest', 'count']
const versionOperations = ['normalizedSearch', 'search', 'build', 'match']
const defaultDirectory = fileURLToPath(new URL('../../../docs/', import.meta.url))

function required<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing benchmark value: ${label}`)
  }
  return value
}
function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid benchmark number: ${label}`)
  }
  return value
}
export function ratio(value: number | null, baseline: number | null): number | null {
  return value === null || baseline === null || baseline <= 0 ? null : value / baseline
}
export function changePercent(value: number | null, baseline: number | null): number | null {
  const relative = ratio(value, baseline)
  return relative === null ? null : (relative - 1) * 100
}
export function bytesToMiB(bytes: number): number {
  return finite(bytes, 'bytes') / 1024 ** 2
}
function timing(value: RawTiming | undefined): Timing | null {
  return value
    ? {
        ms: finite(value.ms, 'timing.ms'),
        madMs: value.withinRoundMadMs ?? value.madMs ?? null,
        betweenRoundsMadMs: value.betweenRoundsMadMs ?? null,
      }
    : null
}
function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
function assertSame(actual: unknown, expected: unknown, field: string): void {
  // Objects are compared by key/value rather than serialization order.
  const canonical = (value: unknown): string => JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item)
  if (canonical(actual) !== canonical(expected)) {
    throw new Error(`Incompatible benchmark recheck: ${field}`)
  }
}
function source(report: RawReport<unknown>, id: SourceId, bytes: string, implementation?: string): BenchmarkSource {
  const file = benchmarkFiles[id]
  return {
    file,
    url: `https://github.com/icelib/modern-ahocorasick/blob/main/docs/${file}`,
    date: report.startedAt,
    revision: report.revision,
    workingTreeDirty: report.workingTreeDirty,
    implementationSha256: required(implementation ?? report.implementationSha256, `${id}.implementationSha256`),
    rounds: report.rounds,
    environment: report.environment,
    baselineRef: report.baselineRef ?? null,
    baselineSourceSha256: report.baselineSourceSha256 ?? null,
    runnerSha256: report.runnerSha256 ?? null,
    corpusSha256: report.corpusSha256 ?? null,
    reportSha256: hash(bytes),
  }
}
function pairedScan(report: RawReport<ScanResult>, id: SourceId, operations?: string[]): ComparisonRow[] {
  return [...new Set(report.results.map(row => row.scenario))].flatMap((scenario) => {
    const before = required(report.results.find(row => row.scenario === scenario && row.variant === 'v3-before'), `${id}.${scenario}.before`)
    const after = required(report.results.find(row => row.scenario === scenario && row.variant === 'v3'), `${id}.${scenario}.after`)
    assertSame(after.checks, before.checks, `${id}.${scenario}.checks`)
    return (operations ?? [...new Set([...Object.keys(before.metrics), ...Object.keys(after.metrics)])]).map((operation) => {
      const beforeTiming = timing(before.metrics[operation])
      const afterTiming = timing(after.metrics[operation])
      return {
        scenario,
        operation,
        source: id,
        before: beforeTiming,
        after: afterTiming,
        ratio: ratio(afterTiming?.ms ?? null, beforeTiming?.ms ?? null),
        changePercent: changePercent(afterTiming?.ms ?? null, beforeTiming?.ms ?? null),
      }
    })
  })
}

function versionRows(base: VersionReport, recheck: VersionReport, baseBytes: string): VersionRow[] {
  // The benchmark runner hashes JSON.stringify(parsedReport), not pretty-printed bytes.
  assertSame(recheck.recheckOf?.reportSha256, hash(JSON.stringify(JSON.parse(baseBytes))), 'parent report hash')
  assertSame(recheck.recheckOf?.startedAt, base.startedAt, 'parent date')
  for (const field of ['revision', 'versions', 'environment', 'runnerSha256', 'corpusSha256', 'lockfileSha256', 'schemaVersion', 'timingMethod'] as const) {
    assertSame(recheck[field], base[field], field)
  }

  const find = (report: VersionReport, scenario: string, variant: Version) => report.results.find(row => row.scenario === scenario && row.variant === variant)
  // Check all recheck rows before choosing any of their timing groups. A partial
  // group cannot borrow its reference timing from a different set of processes.
  for (const row of recheck.results) {
    const original = required(find(base, row.scenario, row.variant), `original ${row.scenario}/${row.variant}`)
    for (const field of ['keywords', 'utf16Length', 'checks'] as const) {
      assertSame(row[field], original[field], `${row.scenario}/${row.variant}.${field}`)
    }
    for (const operation of Object.keys(row.metrics)) {
      if (!row.metrics[operation]) {
        continue
      }
      for (const variant of versions) {
        required(find(recheck, row.scenario, variant)?.metrics[operation], `complete recheck ${row.scenario}/${operation}/${variant}`)
      }
    }
  }

  return [...new Set(base.results.map(row => row.scenario))].flatMap(scenario => versionOperations.map((operation) => {
    const original = Object.fromEntries(versions.map(variant => [variant, required(find(base, scenario, variant), `${scenario}/${variant}`)])) as Record<Version, VersionResult>
    const useRecheck = versions.some(variant => find(recheck, scenario, variant)?.metrics[operation] !== undefined)
    const selected = useRecheck ? recheck : base
    const values = Object.fromEntries(versions.map((variant) => {
      const row = required(find(selected, scenario, variant), `${scenario}/${variant}`)
      const reference = required(find(selected, scenario, 'v2'), `${scenario}/v2`)
      const comparison = selected.comparisons.find(entry => entry.scenario === scenario && entry.operation === operation && entry.baseline === (variant === 'v1' ? 'v1' : 'v2'))
      const comparable = row.checks.correct && reference.checks.correct && comparison?.comparable !== false
      return [variant, {
        timing: timing(row.metrics[operation]),
        correct: row.checks.correct,
        comparable,
        ratioToV2: comparable
          ? ratio(row.metrics[operation]?.ms ?? null, reference.metrics[operation]?.ms ?? null)
          : null,
      }]
    })) as VersionRow['values']
    return {
      scenario,
      operation,
      source: useRecheck ? 'versionRecheck' as const : 'versions' as const,
      rounds: selected.rounds,
      keywords: original.current.keywords,
      utf16Length: original.current.utf16Length,
      values,
      // Targeted rechecks intentionally omit memory measurements.
      memory: Object.fromEntries(versions.map(variant => [variant, original[variant].memory])) as VersionRow['memory'],
    }
  }))
}

export function extractPerformanceData(bytes: Record<SourceId, string>): PerformanceData {
  const parse = <T>(id: SourceId): T => JSON.parse(bytes[id]) as T
  const scan = parse<RawReport<ScanResult>>('scan')
  const baseVersions = parse<VersionReport>('versions')
  const versionRecheck = parse<VersionReport>('versionRecheck')
  const builder = parse<RawReport<BuilderResult>>('builder')
  const retained = parse<RawReport<ScanResult>>('retained')
  const stream = parse<StreamReport>('stream')
  const sources = Object.fromEntries((Object.keys(benchmarkFiles) as SourceId[]).map((id) => {
    const report = parse<RawReport<unknown>>(id)
    const implementation = id === 'versions' || id === 'versionRecheck' ? baseVersions.versions.current.implementationSha256 : undefined
    const metadata = source(report, id, bytes[id], implementation)
    if (id === 'versions' || id === 'versionRecheck') {
      metadata.versions = parse<VersionReport>(id).versions
    }
    return [id, metadata]
  })) as PerformanceData['sources']
  const measurement = (row: BuilderResult): BuilderMeasurement => ({
    buildMs: finite(row.buildMs, 'buildMs'),
    peakRssMiB: bytesToMiB(row.buildPeakRssBytes),
    heapMiB: bytesToMiB(row.dictionaryHeapBytes),
    arrayBufferMiB: bytesToMiB(row.dictionaryBufferBytes),
    buildMadMs: finite(row.mad.buildMs, 'build MAD'),
    peakRssMadMiB: bytesToMiB(row.mad.buildPeakRssBytes),
  })
  const dictionary = (row: ScanResult): Memory => ({ heapBytes: finite(row.dictionaryHeapBytes, 'dictionary heap'), arrayBufferBytes: finite(row.dictionaryBufferBytes, 'dictionary buffers') })
  return {
    sources,
    scan: pairedScan(scan, 'scan', scanOperations),
    rechecks: (['scanRecheck', 'builderRecheck', 'presenceRecheck'] as const).flatMap(id => pairedScan(parse<RawReport<ScanResult>>(id), id)),
    versions: versionRows(baseVersions, versionRecheck, bytes.versions),
    builder: [...new Set(builder.results.map(row => row.size))].map((size) => {
      const before = measurement(required(builder.results.find(row => row.size === size && row.variant === 'baseline'), `${size}.before`))
      const after = measurement(required(builder.results.find(row => row.size === size && row.variant === 'current'), `${size}.after`))
      return { size, source: 'builder', before, after, buildChangePercent: changePercent(after.buildMs, before.buildMs), peakRssChangePercent: changePercent(after.peakRssMiB, before.peakRssMiB) }
    }),
    retained: [...new Set(retained.results.map(row => row.scenario))].map((scenario) => {
      const before = dictionary(required(retained.results.find(row => row.scenario === scenario && row.variant === 'v3-before'), `${scenario}.before`))
      const after = dictionary(required(retained.results.find(row => row.scenario === scenario && row.variant === 'v3'), `${scenario}.after`))
      return { scenario, source: 'retained', before, after, heapChangePercent: changePercent(after.heapBytes, before.heapBytes) }
    }),
    stream: stream.results.map((row) => {
      const counts = stream.rawRuns.filter(run => run.strategy === row.strategy && run.variant === row.variant).map(run => run.count)
      const finalEmitted = required(counts[0], `${row.strategy}/${row.variant}.count`)
      if (!counts.every(count => count === finalEmitted)) {
        throw new Error(`Inconsistent stream output: ${row.strategy}/${row.variant}`)
      }
      return {
        strategy: row.strategy,
        variant: row.variant,
        source: 'stream',
        points: row.samples.map(point => ({ utf16Units: point.utf16Units, emitted: point.emitted, heapKiB: finite(point.heapBytes, 'stream heap') / 1024, arrayBufferKiB: finite(point.arrayBufferBytes, 'stream buffers') / 1024 })),
        finalEmitted,
        closedHeapKiB: finite(row.closedHeapBytes, 'closed heap') / 1024,
        closedBufferKiB: finite(row.closedBufferBytes, 'closed buffers') / 1024,
      }
    }),
  }
}

export function loadPerformanceData(directory: string = defaultDirectory): PerformanceData {
  const bytes = Object.fromEntries((Object.entries(benchmarkFiles) as [SourceId, string][]).map(([id, file]) => [id, readFileSync(resolve(directory, file), 'utf8')])) as Record<SourceId, string>
  return extractPerformanceData(bytes)
}
