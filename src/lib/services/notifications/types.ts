/**
 * Notification delivery abstraction.
 * In-app notifications are written by the database when a workflow event
 * happens. Every other enabled channel gets an outbox row; a worker
 * (processOutbox) hands it to the channel implementation registered here.
 * No external provider is hard-coded.
 */
export type ChannelId = "email" | "sms";

export type OutgoingMessage = {
  notificationId: string;
  to: { email?: string | null; phone?: string | null };
  title: string;
  body: string | null;
  link: string | null;
};

export interface NotificationChannel {
  readonly id: ChannelId;
  /** False until a real provider is wired in. Unconfigured channels never pretend to send. */
  readonly configured: boolean;
  send(message: OutgoingMessage): Promise<void>;
}

export class ChannelNotConfiguredError extends Error {
  constructor(channel: ChannelId) {
    super(`The ${channel} channel has no delivery provider configured`);
  }
}
