// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { expect, test } from "@jest/globals";
import { Octokit } from "@octokit/rest";

import { IPatch, PatchOp, LineOp, IObjectDiff } from "../engine/patch_types.ts";

import {
  IGitHubRepository,
  patchFromGitHubPullRequest,
} from "./from_github.ts";

const maybeToken = process.env.GITHUB_TOKEN;
let octokit: Octokit;
if (maybeToken) {
  octokit = new Octokit({ auth: maybeToken });
} else {
  octokit = new Octokit();
}
const testRepo: IGitHubRepository = {
  owner: "fensak-test",
  name: "test-fensak-rules-engine",
};

test("a single file change from GitHub is parsed correctly", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/1
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 1);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/bump-one-json",
    targetBranch: "main",
    linkedPRs: [],
  });
  expect(patches.patchList.length).toEqual(1);

  // Check top level patch
  const patch = patches.patchList[0];
  expect(patch.path).toEqual("appversions.json");
  expect(patch.op).toEqual(PatchOp.Modified);
  expect(patch.diff.length).toEqual(1);

  // Check patch hunks
  const hunk = patch.diff[0];
  expect(hunk.originalStart).toEqual(1);
  expect(hunk.originalLength).toEqual(5);
  expect(hunk.updatedStart).toEqual(1);
  expect(hunk.updatedLength).toEqual(5);
  expect(hunk.diffOperations).toEqual([
    {
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    },
    {
      op: LineOp.Modified,
      text: `  "subapp": "v1.1.0",`,
      newText: `  "subapp": "v1.2.0",`,
    },
    {
      op: LineOp.Untouched,
      text: `  "logapp": "v100.1.0"`,
      newText: "",
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
    coreapp: "v0.1.0",
    subapp: "v1.1.0",
    logapp: "v100.1.0",
  });
  expect(objDiff.current).toEqual({
    coreapp: "v0.1.0",
    subapp: "v1.2.0",
    logapp: "v100.1.0",
  });
  expect(objDiff.diff).toEqual([
    {
      type: "CHANGE",
      path: ["subapp"],
      value: "v1.2.0",
      oldValue: "v1.1.0",
    },
  ]);
});

test("multiple file changes from GitHub is parsed correctly", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/25
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 25);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/mult-files-with-bad",
    targetBranch: "main",
    linkedPRs: [],
  });
  expect(patches.patchList.length).toEqual(3);

  let jsonPatch: IPatch | null = null;
  let tfvarsPatch: IPatch | null = null;
  let tomlPatch: IPatch | null = null;
  for (const p of patches.patchList) {
    switch (p.path) {
      default:
        throw new Error(`Unexpected patch ${p.path}`);
        return;

      case "appversions.json":
        jsonPatch = p;
        break;
      case "appversions.tfvars":
        tfvarsPatch = p;
        break;
      case "appversions.toml":
        tomlPatch = p;
        break;
    }
  }

  expect(jsonPatch).not.toBeNull();
  expect(tfvarsPatch).not.toBeNull();
  expect(tomlPatch).not.toBeNull();

  // The following is impossible, but makes the type checker happy.
  if (jsonPatch === null || tfvarsPatch === null || tomlPatch === null) {
    throw new Error("impossible condition");
  }

  // Check JSON patch
  expect(jsonPatch.op).toEqual(PatchOp.Modified);
  expect(jsonPatch.diff.length).toEqual(1);
  const jsonHunk = jsonPatch.diff[0];
  expect(jsonHunk.originalStart).toEqual(1);
  expect(jsonHunk.originalLength).toEqual(5);
  expect(jsonHunk.updatedStart).toEqual(1);
  expect(jsonHunk.updatedLength).toEqual(5);
  expect(jsonHunk.diffOperations).toEqual([
    {
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    },
    {
      op: LineOp.Modified,
      text: `  "subapp": "v1.1.0",`,
      newText: `  "subapp": "v1.2.0",`,
    },
    {
      op: LineOp.Untouched,
      text: `  "logapp": "v100.1.0"`,
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: "}",
      newText: "",
    },
  ]);
  const maybeJSONObjDiff = jsonPatch.objectDiff;
  expect(maybeJSONObjDiff).not.toBeNull();
  const jsonObjDiff = maybeJSONObjDiff as IObjectDiff;
  expect(jsonObjDiff).toEqual({
    previous: {
      coreapp: "v0.1.0",
      subapp: "v1.1.0",
      logapp: "v100.1.0",
    },
    current: {
      coreapp: "v0.1.0",
      subapp: "v1.2.0",
      logapp: "v100.1.0",
    },
    diff: [
      {
        type: "CHANGE",
        path: ["subapp"],
        value: "v1.2.0",
        oldValue: "v1.1.0",
      },
    ],
  });

  // Check tfvars patch
  expect(tfvarsPatch.op).toEqual(PatchOp.Modified);
  expect(tfvarsPatch.diff.length).toEqual(1);
  const tfvarsHunk = tfvarsPatch.diff[0];
  expect(tfvarsHunk.originalStart).toEqual(1);
  expect(tfvarsHunk.originalLength).toEqual(3);
  expect(tfvarsHunk.updatedStart).toEqual(1);
  expect(tfvarsHunk.updatedLength).toEqual(3);
  expect(tfvarsHunk.diffOperations).toEqual([
    {
      op: LineOp.Untouched,
      text: `coreapp_version = "v0.1.0"`,
      newText: "",
    },
    {
      op: LineOp.Modified,
      text: `subapp_version  = "v1.1.0"`,
      newText: `subapp_version  = "v1.2.0"`,
    },
    {
      op: LineOp.Untouched,
      text: `logapp_version  = "v100.1.0"`,
      newText: "",
    },
  ]);
  expect(tfvarsPatch.objectDiff).toBeNull();

  // Check toml patch
  expect(tomlPatch.op).toEqual(PatchOp.Modified);
  expect(tomlPatch.diff.length).toEqual(1);
  const tomlHunk = tomlPatch.diff[0];
  expect(tomlHunk.originalStart).toEqual(1);
  expect(tomlHunk.originalLength).toEqual(3);
  expect(tomlHunk.updatedStart).toEqual(1);
  expect(tomlHunk.updatedLength).toEqual(3);
  expect(tomlHunk.diffOperations).toEqual([
    {
      op: LineOp.Modified,
      text: `coreapp = "v0.1.0"`,
      newText: `coreapp = "v0.2.0"`,
    },
    {
      op: LineOp.Untouched,
      text: `subapp = "v1.1.0"`,
      newText: "",
    },
    {
      op: LineOp.Untouched,
      text: `logapp = "v100.1.0"`,
      newText: "",
    },
  ]);
  const maybeTOMLObjDiff = tomlPatch.objectDiff;
  expect(maybeTOMLObjDiff).not.toBeNull();
  const tomlObjDiff = maybeTOMLObjDiff as IObjectDiff;
  expect(tomlObjDiff).toEqual({
    previous: {
      coreapp: "v0.1.0",
      subapp: "v1.1.0",
      logapp: "v100.1.0",
    },
    current: {
      coreapp: "v0.2.0",
      subapp: "v1.1.0",
      logapp: "v100.1.0",
    },
    diff: [
      {
        type: "CHANGE",
        path: ["coreapp"],
        value: "v0.2.0",
        oldValue: "v0.1.0",
      },
    ],
  });
});

test("extracts linked PRs in front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/39
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 39);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/one-linked",
    targetBranch: "main",
    linkedPRs: [
      {
        repo: "",
        prNum: 1,
        isMerged: false,
        isClosed: false,
      },
    ],
  });
});

test("extracts closed linked PRs in front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/40
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 40);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/one-linked-closed",
    targetBranch: "main",
    linkedPRs: [
      {
        repo: "",
        prNum: 38,
        isMerged: false,
        isClosed: true,
      },
    ],
  });
});

test("extracts merged linked PRs in front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/42
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 42);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/one-linked-merged",
    targetBranch: "main",
    linkedPRs: [
      {
        repo: "",
        prNum: 41,
        isMerged: true,
        isClosed: true,
      },
    ],
  });
});

test("extracts external linked PRs in front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/44
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 44);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/external-linked",
    targetBranch: "main",
    linkedPRs: [
      {
        repo: "terraform-null-testfensak",
        prNum: 1,
        isMerged: false,
        isClosed: true,
      },
    ],
  });
});

test("extracts multiple linked PRs in front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/43
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 43);
  expect(patches.metadata).toEqual({
    sourceBranch: "test/multiple-linked",
    targetBranch: "main",
    linkedPRs: [
      {
        repo: "",
        prNum: 1,
        isMerged: false,
        isClosed: false,
      },
      {
        repo: "",
        prNum: 38,
        isMerged: false,
        isClosed: true,
      },
      {
        repo: "",
        prNum: 41,
        isMerged: true,
        isClosed: true,
      },
    ],
  });
});

test("errors with bad front matter", async () => {
  // View PR at
  // https://github.com/fensak-test/test-fensak-rules-engine/pull/45
  expect(
    async () => await patchFromGitHubPullRequest(octokit, testRepo, 45),
  ).rejects.toThrow(TypeError);
});
