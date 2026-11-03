import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { timeLabels } from '../data/mock'

export default function MonitorChart({ sensor }) {
  const hostRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const chart = echarts.init(host)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !sensor) return
    const color = sensor.status === 'warning' ? '#ffb547' : '#38d6ff'

    chart.setOption({
      backgroundColor: 'transparent',
      animationDuration: 700,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(6, 18, 34, 0.94)',
        borderColor: 'rgba(56, 214, 255, 0.35)',
        textStyle: { color: '#d8e8ff', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(56, 214, 255, 0.28)' } },
      },
      grid: { top: 18, left: 10, right: 16, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timeLabels,
        axisLine: { lineStyle: { color: 'rgba(80, 130, 180, 0.25)' } },
        axisTick: { show: false },
        axisLabel: { color: '#6f8bb3', fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: 'value',
        min: -6,
        max: 6,
        name: 'με',
        nameTextStyle: { color: '#6f8bb3', fontSize: 10, padding: [0, 0, 4, 0] },
        axisLabel: { color: '#6f8bb3', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(80, 130, 180, 0.12)', type: 'dashed' } },
      },
      series: [
        {
          name: `${sensor.id} 应变`,
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sensor.history,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `${color}55` },
              { offset: 1, color: `${color}00` },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ffb547', type: 'dashed', width: 1, opacity: 0.7 },
            label: {
              formatter: '阈值 5.0',
              color: '#ffb547',
              fontSize: 10,
              position: 'insideEndTop',
            },
            data: [{ yAxis: 5 }],
          },
        },
      ],
    }, { notMerge: true })
  }, [sensor])

  return <div className="chart-canvas" ref={hostRef} />
}
