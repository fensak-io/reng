// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

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
  IPatch,
  IObjectDiff,
  PatchOp,
} from "../engine/patch_types.ts";

import type { Repository, PullRequestPatches } from "./from.ts";
import { objectParserFromFilename } from "./from.ts";

// A type utility to unpack the element type from an array type
// See https://stackoverflow.com/questions/43537520/how-do-i-extract-a-type-from-an-array-in-typescript
type EleTypeUnpacked<T> = T extends (infer U)[] ? U : T;

type PRFile = EleTypeUnpacked<
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}/files"]["response"]["data"]
>;
type PullReq =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];

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
  repo: Repository,
  prNum: number,
): Promise<PullRequestPatches> {
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

  const out: PullRequestPatches = {
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
  };
  for await (const { data: prFiles } of iter) {
    for (const f of prFiles) {
      const patches = await getPatchesFromPRFile(
        clt,
        f,
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
  pullReq: PullReq,

  // The following is only needed for error messaging
  repoName: string,
): Promise<IPatch[]> {
  let op = PatchOp.Unknown;
  switch (f.status) {
    // This should never happen, so we throw an error
    default:
      throw new Error(
        `[github] unknown status for file ${f.filename} in PR ${pullReq.number} of repo ${repoName}: ${f.status}`,
      );

    // A rename is a delete and then an insert, so special case it
    case "renamed":
      if (!f.previous_filename) {
        // This shouldn't happen because of the way the GitHub API works, so we throw an error.
        throw new Error(
          "[github] previous filename not available for a rename",
        );
      }
      return [
        {
          path: f.previous_filename,
          op: PatchOp.Delete,
          // TODO: this requires pulling down the file contents
          additions: 0,
          deletions: 0,
          diff: [],
          objectDiff: null,
        },
        {
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
      path: f.filename,
      op: op,
      additions: f.additions,
      deletions: f.deletions,
      diff: parseUnifiedDiff(f.patch || ""),
      objectDiff: await getObjectDiff(clt, f, pullReq, op),
    },
  ];
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
      `[github] PR ${owner}/${repo}#${prNum} has front matter, but it is not in the expected format`,
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
  const parser = objectParserFromFilename(f.filename);
  if (parser === null) {
    return null;
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
    throw new Error(`[github] ${f.filename} is not a file`);
  }
  return Buffer.from(fileRep.content, "base64").toString();
}
