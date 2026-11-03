import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { trend } from '../data/mock'

export default function MonitorChart() {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const chart = echarts.init(host)
    const option = {
      backgroundColor: 'transparent',
      animationDuration: 900,
      color: trend.series.map((item) => item.color),
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(6, 18, 34, 0.94)',
        borderColor: 'rgba(56, 214, 255, 0.35)',
        textStyle: { color: '#d8e8ff', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(56, 214, 255, 0.28)' } },
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 4,
        icon: 'roundRect',
        textStyle: { color: '#7f9cbd', fontSize: 11 },
      },
      grid: { top: 42, left: 12, right: 16, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.times,
        axisLine: { lineStyle: { color: 'rgba(80, 130, 180, 0.25)' } },
        axisTick: { show: false },
        axisLabel: { color: '#6f8bb3', fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: 'value',
        name: 'με',
        nameTextStyle: { color: '#6f8bb3', fontSize: 10, padding: [0, 0, 4, 0] },
        axisLabel: { color: '#6f8bb3', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(80, 130, 180, 0.12)', type: 'dashed' } },
      },
      series: trend.series.map((item, index) => ({
        name: item.name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: item.data,
        lineStyle: { width: 2, color: item.color },
        itemStyle: { color: item.color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${item.color}55` },
            { offset: 1, color: `${item.color}00` },
          ]),
        },
        emphasis: { focus: 'series' },
        markLine: index === 1
          ? {
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
            }
          : undefined,
      })),
    }

    chart.setOption(option)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)

    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [])

  return <div className="chart-canvas" ref={hostRef} />
}
