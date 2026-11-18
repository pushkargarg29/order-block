'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type MouseEventParams,
  type ISeriesApi,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts';
import type { Analysis, Candle, OptionWalls } from '@/lib/types';
import { fmtIST } from '@/lib/time';

type Props = { candles: Candle[]; a: Analysis | null; showFvg: boolean; showEma: boolean; showPlan: boolean; daily: boolean; walls?: OptionWalls | null; showWalls?: boolean; initialCount?: number; interactive?: boolean; height?: number; compact?: boolean };
type ChartData = Pick<Props, 'candles' | 'a' | 'showFvg' | 'showEma' | 'showPlan' | 'daily' | 'walls' | 'showWalls' | 'compact'>;

const utcTime = (timestamp: number): UTCTimestamp => Math.floor(timestamp / 1000) as UTCTimestamp;

function drawOverlays(canvas: HTMLCanvasElement, chart: IChartApi, series: ISeriesApi<'Candlestick'>, data: ChartData) {
  const pane = chart.paneSize();
  if (!pane.width || !pane.height) return;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(pane.width * dpr);
  const pixelHeight = Math.round(pane.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${pane.width}px`;
  canvas.style.height = `${pane.height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, pane.width, pane.height);
  if (!data.a || !data.candles.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pane.width, pane.height);
  ctx.clip();

  const timeScale = chart.timeScale();
  const xAt = (time: number) => timeScale.timeToCoordinate(utcTime(time));
  const yAt = (price: number) => series.priceToCoordinate(price);
  const index = new Map(data.candles.map((candle, i) => [candle.t, i]));

  for (const zone of (data.compact ? (data.a.activeZone ? [data.a.activeZone] : []) : data.a.zones)) {
    const start = index.get(zone.startT);
    if (start == null) continue;
    const startX = xAt(zone.startT);
    if (startX == null) continue;
    const end = zone.endT == null ? pane.width : xAt(zone.endT) ?? pane.width;
    const top = yAt(zone.top), bottom = yAt(zone.bottom);
    if (top == null || bottom == null) continue;
    const left = Math.max(0, Math.min(startX, end));
    const right = Math.min(pane.width, Math.max(startX, end));
    if (right <= left) continue;

    const bull = zone.side === 'bull';
    const alpha = zone.invalidated ? 0.06 : 0.12 + zone.strength * 0.18;
    ctx.fillStyle = bull ? `rgba(56,189,248,${alpha})` : `rgba(248,113,113,${alpha})`;
    ctx.fillRect(left, Math.min(top, bottom), right - left, Math.abs(bottom - top));
    ctx.strokeStyle = zone.invalidated ? 'rgba(91,111,148,.5)' : bull ? '#38bdf8' : '#f87171';
    ctx.setLineDash(zone.invalidated ? [3, 3] : []);
    ctx.strokeRect(left, Math.min(top, bottom), right - left, Math.abs(bottom - top));
    ctx.setLineDash([]);
    if (!data.compact && !zone.invalidated && top >= 0 && top <= pane.height) {
      ctx.fillStyle = bull ? '#7dd3fc' : '#fca5a5';
      ctx.font = 'bold 11px Arial,sans-serif';
      ctx.fillText(`${bull ? 'Bull' : 'Bear'} OB ${zone.bottom.toFixed(2)}–${zone.top.toFixed(2)} · ${(zone.strength * 100).toFixed(0)}%`, left + 4, bull ? bottom + 13 : top - 5);
    }
  }

  if (data.showFvg) {
    for (const fvg of data.a.fvgs) {
      const start = index.get(fvg.t);
      if (start == null || start >= data.candles.length) continue;
      const x = xAt(fvg.t), top = yAt(fvg.top), bottom = yAt(fvg.bottom);
      if (x == null || top == null || bottom == null) continue;
      ctx.fillStyle = fvg.side === 'bull' ? 'rgba(59,130,246,.10)' : 'rgba(251,146,60,.10)';
      ctx.fillRect(Math.max(0, x), Math.min(top, bottom), pane.width - Math.max(0, x), Math.abs(bottom - top));
    }
  }

  const hline = (price: number | null, color: string, title: string, dash: number[]) => {
    if (price == null) return;
    const y = yAt(price);
    if (y == null || y < 0 || y > pane.height) return;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(pane.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    if (!data.compact) {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px Arial,sans-serif';
      ctx.fillText(`${title} ${price.toFixed(2)}`, 6, y - 4);
    }
  };

  if (!data.compact) {
    hline(data.a.resistance, '#b4c3df', 'Resistance', [5, 5]);
    hline(data.a.support, '#b4c3df', 'Support', [5, 5]);
    for (const level of data.a.liquidity) {
      hline(level.price, 'rgba(251,191,36,.65)', `${level.side === 'buy' ? 'BSL' : 'SSL'}${level.count > 1 ? ` ×${level.count}` : ''}`, [2, 4]);
    }
    hline(data.a.liquidityLevel, '#fbbf24', 'Liquidity', [8, 5]);
    if (data.showWalls && data.walls) {
      hline(data.walls.callWall, 'rgba(248,113,113,.85)', 'Call OI wall', [10, 4]);
      hline(data.walls.putWall, 'rgba(52,211,153,.85)', 'Put OI wall', [10, 4]);
      hline(data.walls.maxPain, 'rgba(167,139,250,.8)', 'Max pain', [2, 6]);
    }
    if (data.showPlan && data.a.plan) {
      hline(data.a.plan.entry, '#60a5fa', 'Entry', []);
      hline(data.a.plan.sl, '#f87171', 'SL', [4, 3]);
      data.a.plan.tps.slice(1).forEach((target, i) => hline(target.price, '#34d399', `TP${i + 2}`, [4, 3]));
      hline(data.a.plan.target, '#34d399', 'TP1', [4, 3]);
    }
    ctx.font = 'bold 10px Arial,sans-serif';
    for (const event of data.a.events) {
      const x = xAt(event.t), pivotX = xAt(event.pivotT), y = yAt(event.level);
      if (x == null || pivotX == null || y == null || x < 0 || pivotX > pane.width || y < 0 || y > pane.height) continue;
      ctx.strokeStyle = event.dir === 'bull' ? 'rgba(52,211,153,.7)' : 'rgba(248,113,113,.7)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, pivotX), y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(event.kind, (Math.max(0, pivotX) + x) / 2 - 12, y + (event.dir === 'bull' ? -4 : 12));
    }
    for (const sweep of data.a.sweeps) {
      const x = xAt(sweep.t), y = yAt(sweep.price);
      if (x == null || y == null || x < 0 || x > pane.width || y < 0 || y > pane.height) continue;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export default function CandleChart({ candles, a, showFvg, showEma, showPlan, daily, walls, showWalls = true, initialCount = 120, interactive = true, height, compact = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const chartElement = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const candlesByTime = useRef(new Map<number, Candle>());
  const overlayData = useRef<ChartData>({ candles, a, showFvg, showEma, showPlan, daily, walls, showWalls, compact });
  const drawRef = useRef<() => void>(() => {});
  const candleCount = useRef(0);
  const [hover, setHover] = useState<Candle | null>(null);

  useEffect(() => {
    const element = chartElement.current;
    const canvas = overlay.current;
    if (!element || !canvas) return;
    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#071329' },
        textColor: '#93a6c8',
        attributionLogo: true
      },
      grid: {
        vertLines: { color: 'rgba(31,55,102,.35)' },
        horzLines: { color: 'rgba(31,55,102,.35)' }
      },
      rightPriceScale: {
        borderColor: 'rgba(31,55,102,.65)',
        minimumWidth: 76,
        scaleMargins: { top: 0.08, bottom: 0.08 }
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: 'rgba(31,55,102,.65)',
        timeVisible: !daily,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: (time: Time) => {
          if (typeof time !== 'number') return '';
          return daily
            ? new Date(time * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
            : fmtIST(time * 1000);
        }
      },
      localization: {
        locale: 'en-IN',
        priceFormatter: (price: number) => price.toFixed(2),
        timeFormatter: (time: Time) => typeof time === 'number' ? fmtIST(time * 1000, true) : String(time)
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(142,163,199,.4)', style: LineStyle.Dashed },
        horzLine: { color: 'rgba(142,163,199,.4)', style: LineStyle.Dashed }
      },
      handleScroll: interactive ? { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } : false,
      handleScale: interactive ? { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true } : false
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderUpColor: '#34d399',
      borderDownColor: '#f87171',
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      priceLineColor: '#38bdf8',
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true
    });
    const ema20 = chart.addSeries(LineSeries, {
      color: 'rgba(96,165,250,.9)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: 'rgba(167,139,250,.85)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;

    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (overlay.current) drawOverlays(overlay.current, chart, candleSeries, overlayData.current);
      });
    };
    drawRef.current = draw;
    chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
    const onDoubleClick = () => chart.timeScale().fitContent();
    chart.subscribeDblClick(onDoubleClick);
    const onCrosshair = (param: MouseEventParams<Time>) => {
      if (param.time == null || typeof param.time !== 'number') {
        setHover(null);
        return;
      }
      draw();
      setHover(candlesByTime.current.get(param.time) ?? null);
    };
    chart.subscribeCrosshairMove(onCrosshair);
    const observer = new ResizeObserver(draw);
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(draw);
      chart.unsubscribeDblClick(onDoubleClick);
      chart.unsubscribeCrosshairMove(onCrosshair);
      cancelAnimationFrame(frame);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      drawRef.current = () => {};
      candleCount.current = 0;
    };
  }, [daily, initialCount, interactive]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const ema20 = ema20Ref.current;
    const ema50 = ema50Ref.current;
    if (!chart || !candleSeries || !ema20 || !ema50) return;
    overlayData.current = { candles, a, showFvg, showEma, showPlan, daily, walls, showWalls, compact };
    candlesByTime.current = new Map(candles.map(candle => [utcTime(candle.t), candle]));

    const previousRange = chart.timeScale().getVisibleLogicalRange();
    const wasAtLatest = !previousRange || previousRange.to >= candleCount.current - 1.5;
    candleSeries.setData(candles.map(candle => ({
      time: utcTime(candle.t),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c
    })));
    const ema20Offset = Math.max(0, (a?.ema20Series.length ?? 0) - candles.length);
    ema20.setData(candles.flatMap((candle, i) => {
      const value = a?.ema20Series[ema20Offset + i];
      return value == null ? [] : [{ time: utcTime(candle.t), value }];
    }));
    const ema50Offset = Math.max(0, (a?.ema50Series.length ?? 0) - candles.length);
    ema50.setData(candles.flatMap((candle, i) => {
      const value = a?.ema50Series[ema50Offset + i];
      return value == null ? [] : [{ time: utcTime(candle.t), value }];
    }));
    ema20.applyOptions({ visible: !compact && showEma });
    ema50.applyOptions({ visible: !compact && showEma });

    if (!candles.length) {
      candleCount.current = 0;
      setHover(null);
    } else if (candleCount.current === 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - initialCount),
        to: candles.length + 3
      });
    } else if (wasAtLatest) {
      chart.timeScale().scrollToRealTime();
    } else if (previousRange) {
      chart.timeScale().setVisibleLogicalRange(previousRange);
    }
    candleCount.current = candles.length;
    drawRef.current();
  }, [a, candles, compact, daily, initialCount, showEma, showFvg, showPlan, showWalls, walls]);

  return (
    <div ref={wrap} className={`chart-wrap${compact ? ' compact-chart' : ''}`} style={height ? { height } : undefined} role="img" aria-label="Order block candlestick chart">
      <div ref={chartElement} className="chart-engine" />
      <canvas ref={overlay} className="chart-overlay" aria-hidden="true" />
      {hover && !compact && (
        <div className="chart-crosshair-info">
          <b>{fmtIST(hover.t, true)}</b>
          <span>O {hover.o.toFixed(2)}</span>
          <span>H {hover.h.toFixed(2)}</span>
          <span>L {hover.l.toFixed(2)}</span>
          <span>C {hover.c.toFixed(2)}</span>
          <span>V {hover.v.toLocaleString('en-IN')}</span>
        </div>
      )}
      {!candles.length && <div className="notice chart-empty">Chart data is not available for this timeframe.</div>}
    </div>
  );
}
