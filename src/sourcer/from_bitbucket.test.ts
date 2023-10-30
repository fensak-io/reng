// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { expect, test } from "@jest/globals";

import { BitBucket } from "../bbstd/index.ts";
import { PatchOp, LineOp, IObjectDiff } from "../engine/patch_types.ts";

import type { Repository } from "./from.ts";
import { patchFromBitBucketPullRequest } from "./from_bitbucket.ts";

const bitbucket = new BitBucket();
const testRepo: Repository = {
  owner: "fensak-test",
  name: "test-fensak-automated-readme-only",
};

test("a single file change from BitBucket is parsed correctly", async () => {
  // View PR at
  // https://bitbucket.org/fensak-test/test-fensak-automated-readme-only/pull-requests/1
  const patches = await patchFromBitBucketPullRequest(bitbucket, testRepo, 1);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/update-readme",
    targetBranch: "main",
    linkedPRs: [],
  });
  expect(patches.patchList.length).toEqual(1);

  // Check top level patch
  const patch = patches.patchList[0];
  expect(patch.path).toEqual("README.md");
  expect(patch.op).toEqual(PatchOp.Modified);
  expect(patch.diff.length).toEqual(1);
  expect(patch.objectDiff).toBeNull();

  // Check patch hunks
  const hunk = patch.diff[0];
  expect(hunk.originalStart).toEqual(1);
  expect(hunk.originalLength).toEqual(3);
  expect(hunk.updatedStart).toEqual(1);
  expect(hunk.updatedLength).toEqual(5);
  expect(hunk.diffOperations).toEqual([
    {
      op: LineOp.Untouched,
      text: "# test-fensak-automated",
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: "",
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: "A test repo for automated testing.",
      newText: "",
    },
    {
      op: LineOp.Insert,
      text: "",
      newText: "",
    },
    {
      op: LineOp.Insert,
      text: "<!-- nonce change -->",
      newText: "",
    },
  ]);
});

test("single config file change from BitBucket is parsed correctly", async () => {
  // View PR at
  // https://bitbucket.org/fensak-test/test-fensak-automated-readme-only/pull-requests/2
  const patches = await patchFromBitBucketPullRequest(bitbucket, testRepo, 2);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/update-conf",
    targetBranch: "main",
    linkedPRs: [],
  });
  expect(patches.patchList.length).toEqual(1);

  // Check top level patch
  const patch = patches.patchList[0];
  expect(patch.path).toEqual("conf.json");
  expect(patch.op).toEqual(PatchOp.Modified);
  expect(patch.diff.length).toEqual(1);

  // Check patch hunks
  const hunk = patch.diff[0];
  expect(hunk.originalStart).toEqual(1);
  expect(hunk.originalLength).toEqual(3);
  expect(hunk.updatedStart).toEqual(1);
  expect(hunk.updatedLength).toEqual(3);
  expect(hunk.diffOperations).toEqual([
    {
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    },
    {
      op: LineOp.Modified,
      text: `  "my-config": true`,
      newText: `  "my-config": false`,
    },
    {
      op: LineOp.Untouched,
      text: "}",
      newText: "",
    },
  ]);

  // Check object diffs
  const maybeObjDiff = patch.objectDiff;
  expect(maybeObjDiff).not.toBeNull();
  const objDiff = maybeObjDiff as IObjectDiff;
  expect(objDiff.previous).toEqual({
    "my-config": true,
  });
  expect(objDiff.current).toEqual({
    "my-config": false,
  });
  expect(objDiff.diff).toEqual([
    {
      type: "CHANGE",
      path: ["my-config"],
      value: false,
      oldValue: true,
    },
  ]);
});
