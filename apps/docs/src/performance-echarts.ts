import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, SVGRenderer])

export { init }
