// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * Encodes a byte array into hex.
 */
export function hexEncode(hb: Uint8Array): string {
  const hashArray = Array.from(hb);
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}
