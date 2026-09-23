import type { PerformanceData } from './performance-data'
import { benchmarkFiles, loadPerformanceData } from './performance-data'

export declare const data: PerformanceData

export default {
  watch: Object.values(benchmarkFiles).map(file => `../../../docs/${file}`),
  load: () => loadPerformanceData(),
}
