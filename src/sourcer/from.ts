// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import YAML from "yaml";
import toml from "toml";
import JSON5 from "json5";

import { IChangeSetMetadata, IPatch } from "../engine/patch_types.ts";

export enum SourcePlatform {
  GitHub = "gh",
  BitBucket = "bb",
}

/**
 * Represents a repository hosted on a remote VCS (e.g., GitHub or BitBucket).
 * @property owner The owner of the repository.
 * @property name The name of the repository.
 */
export type Repository = {
  owner: string;
  name: string;
};

/**
 * Represents the decoded patches for the Pull Request. This also includes a mapping from patch IDs to the URL to
 * retrieve the file contents.
 * @property patchList The list of file patches that are included in this PR.
 */
export type PullRequestPatches = {
  metadata: IChangeSetMetadata;
  patchList: IPatch[];
};

// eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
export type Parser = (s: string) => any;

export function objectParserFromFilename(fname: string): Parser | null {
  // Get the file extension to determine the file type
  const m = /(?:\.([^.]+))?$/.exec(fname);
  if (m === null) {
    return null;
  }
  const ext = m[1];

  const supportedObjectExtensions = ["json", "json5", "yaml", "yml", "toml"];
  if (!supportedObjectExtensions.includes(ext)) {
    return null;
  }

  // At this point, we know the object can be parsed out of the file so start to pull down the contents.
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  switch (ext) {
    default:
      // Throw error becauset this should never happen given the check for supportedObjectExtensions.
      throw new Error(`unsupported file extension ${ext} for ${fname}`);

    case "json":
      return JSON.parse;

    case "json5":
      return JSON5.parse;

    case "yaml":
    case "yml":
      return YAML.parse;

    case "toml":
      return toml.parse;
  }
}
