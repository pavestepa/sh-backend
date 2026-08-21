/** OutboxEvent.type values consumed by the SEND_PUSH_NOTIFICATION job. */
export const NotificationEventType = {
  NEW_APPLICATION: 'NEW_APPLICATION',
  WORKER_SELECTED: 'WORKER_SELECTED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  ORDER_REMINDER: 'ORDER_REMINDER',
  ORDER_STARTED: 'ORDER_STARTED',
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  NEW_REVIEW: 'NEW_REVIEW',
} as const;

export type NotificationEventType =
  (typeof NotificationEventType)[keyof typeof NotificationEventType];

export const AGGREGATE_TYPE_ORDER = 'ORDER';
export const AGGREGATE_TYPE_PHOTO = 'PHOTO';

/** Outbox event type routed by the worker to the PHOTO_PROCESSING pg-boss job instead of a push notification. */
export const PHOTO_PROCESSING_EVENT_TYPE = 'PHOTO_PROCESSING';
