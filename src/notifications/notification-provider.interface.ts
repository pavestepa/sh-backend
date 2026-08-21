export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export interface PushTarget {
  token: string;
  platform: 'IOS' | 'ANDROID';
}

export interface NotificationProvider {
  send(
    target: PushTarget,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
