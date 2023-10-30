// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import diff from "microdiff";

import { BitBucket } from "../bbstd/index.ts";
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

import { objectParserFromFilename } from "./from.ts";
import type { Repository, PullRequestPatches } from "./from.ts";

type IBBFileDiff = {
  unifiedTxt: string;
  oFname: string;
  tFname: string;
};

/**
 * Pull in the changes contained in the Pull Request and create an IPatch array and a mapping from PR file IDs to the
 * URL to fetch the contents.
 * @param clt An authenticated or anonymous BitBucket API client.
 * @param repo The repository to pull the pull request changes from.
 * @param prNum The number of the PR where the changes should be pulled from.
 * @returns The list of patches that are contained in the Pull Request.
 */
export async function patchFromBitBucketPullRequest(
  clt: BitBucket,
  repo: Repository,
  prNum: number,
): Promise<PullRequestPatches> {
  const prResp = await clt.apiCall(
    `/2.0/repositories/${repo.owner}/${repo.name}/pullrequests/${prNum}`,
  );
  const pullReq = await prResp.json();

  const out: PullRequestPatches = {
    metadata: {
      sourceBranch: pullReq.source.branch.name,
      targetBranch: pullReq.destination.branch.name,
      linkedPRs: await extractLinkedPRs(
        clt,
        repo.owner,
        repo.name,
        prNum,
        pullReq.rendered.description.raw,
      ),
    },
    patchList: [],
  };

  const prDiffResp = await clt.directAPICall(pullReq.links.diff.href);
  const prDiff = await prDiffResp.text();
  out.patchList = await parseBitBucketDiff(
    clt,
    repo,
    pullReq.destination.commit.hash,
    pullReq.source.commit.hash,
    prDiff,
  );
  return out;
}

/**
 * Extract information about linked PRs from the data encoded in the front matter of the PR description.
 */
async function extractLinkedPRs(
  clt: BitBucket,
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
      `[bitbucket] PR ${owner}/${repo}#${prNum} has front matter, but it is not in the expected format`,
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
      const prResp = await clt.apiCall(
        `/2.0/repositories/${owner}/${r}/pullrequests/${l.prNum}`,
      );
      const pullReq = await prResp.json();

      return {
        repo: outR,
        prNum: l.prNum,
        isMerged: pullReq.state === "MERGED",
        isClosed: pullReq.state !== "OPEN",
      };
    }),
  );
  return out;
}

/**
 * Parses a PR diff that is returned from the bitbucket API. This is a text blob with entries of the form:
 *

diff --git a/README.md b/README.md
index 42acf9e..a690b11 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,5 @@
 # test-fensak-automated

 A test repo for automated testing.
+
+<!-- nonce change -->

 */
async function parseBitBucketDiff(
  clt: BitBucket,
  repo: Repository,
  prevHash: string,
  curHash: string,
  diffTxt: string,
): Promise<IPatch[]> {
  const out: IPatch[] = [];

  const diffStartLineRE = /^diff --git a\/.+ b\/.+$/;
  const ofnameRE = /^--- ((a\/(.+))|(\/dev\/null))$/;
  const tfnameRE = /^\+\+\+ ((b\/(.+))|(\/dev\/null))$/;
  let fdiff: IBBFileDiff | null = null;
  for (const line of diffTxt.split("\n")) {
    const maybeStart = diffStartLineRE.exec(line);
    if (maybeStart) {
      if (fdiff !== null) {
        const patches = await parseBitBucketFileDiff(
          clt,
          repo,
          prevHash,
          curHash,
          fdiff,
        );
        out.push(...patches);
      }
      fdiff = {
        unifiedTxt: line,
        oFname: "",
        tFname: "",
      };
    } else if (fdiff != null) {
      fdiff.unifiedTxt += `\n${line}`;

      const maybeOFname = ofnameRE.exec(line);
      const maybeTFname = tfnameRE.exec(line);
      if (maybeOFname && maybeOFname[1] !== "/dev/null") {
        fdiff.oFname = maybeOFname[3];
      } else if (maybeTFname && maybeTFname[1] !== "/dev/null") {
        fdiff.tFname = maybeTFname[3];
      }
    }
  }

  // Get the last one
  if (fdiff != null) {
    const patches = await parseBitBucketFileDiff(
      clt,
      repo,
      prevHash,
      curHash,
      fdiff,
    );
    out.push(...patches);
  }

  return out;
}

async function parseBitBucketFileDiff(
  clt: BitBucket,
  repo: Repository,
  srcHash: string,
  destHash: string,
  fdiff: IBBFileDiff,
): Promise<IPatch[]> {
  const diff = parseUnifiedDiff(fdiff.unifiedTxt);

  const isRename =
    fdiff.oFname && fdiff.tFname && fdiff.oFname !== fdiff.tFname;
  if (isRename) {
    let objectDiff: IObjectDiff | null = null;
    if (fdiff.unifiedTxt) {
      objectDiff = await getObjectDiff(
        clt,
        repo,
        srcHash,
        destHash,
        fdiff.oFname,
        fdiff.tFname,
        PatchOp.Modified,
      );
    }
    return [
      {
        path: fdiff.oFname,
        op: PatchOp.Delete,
        diff: [],
        objectDiff: null,
        // TODO: figure out how to get this in BitBucket
        additions: 0,
        deletions: 0,
      },
      {
        path: fdiff.tFname,
        op: PatchOp.Insert,
        diff: [],
        objectDiff: null,
        // TODO: figure out how to get this in BitBucket
        additions: 0,
        deletions: 0,
      },
      {
        path: fdiff.tFname,
        op: PatchOp.Modified,
        diff,
        objectDiff,
        // TODO: figure out how to get this in BitBucket
        additions: 0,
        deletions: 0,
      },
    ];
  }

  const isAdd = !fdiff.oFname && fdiff.tFname;
  const isDelete = fdiff.oFname && !fdiff.tFname;
  let op = PatchOp.Modified;
  let path = fdiff.oFname;
  if (isAdd) {
    op = PatchOp.Insert;
    path = fdiff.tFname;
  } else if (isDelete) {
    op = PatchOp.Delete;
  }

  const objectDiff = await getObjectDiff(
    clt,
    repo,
    srcHash,
    destHash,
    fdiff.oFname,
    fdiff.tFname,
    op,
  );
  return [
    {
      path,
      op,
      diff,
      objectDiff,
      // TODO: figure out how to get this in BitBucket
      additions: 0,
      deletions: 0,
    },
  ];
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
  clt: BitBucket,
  repo: Repository,
  prevHash: string,
  curHash: string,
  prevFpath: string,
  curFpath: string,
  op: PatchOp,
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
): Promise<IObjectDiff | null> {
  const parser = objectParserFromFilename(curFpath);
  if (parser === null) {
    return null;
  }

  switch (op) {
    default:
      return null;

    case PatchOp.Insert: {
      const resp = await clt.apiCall(
        `/2.0/repositories/${repo.owner}/${repo.name}/src/${curHash}/${curFpath}`,
      );
      const curContents = await resp.text();
      const cur = parser(curContents);
      return {
        previous: null,
        current: cur,
        diff: [],
      };
    }

    case PatchOp.Delete: {
      const resp = await clt.apiCall(
        `/2.0/repositories/${repo.owner}/${repo.name}/src/${prevHash}/${prevFpath}`,
      );
      const prevContents = await resp.text();
      const prev = parser(prevContents);
      return {
        previous: prev,
        current: null,
        diff: [],
      };
    }

    case PatchOp.Modified: {
      const prevResp = await clt.apiCall(
        `/2.0/repositories/${repo.owner}/${repo.name}/src/${prevHash}/${prevFpath}`,
      );
      const prevContents = await prevResp.text();
      const prev = parser(prevContents);

      const curResp = await clt.apiCall(
        `/2.0/repositories/${repo.owner}/${repo.name}/src/${curHash}/${curFpath}`,
      );
      const curContents = await curResp.text();
      const cur = parser(curContents);

      return {
        previous: prev,
        current: cur,
        diff: diff(prev, cur),
      };
    }
  }
}
