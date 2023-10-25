// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import * as nodecrypto from "crypto";
import YAML from "yaml";
import toml from "toml";
import JSON5 from "json5";
import diff from "microdiff";

import { Octokit } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import {
  hasParsableFrontMatter,
  extract as extractFrontMatter,
} from "@fensak-io/front-matter";

import { parseUnifiedDiff } from "../engine/patch.ts";
import {
  ILinkedPR,
  IChangeSetMetadata,
  IPatch,
  IObjectDiff,
  PatchOp,
} from "../engine/patch_types.ts";

import { SourcePlatform } from "./from.ts";

const crypto = nodecrypto.webcrypto;

// A type utility to unpack the element type from an array type
// See https://stackoverflow.com/questions/43537520/how-do-i-extract-a-type-from-an-array-in-typescript
type EleTypeUnpacked<T> = T extends (infer U)[] ? U : T;

type PRFile = EleTypeUnpacked<
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}/files"]["response"]["data"]
>;
type PullReq =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];

/**
 * Represents a repository hosted on GitHub.
 * @property owner The owner of the repository.
 * @property name The name of the repository.
 */
export interface IGitHubRepository {
  owner: string;
  name: string;
}

/**
 * Represents the decoded patches for the Pull Request. This also includes a mapping from patch IDs to the URL to
 * retrieve the file contents.
 * @property patchList The list of file patches that are included in this PR.
 * @property patchFetchMap A mapping from a URL hash to the URL to fetch the contents for the file. The URL hash is
 *                         the sha256 hash of the URL with a random salt.
 */
export interface IGitHubPullRequestPatches {
  metadata: IChangeSetMetadata;
  patchList: IPatch[];
  patchFetchMap: Record<string, URL>;
}

/**
 * Pull in the changes contained in the Pull Request and create an IPatch array and a mapping from PR file IDs to the
 * URL to fetch the contents.
 * @param clt An authenticated or anonymous GitHub API client created from Octokit.
 * @param repo The repository to pull the pull request changes from.
 * @param prNum The number of the PR where the changes should be pulled from.
 * @returns The list of patches that are contained in the Pull Request.
 */
export async function patchFromGitHubPullRequest(
  clt: Octokit,
  repo: IGitHubRepository,
  prNum: number,
): Promise<IGitHubPullRequestPatches> {
  const { data: pullReq } = await clt.pulls.get({
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNum,
  });

  const iter = clt.paginate.iterator(clt.pulls.listFiles, {
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNum,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
    per_page: 100,
  });

  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  const fetchMapSalt = hexEncode(a);

  const out: IGitHubPullRequestPatches = {
    metadata: {
      sourceBranch: pullReq.head.ref,
      targetBranch: pullReq.base.ref,
      linkedPRs: await extractLinkedPRs(
        clt,
        repo.owner,
        repo.name,
        prNum,
        pullReq.body,
      ),
    },
    patchList: [],
    patchFetchMap: {},
  };
  for await (const { data: prFiles } of iter) {
    for (const f of prFiles) {
      const fContentsURL = new URL(f.contents_url);
      const fContentsHash = await getGitHubPRFileID(fetchMapSalt, fContentsURL);
      out.patchFetchMap[fContentsHash] = fContentsURL;
      const patches = await getPatchesFromPRFile(
        clt,
        f,
        fContentsHash,
        pullReq,
        `${repo.owner}/${repo.name}`,
      );
      out.patchList.push(...patches);
    }
  }
  return out;
}

async function getPatchesFromPRFile(
  clt: Octokit,
  f: PRFile,
  fContentsHash: string,
  pullReq: PullReq,

  // The following is only needed for error messaging
  repoName: string,
): Promise<IPatch[]> {
  const fid = `${SourcePlatform.GitHub}:${fContentsHash}`;

  let op = PatchOp.Unknown;
  switch (f.status) {
    // This should never happen, so we throw an error
    default:
      throw new Error(
        `unknown status for file ${f.filename} in PR ${pullReq.number} of repo ${repoName}: ${f.status}`,
      );

    // A rename is a delete and then an insert, so special case it
    case "renamed":
      if (!f.previous_filename) {
        // This shouldn't happen because of the way the GitHub API works, so we throw an error.
        throw new Error("previous filename not available for a rename");
      }
      return [
        {
          contentsID: fid,
          path: f.previous_filename,
          op: PatchOp.Delete,
          // TODO: this requires pulling down the file contents
          additions: 0,
          deletions: 0,
          diff: [],
          objectDiff: null,
        },
        {
          contentsID: fid,
          path: f.filename,
          op: PatchOp.Insert,
          // TODO: this requires pulling down the file contents
          additions: 0,
          deletions: 0,
          diff: [],
          objectDiff: null,
        },
      ];

    // The rest only needs to set the op

    case "added":
    case "copied": // a copy is the same as a file insert.
      op = PatchOp.Insert;
      break;
    case "removed":
      op = PatchOp.Delete;
      break;
    case "changed":
    case "modified":
      op = PatchOp.Modified;
      break;
  }

  return [
    {
      contentsID: fid,
      path: f.filename,
      op: op,
      additions: f.additions,
      deletions: f.deletions,
      diff: parseUnifiedDiff(f.patch || ""),
      objectDiff: await getObjectDiff(clt, f, pullReq, op),
    },
  ];
}

async function getGitHubPRFileID(salt: string, url: URL): Promise<string> {
  const toHash = `${salt}:${url}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(toHash),
  );
  return hexEncode(new Uint8Array(digest));
}

async function extractLinkedPRs(
  clt: Octokit,
  owner: string,
  repo: string,
  prNum: number,
  prDescription: string | null,
): Promise<ILinkedPR[]> {
  interface IFrontMatterLinkedPR {
    repo?: string;
    prNum: number;
  }

  interface IExpectedFrontMatter {
    fensak: {
      linked: IFrontMatterLinkedPR[];
    };
  }

  if (!prDescription || !hasParsableFrontMatter(prDescription)) {
    return [];
  }

  const fm = extractFrontMatter<IExpectedFrontMatter>(prDescription);
  if (!fm.attrs.fensak) {
    return [];
  }
  if (!fm.attrs.fensak.linked) {
    throw new TypeError(
      `PR ${owner}/${repo}#${prNum} has front matter, but it is not in the expected format`,
    );
  }

  const out: ILinkedPR[] = await Promise.all(
    fm.attrs.fensak.linked.map(async (l): Promise<ILinkedPR> => {
      let outR = "";
      let r = repo;
      if (l.repo) {
        outR = l.repo;
        r = l.repo;
      }
      const { data: pullReq } = await clt.pulls.get({
        owner: owner,
        repo: r,
        pull_number: l.prNum,
      });

      return {
        repo: outR,
        prNum: l.prNum,
        isMerged: pullReq.merged,
        isClosed: pullReq.state === "closed",
      };
    }),
  );
  return out;
}

/**
 * Returns a diff of the object representation of the PR file if it can be parsed as a object. This representation is
 * more ergonomical to work with than the textual patch representation, as you can traverse the keys of the object to
 * see which data has changed.
 *
 * Currently we support pulling down the object representation for the following file types:
 * - JSON
 * - JSON5
 * - YAML
 * - TOML
 *
 * Returns null if the file can not be turned into an object type.
 */
async function getObjectDiff(
  clt: Octokit,
  f: PRFile,
  pullReq: PullReq,
  op: PatchOp,
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
): Promise<IObjectDiff | null> {
  // Get the file extension to determine the file type
  const m = /(?:\.([^.]+))?$/.exec(f.filename);
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
  let parser: (s: string) => any;
  switch (ext) {
    default:
      // Throw error becauset this should never happen given the check for supportedObjectExtensions.
      throw new Error(`unsupported file extension ${ext} for ${f.filename}`);

    case "json":
      parser = JSON.parse;
      break;

    case "json5":
      parser = JSON5.parse;
      break;

    case "yaml":
    case "yml":
      parser = YAML.parse;
      break;

    case "toml":
      parser = toml.parse;
      break;
  }

  switch (op) {
    default:
      return null;

    case PatchOp.Insert: {
      const curContents = await getPRFileContent(clt, f, pullReq, "head");
      const cur = parser(curContents);
      return {
        previous: null,
        current: cur,
        diff: [],
      };
    }

    case PatchOp.Delete: {
      const prevContents = await getPRFileContent(clt, f, pullReq, "base");
      const prev = parser(prevContents);
      return {
        previous: prev,
        current: null,
        diff: [],
      };
    }

    case PatchOp.Modified: {
      const prevContents = await getPRFileContent(clt, f, pullReq, "base");
      const prev = parser(prevContents);
      const curContents = await getPRFileContent(clt, f, pullReq, "head");
      const cur = parser(curContents);
      return {
        previous: prev,
        current: cur,
        diff: diff(prev, cur),
      };
    }
  }
}

async function getPRFileContent(
  clt: Octokit,
  f: PRFile,
  pullReq: PullReq,
  refSrc: "base" | "head",
): Promise<string> {
  let repoOwner = pullReq.base.repo.owner.login;
  let repoName = pullReq.base.repo.name;
  let ref = pullReq.base.ref;
  if (refSrc === "head") {
    const repo = pullReq.head.repo || pullReq.base.repo;
    repoOwner = repo.owner.login;
    repoName = repo.name;
    ref = pullReq.head.ref;
  }

  const { data: fileRep } = await clt.repos.getContent({
    owner: repoOwner,
    repo: repoName,
    path: f.filename,
    ref: ref,
  });
  if (Array.isArray(fileRep) || fileRep.type !== "file") {
    throw new Error(`${f.filename} is not a file`);
  }
  return Buffer.from(fileRep.content, "base64").toString();
}

function hexEncode(hb: Uint8Array): string {
  const hashArray = Array.from(hb);
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}
