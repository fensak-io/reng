// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import type { Difference } from "microdiff";

/**
 * The operation on a line in a hunk of a patch.
 * @property Unknown Unknown operation.
 * @property Insert The line was inserted in this hunk.
 * @property Delete The line was deleted in this hunk .
 * @property Modified The line was modified in this hunk.
 * @property Untouched The line was not touched in this hunk. This is usually provided to provide context.
 */
export enum LineOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
  Untouched = "untouched",
}

/**
 * Represents updates to a single line in a hunk.
 * @property op The operation that was done to the line in the hunk.
 * @property text The text context for the operation. For insert operations, this is the line to insert; for delete
 *                operations, this is the line to delete; for modifications this is the original text.
 * @property newText The updated text for modifications. Only set if op is LineOp.Modified.
 */
export interface ILineDiff {
  op: LineOp;
  text: string;
  newText: string; // Only set if op is LineOp.Modified
}

/**
 * Represents updates to a section of the file in a patch.
 * @property originalStart The starting line in the original file (before the change) where the hunk applies.
 * @property originalLength The number of lines after the start in the original file where the hunk applies.
 * @property updatedStart The starting line in the updated file (before the change) where the hunk applies.
 * @property updatedLength The number of lines after the start in the updated file where the hunk applies.
 * @property diffOperations The list of modifications to apply to the source file in the range to get the updated file.
 */
export interface IHunk {
  originalStart: number;
  originalLength: number;
  updatedStart: number;
  updatedLength: number;
  diffOperations: ILineDiff[];
}

/**
 * The operation on the file in the patch.
 * @property Unknown Unknown operation.
 * @property Insert The file was inserted in this patch.
 * @property Delete The file was deleted in this patch.
 * @property Modified The file was modified in this patch.
 */
export enum PatchOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
}

/**
 * Represents updates to a single file that was done in the change set.
 * @property path The relative path (from the root of the repo) to the file that was updated in the patch.
 * @property op The operation that was done on the file in the patch.
 * @property additions The number of lines that were added in this patch.
 * @property deletions The number of lines that were removed in this patch.
 * @property diff The list of diffs, organized into hunks.
 * @property objectDiff If the file represents a parsable data file (e.g., json, yaml, toml), this will contain the object level diff.
 */
export interface IPatch {
  path: string;
  op: PatchOp;
  additions: number;
  deletions: number;
  diff: IHunk[];
  objectDiff: IObjectDiff | null;
}

/**
 * Represents a diff of the object representation of a file. The specific diff returns a list of object patches that
 * contains the keys that were added, removed, or updated. Note that the difference is only populated for updated
 * objects - if the file was inserted or deleted, then the diff will be empty.
 * @property previous The object representation of the data in the file before the change.
 * @property current The object representation of the data in the file after the change.
 * @property diff The difference across the two objects.
 */
export interface IObjectDiff {
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  previous: any;
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  current: any;
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  diff: Difference[];
}

/**
 * Represents another PR that this PR is linked to. A linked PR can be used to represent a dependency where the upstream PR needs to be merged before this PR should be merged.
 * @property repo The name of the repository (in the same organization) where the linked PR is located. Blank if the
 *                same repo.
 * @property prNum The PR number of the linked PR.
 * @property isMerged Whether the linked PR has been merged.
 * @property isClosed Whether the linked PR has been closed. Note that a merged PR is also closed.
 */
export interface ILinkedPR {
  repo: string;
  prNum: number;
  isMerged: boolean;
  isClosed: boolean;
}

/**
 * Represents metadata about the change set that is under evaluation.
 * @property sourceBranch The branch that the change set originates from.
 * @property targetBranch The branch that the change set is merging into.
 * @property linkedPRs The list of PRs that this PR is linked to.
 */
export interface IChangeSetMetadata {
  sourceBranch: string;
  targetBranch: string;
  linkedPRs: ILinkedPR[];
}

// A convenient const for test cases to initialize a blank changeset metadata.
export const emptyChangeSetMetadata: IChangeSetMetadata = {
  sourceBranch: "",
  targetBranch: "",
  linkedPRs: [],
};
