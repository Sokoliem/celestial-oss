import { describe, expect, it, vi } from 'vitest';
import { createStreamingChart } from '../streaming.js';

describe('createStreamingChart', () => {
  it('starts with empty data', () => {
    const sc = createStreamingChart();
    expect(sc.getData()).toEqual([]);
    expect(sc.windowSize).toBe(0);
    expect(sc.totalPoints).toBe(0);
  });

  it('push adds data points', () => {
    const sc = createStreamingChart();
    sc.push(1, 2, 3);
    expect(sc.getData()).toEqual([1, 2, 3]);
    expect(sc.windowSize).toBe(3);
    expect(sc.totalPoints).toBe(3);
  });

  it('enforces sliding window', () => {
    const sc = createStreamingChart({ maxPoints: 5 });
    sc.push(1, 2, 3, 4, 5, 6, 7);
    expect(sc.windowSize).toBe(5);
    expect(sc.getData()).toEqual([3, 4, 5, 6, 7]);
    expect(sc.totalPoints).toBe(7);
  });

  it('setData replaces all data', () => {
    const sc = createStreamingChart();
    sc.push(1, 2, 3);
    sc.setData([10, 20, 30]);
    expect(sc.getData()).toEqual([10, 20, 30]);
    expect(sc.totalPoints).toBe(3);
  });

  it('setData respects maxPoints', () => {
    const sc = createStreamingChart({ maxPoints: 3 });
    sc.setData([1, 2, 3, 4, 5]);
    expect(sc.getData()).toEqual([3, 4, 5]);
  });

  it('clear removes all data', () => {
    const sc = createStreamingChart();
    sc.push(1, 2, 3);
    sc.clear();
    expect(sc.getData()).toEqual([]);
    expect(sc.windowSize).toBe(0);
    expect(sc.totalPoints).toBe(0);
  });

  it('render returns ChartResult', () => {
    const sc = createStreamingChart({ width: 20, height: 5 });
    sc.push(1, 2, 3, 4, 5);
    const result = sc.render();
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    const lines = str.split('\n');
    expect(lines.length).toBe(5);
  });

  it('renders bar chart type', () => {
    const sc = createStreamingChart({ type: 'bar', width: 20, height: 5 });
    sc.push(5, 10, 15);
    const result = sc.render();
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('onUpdate fires when data changes', () => {
    const sc = createStreamingChart();
    const callback = vi.fn();
    sc.onUpdate(callback);
    sc.push(42);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([42], expect.anything());
  });

  it('offUpdate removes callback', () => {
    const sc = createStreamingChart();
    const callback = vi.fn();
    sc.onUpdate(callback);
    sc.offUpdate(callback);
    sc.push(42);
    expect(callback).not.toHaveBeenCalled();
  });

  it('multiple pushes invoke callback each time', () => {
    const sc = createStreamingChart();
    const callback = vi.fn();
    sc.onUpdate(callback);
    sc.push(1);
    sc.push(2);
    sc.push(3);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('getData returns a copy (not reference)', () => {
    const sc = createStreamingChart();
    sc.push(1, 2, 3);
    const data = sc.getData();
    data.push(99);
    expect(sc.getData()).toEqual([1, 2, 3]);
  });

  it('render with empty data produces valid output', () => {
    const sc = createStreamingChart({ width: 10, height: 3 });
    const result = sc.render();
    expect(typeof result.toString()).toBe('string');
  });

  it('sliding window maintains order', () => {
    const sc = createStreamingChart({ maxPoints: 3 });
    sc.push(1);
    sc.push(2);
    sc.push(3);
    sc.push(4);
    sc.push(5);
    expect(sc.getData()).toEqual([3, 4, 5]);
  });
});

describe('streaming callback hardening', () => {
  it('uses a callback snapshot when listeners subscribe during delivery', () => {
    const chart = createStreamingChart();
    const late = vi.fn();
    chart.onUpdate(() => chart.onUpdate(late));
    chart.push(1);
    expect(late).not.toHaveBeenCalled();
    chart.push(2);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('reports faulty injected clocks and continues updates', () => {
    const onSubscriberError = vi.fn();
    const callback = vi.fn();
    const chart = createStreamingChart({
      now: () => {
        throw new Error('clock');
      },
      onSubscriberError,
    });
    chart.onUpdate(callback);
    chart.push(1);
    expect(onSubscriberError).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
