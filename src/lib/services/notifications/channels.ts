import { ChannelNotConfiguredError, type ChannelId, type NotificationChannel } from "./types";

/**
 * Placeholder for channels that have no provider yet. Registering a real one
 * means implementing NotificationChannel (e.g. SMTP, Microsoft Graph, an SMS
 * gateway) and replacing the entry below — see docs/architecture.md.
 */
class NotConfiguredChannel implements NotificationChannel {
  readonly configured = false;
  constructor(readonly id: ChannelId) {}
  async send(): Promise<void> {
    throw new ChannelNotConfiguredError(this.id);
  }
}

export const CHANNELS: Record<ChannelId, NotificationChannel> = {
  email: new NotConfiguredChannel("email"),
  sms: new NotConfiguredChannel("sms"),
};
