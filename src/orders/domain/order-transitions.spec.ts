import { OrderStatus } from '@prisma/client';
import { assertTransitionAllowed } from './order-transitions';

describe('order state machine', () => {
  it('allows the documented happy-path transitions', () => {
    expect(() =>
      assertTransitionAllowed(OrderStatus.OPEN, OrderStatus.ACCEPTED),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed(OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed(
        OrderStatus.IN_PROGRESS,
        OrderStatus.WAITING_CONFIRMATION,
      ),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed(
        OrderStatus.WAITING_CONFIRMATION,
        OrderStatus.COMPLETED,
      ),
    ).not.toThrow();
  });

  it('allows cancellation from OPEN, ACCEPTED and IN_PROGRESS', () => {
    expect(() =>
      assertTransitionAllowed(OrderStatus.OPEN, OrderStatus.CANCELLED),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed(OrderStatus.ACCEPTED, OrderStatus.CANCELLED),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED),
    ).not.toThrow();
  });

  it('rejects skipping states forward', () => {
    expect(() =>
      assertTransitionAllowed(OrderStatus.OPEN, OrderStatus.IN_PROGRESS),
    ).toThrow();
    expect(() =>
      assertTransitionAllowed(OrderStatus.OPEN, OrderStatus.COMPLETED),
    ).toThrow();
  });

  it('rejects any transition out of terminal states', () => {
    expect(() =>
      assertTransitionAllowed(OrderStatus.COMPLETED, OrderStatus.CANCELLED),
    ).toThrow();
    expect(() =>
      assertTransitionAllowed(OrderStatus.CANCELLED, OrderStatus.OPEN),
    ).toThrow();
  });

  it('rejects moving a completed order backwards to an earlier state', () => {
    expect(() =>
      assertTransitionAllowed(
        OrderStatus.COMPLETED,
        OrderStatus.WAITING_CONFIRMATION,
      ),
    ).toThrow();
  });
});
