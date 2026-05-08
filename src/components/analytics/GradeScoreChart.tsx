import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { AnalyticsResult } from '../../types/workbench';

interface GradeScoreChartProps {
  data: AnalyticsResult['gradeScores'];
}

export function GradeScoreChart({ data }: GradeScoreChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);

    chart.setOption({
      grid: {
        left: 28,
        right: 12,
        top: 24,
        bottom: 28,
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: data.map((item) => item.grade),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280' },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#9ca3af' },
      },
      series: [
        {
          name: '本月平均分',
          type: 'bar',
          data: data.map((item) => item.value),
          barWidth: 24,
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [6, 6, 0, 0],
          },
        },
      ],
    });

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data]);

  return <div className="grade-chart" ref={chartRef} />;
}
