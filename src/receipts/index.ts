/**
 * Receipts Module
 *
 * Delivery + read receipt service. Platform-agnostic — caller supplies
 * encrypted send and cache-update callbacks via the constructor.
 */

export { ReceiptService } from './service';
export type { ReceiptServiceOptions } from './service';

export {
  READ_ACK_MAX_CLOCK_SKEW_MS,
  advanceReadWatermark,
  deriveReadWatermark,
  isReadAckTimestampValid,
  resolveDeliveryAckPatch,
  resolveReadAckPatch,
} from './reconcile';
export type {
  DeliveryAckContext,
  ReadAckContext,
  ReceiptMessageView,
  ReceiptPatch,
} from './reconcile';
