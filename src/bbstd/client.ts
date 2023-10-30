// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import * as atlassianjwt from "atlassian-jwt";
import * as jose from "jose";

/**
 * Represents a BitBucket Security Context that is needed for authentication.
 */
export type BitBucketSecurityContext = {
  key: string;
  clientKey: string;
  publicKey: string;
  sharedSecret: string;
  baseApiUrl: string;
};

/**
 * Options for configuring the BitBucket API client.
 */
export type BitBucketAPIOptions = {
  baseUrl?: string;
  securityContext?: BitBucketSecurityContext;
};

/**
 * The BitBucket API client class for making authenticated and unauthenticated API calls against the BitBucket Cloud
 * REST API.
 */
export class BitBucket {
  #baseURL: string;
  #securityContext?: BitBucketSecurityContext;

  constructor(options: BitBucketAPIOptions = {}) {
    this.#baseURL = options.baseUrl || "https://api.bitbucket.org";
    this.#securityContext = options.securityContext;
  }

  /**
   * Sets an override url endpoint for BitBucket API calls.
   * @param apiURL url endpoint for the BitBucket API used for api calls. It should include the protocol, the domain and the path.
   * @example: "https://api.bitbucket.org"
   * @returns BitBucket
   */
  setBitBucketApiUrl(apiURL: string) {
    this.#baseURL = apiURL;

    return this;
  }

  async directAPICall(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#securityContext) {
      const token = await generateSessionToken(
        this.#securityContext,
        "GET",
        url,
      );
      headers.Authorization = `JWT ${token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BitBucket API Error on URL ${url} (${response.status}): ${text}`,
      );
    }
    return response;
  }

  async apiCall(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: atlassianjwt.Params,
  ): Promise<Response> {
    // ensure there's a slash prior to path
    const url = `${this.#baseURL.replace(/\/$/, "")}/${path}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = undefined;
    if (method === "POST" || method === "PUT") {
      body = JSON.stringify(data);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#securityContext) {
      const token = await generateSessionToken(
        this.#securityContext,
        method,
        url,
        data,
      );
      headers.Authorization = `JWT ${token}`;
    }

    const response = await fetch(url, {
      method: method,
      headers: headers,
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BitBucket API Error on url ${url} (${response.status}): ${text}`,
      );
    }
    return response;
  }
}

/**
 * Given a security context from BitBucket, generate the session JWT token for accessing an API endpoint.
 */
async function generateSessionToken(
  sctx: BitBucketSecurityContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  urlRaw: string,
  body?: atlassianjwt.Params,
): Promise<string> {
  let req: atlassianjwt.Request;
  if (body && method === "POST") {
    req = atlassianjwt.fromMethodAndPathAndBody("post", urlRaw, body);
  } else if (body && method === "PUT") {
    req = atlassianjwt.fromMethodAndPathAndBody("put", urlRaw, body);
  } else {
    req = atlassianjwt.fromMethodAndUrl(method, urlRaw);
  }
  const qsh = atlassianjwt.createQueryStringHash(req);

  const customClaims = { qsh };

  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(sctx.sharedSecret);

  const token = await new jose.SignJWT(customClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(sctx.key)
    .setSubject(sctx.clientKey)
    .setExpirationTime("15m")
    .sign(keyBuf);

  return token;
}
