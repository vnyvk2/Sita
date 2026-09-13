import { describe, expect, it } from 'vitest';
import {
  AbLoopController,
  LOOP_EPSILON,
  MIN_LOOP_DURATION
} from '@renderer/other/abLoopController';

describe('AbLoopController', () => {
  it('starts in idle state with null points', () => {
    const controller = new AbLoopController();
    expect(controller.phase).toBe('idle');
    expect(controller.pointA).toBeNull();
    expect(controller.pointB).toBeNull();
    expect(controller.isActive()).toBe(false);
    expect(controller.isArmed()).toBe(false);
    expect(controller.state).toEqual({
      phase: 'idle',
      pointA: null,
      pointB: null
    });
  });

  describe('setPointA', () => {
    it('arms the loop and records Point A', () => {
      const controller = new AbLoopController();
      const res = controller.setPointA(10.5, 120);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);
      expect(controller.phase).toBe('armed');
      expect(controller.pointA).toBe(10.5);
      expect(controller.pointB).toBeNull();
      expect(controller.isArmed()).toBe(true);
      expect(controller.isActive()).toBe(false);
    });

    it('clamps Point A to duration minus MIN_LOOP_DURATION', () => {
      const controller = new AbLoopController();
      const res = controller.setPointA(119.9, 120);
      expect(res.success).toBe(true);
      expect(controller.pointA).toBe(120 - MIN_LOOP_DURATION);
    });

    it('rejects negative or non-finite time', () => {
      const controller = new AbLoopController();
      const res1 = controller.setPointA(-5, 120);
      expect(res1.success).toBe(false);
      expect(res1.changed).toBe(false);
      expect(controller.phase).toBe('idle');

      const res2 = controller.setPointA(NaN, 120);
      expect(res2.success).toBe(false);
      expect(res2.changed).toBe(false);
    });

    it('returns changed: false when called with identical Point A (idempotency)', () => {
      const controller = new AbLoopController();
      controller.setPointA(10, 120);
      const res = controller.setPointA(10, 120);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(false);
    });
  });

  describe('setPointB', () => {
    it('requires controller to be in armed phase', () => {
      const controller = new AbLoopController();
      const res = controller.setPointB(20, 120);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Point A must be set');
      expect(controller.phase).toBe('idle');
    });

    it('activates loop when Point B is valid and > Point A by at least MIN_LOOP_DURATION', () => {
      const controller = new AbLoopController();
      controller.setPointA(10, 120);
      const res = controller.setPointB(25.5, 120);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);
      expect(controller.phase).toBe('active');
      expect(controller.pointA).toBe(10);
      expect(controller.pointB).toBe(25.5);
      expect(controller.isActive()).toBe(true);
    });

    it('strictly rejects when Point B <= Point A (hotkey reject semantics, no auto-swap)', () => {
      const controller = new AbLoopController();
      controller.setPointA(20, 120);
      const res = controller.setPointB(15, 120);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('Point B must come after Point A');
      expect(controller.phase).toBe('armed'); // remains armed at 20
      expect(controller.pointA).toBe(20);
      expect(controller.pointB).toBeNull();
    });

    it('rejects when Point B - Point A < MIN_LOOP_DURATION', () => {
      const controller = new AbLoopController();
      controller.setPointA(10, 120);
      const res = controller.setPointB(10.1, 120); // only 0.1s
      expect(res.success).toBe(false);
      expect(res.reason).toContain(`at least ${MIN_LOOP_DURATION} seconds`);
      expect(controller.phase).toBe('armed');
    });

    it('returns changed: false when called with identical Point B (idempotency)', () => {
      const controller = new AbLoopController();
      controller.setPointA(10, 120);
      controller.setPointB(20, 120);
      const res = controller.setPointB(20, 120);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(false);
    });
  });

  describe('setRange (waveform drag)', () => {
    it('activates loop atomically from start and end', () => {
      const controller = new AbLoopController();
      const res = controller.setRange(5, 15, 100);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);
      expect(controller.phase).toBe('active');
      expect(controller.pointA).toBe(5);
      expect(controller.pointB).toBe(15);
    });

    it('direction-agnostic: automatically swaps if start > end (right-to-left drag)', () => {
      const controller = new AbLoopController();
      const res = controller.setRange(25, 10, 100);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);
      expect(controller.pointA).toBe(10);
      expect(controller.pointB).toBe(25);
      expect(controller.phase).toBe('active');
    });

    it('rejects when range is smaller than MIN_LOOP_DURATION', () => {
      const controller = new AbLoopController();
      const res = controller.setRange(10, 10.15, 100);
      expect(res.success).toBe(false);
      expect(controller.phase).toBe('idle');
    });

    it('clamps range to track duration', () => {
      const controller = new AbLoopController();
      controller.setRange(90, 125, 100);
      expect(controller.pointA).toBe(90);
      expect(controller.pointB).toBe(100);
    });

    it('returns changed: false when called with identical range', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);
      const res = controller.setRange(10, 20, 100);
      expect(res.success).toBe(true);
      expect(res.changed).toBe(false);
    });
  });

  describe('checkLoop & EPSILON boundary', () => {
    it('returns shouldSeek: false when loop is not active', () => {
      const controller = new AbLoopController();
      expect(controller.checkLoop(50)).toEqual({ shouldSeek: false, targetTime: 0 });

      controller.setPointA(10, 100);
      expect(controller.checkLoop(50)).toEqual({ shouldSeek: false, targetTime: 0 });
    });

    it('returns shouldSeek: false before Point B - EPSILON', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);

      // t = 20 - 0.03 - 0.001 = 19.969
      const res = controller.checkLoop(20 - LOOP_EPSILON - 0.001);
      expect(res.shouldSeek).toBe(false);
    });

    it('returns shouldSeek: true at exactly Point B - EPSILON', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);

      // t = 20 - 0.03 = 19.97
      const res = controller.checkLoop(20 - LOOP_EPSILON);
      expect(res.shouldSeek).toBe(true);
      expect(res.targetTime).toBe(10);
    });

    it('returns shouldSeek: true past Point B', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);

      const res = controller.checkLoop(20.05);
      expect(res.shouldSeek).toBe(true);
      expect(res.targetTime).toBe(10);
    });
  });

  describe('isPositionOutside', () => {
    it('identifies positions outside loop range plus tolerance', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);

      // Inside
      expect(controller.isPositionOutside(10.0)).toBe(false);
      expect(controller.isPositionOutside(15.0)).toBe(false);
      expect(controller.isPositionOutside(20.0)).toBe(false);

      // Within 0.05s tolerance
      expect(controller.isPositionOutside(9.96)).toBe(false);
      expect(controller.isPositionOutside(20.04)).toBe(false);

      // Outside
      expect(controller.isPositionOutside(9.94)).toBe(true);
      expect(controller.isPositionOutside(5.0)).toBe(true);
      expect(controller.isPositionOutside(20.06)).toBe(true);
      expect(controller.isPositionOutside(25.0)).toBe(true);
    });

    it('returns false when loop is not active', () => {
      const controller = new AbLoopController();
      expect(controller.isPositionOutside(50)).toBe(false);
      controller.setPointA(10, 100);
      expect(controller.isPositionOutside(50)).toBe(false);
    });
  });

  describe('clear & onTrackChange', () => {
    it('resets state from active to idle', () => {
      const controller = new AbLoopController();
      controller.setRange(10, 20, 100);

      const res = controller.clear();
      expect(res.changed).toBe(true);
      expect(controller.phase).toBe('idle');
      expect(controller.pointA).toBeNull();
      expect(controller.pointB).toBeNull();

      // Idempotency: second clear returns changed: false
      expect(controller.clear().changed).toBe(false);
    });

    it('onTrackChange behaves as clear', () => {
      const controller = new AbLoopController();
      controller.setPointA(15, 100);
      const res = controller.onTrackChange();
      expect(res.changed).toBe(true);
      expect(controller.phase).toBe('idle');
    });
  });
});
