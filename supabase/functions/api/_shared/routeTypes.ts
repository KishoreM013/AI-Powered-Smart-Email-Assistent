/**
 * Local types used only by the router in index.ts.
 *
 * Kept separate from _shared/types.ts so the store and services do not depend
 * on router-shaped request bodies.
 */

import type { EmailItem } from "./types.ts";

export interface OCRScanRequestLike {
  email_id?: string;
  attachment_id?: string;
  raw_text?: string;
}

export type { EmailItem };
