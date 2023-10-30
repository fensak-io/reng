// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import * as nodecrypto from "crypto";

import { hexEncode } from "./hex.ts";

const crypto = nodecrypto.webcrypto;

/**
 * Generates the hex encoded sha256 hash of a given string.
 */
export async function sha256(toHash: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(toHash),
  );
  return hexEncode(new Uint8Array(digest));
}
