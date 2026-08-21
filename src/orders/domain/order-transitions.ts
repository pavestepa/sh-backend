import { OrderStatus } from '@prisma/client';
import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * The single source of truth for which Order status transitions exist.
 * Actual atomicity is enforced by conditional `UPDATE ... WHERE status = X`
 * statements in OrdersService — this table is the documentation/pre-check
 * layer so invalid transitions fail fast with a clear error before any SQL
 * runs.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.OPEN]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [
    OrderStatus.WAITING_CONFIRMATION,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.WAITING_CONFIRMATION]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function assertTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw DomainException.conflict(
      ErrorCode.ORDER_INVALID_TRANSITION,
      `Cannot transition order from ${from} to ${to}`,
    );
  }
}
