import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { RunChartData } from '@/types/run';
import { getChartPointCount, isValidRunChartData } from '@/utils/chartData';

interface RunChartProps {
  chartData: RunChartData;
  height?: number;
}

export function RunChart({ chartData, height = 200 }: RunChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  const option = useMemo<EChartsOption>(() => {
    const pointCount = getChartPointCount(chartData);
    const labels = chartData.labels.slice(0, pointCount);

    return {
      grid: {
        left: 36,
        right: 16,
        top: chartData.series.length > 1 ? 42 : 28,
        bottom: 30,
      },
      tooltip: {
        trigger: 'axis',
      },
      legend: chartData.series.length > 1
        ? {
            top: 0,
            right: 0,
            type: 'scroll',
            textStyle: {
              color: '#64748b',
              fontSize: 11,
            },
          }
        : undefined,
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#64748b' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: chartData.series.map((series, index) => ({
        name: series.name,
        type: chartData.chartType,
        data: series.values.slice(0, pointCount),
        smooth: chartData.chartType === 'line',
        barMaxWidth: 28,
        itemStyle: {
          color: index === 0 ? '#2563eb' : '#14b8a6',
          borderRadius: chartData.chartType === 'bar' ? [6, 6, 0, 0] : 0,
        },
        lineStyle: {
          width: 2,
        },
        symbolSize: 6,
      })),
    };
  }, [chartData]);

  useEffect(() => {
    const element = chartRef.current;

    if (!element || !isValidRunChartData(chartData)) {
      return;
    }

    const chart = echarts.init(element);
    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;

    resizeObserver?.observe(element);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [chartData, option]);

  return (
    <div
      ref={chartRef}
      className="run-chart-container"
      style={{ height }}
      aria-label={chartData.title}
    />
  );
}
