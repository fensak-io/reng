// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { expect, test } from "@jest/globals";

import { PatchOp } from "./patch_types.ts";
import { runRule, RuleLogMode, RuleLogLevel } from "./interpreter.ts";
import { compileRuleFn, RuleFnSourceLang } from "./compile.ts";

const nullMeta = {
  sourceBranch: "foo",
  targetBranch: "bar",
};

test("sanity check", async () => {
  const ruleFn = `function main(inp, metadata) {
  return inp.length === 1 && metadata.sourceBranch === "foo";
}
`;
  const result = await runRule(
    ruleFn,
    [
      {
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      },
    ],
    nullMeta,
  );
  expect(result.approve).toBe(true);
});

// Check that the old rules that don't accept changeSetMetadata still works
test("sanity check old version", async () => {
  const ruleFn = `function main(inp) {
  return inp.length === 1;
}
`;
  const result = await runRule(
    ruleFn,
    [
      {
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      },
    ],
    nullMeta,
  );
  expect(result.approve).toBe(true);
});

test("ES5 minify", async () => {
  const rawRuleFn = `function main(inp, metadata) {
  return inp.length === 1 && metadata.sourceBranch === "foo";
}
`;
  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.ES5);
  const result = await runRule(
    ruleFn,
    [
      {
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      },
    ],
    nullMeta,
  );
  expect(result.approve).toBe(true);
});

test("ES6 support", async () => {
  const rawRuleFn = `function main(inp, metadata) {
  const l = inp.length;
  return l === 1 && metadata.sourceBranch === "foo";
}
`;

  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.ES6);
  const result = await runRule(
    ruleFn,
    [
      {
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      },
    ],
    nullMeta,
  );
  expect(result.approve).toBe(true);
});

test("TS support", async () => {
  const rawRuleFn = `
// fensak remove-start
import type { IPatch, IChangeSetMetadata } from "@fensak-io/reng";
// fensak remove-end

function main(inp: IPatch[], metadata: IChangeSetMetadata) {
  const l: number = inp.length;
  return l === 1 && metadata.sourceBranch === "foo";
}
`;

  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.Typescript);
  const result = await runRule(
    ruleFn,
    [
      {
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      },
    ],
    nullMeta,
  );
  expect(result.approve).toBe(true);
});

test("basic logging", async () => {
  const ruleFn = `function main(inp, metadata) {
  console.log("hello world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], nullMeta, opts);
  expect(result.approve).toBe(false);
  expect(result.logs).toEqual([
    {
      level: RuleLogLevel.Info,
      msg: "hello world",
    },
  ]);
});

test("logging with multiple objects", async () => {
  const ruleFn = `function main(inp, metadata) {
  console.log("hello", "world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], nullMeta, opts);
  expect(result.approve).toBe(false);
  expect(result.logs).toEqual([
    {
      level: RuleLogLevel.Info,
      msg: "hello world",
    },
  ]);
});

test("logging order", async () => {
  const ruleFn = `function main(inp, metadata) {
  console.log("hello");
  console.log("world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], nullMeta, opts);
  expect(result.approve).toBe(false);
  expect(result.logs).toEqual([
    {
      level: RuleLogLevel.Info,
      msg: "hello",
    },
    {
      level: RuleLogLevel.Info,
      msg: "world",
    },
  ]);
});

test("logging warn level", async () => {
  const ruleFn = `function main(inp, metadata) {
  console.warn("hello");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], nullMeta, opts);
  expect(result.approve).toBe(false);
  expect(result.logs).toEqual([
    {
      level: RuleLogLevel.Warn,
      msg: "hello",
    },
  ]);
});

test("logging error level", async () => {
  const ruleFn = `function main(inp, metadata) {
  console.error("hello");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], nullMeta, opts);
  expect(result.approve).toBe(false);
  expect(result.logs).toEqual([
    {
      level: RuleLogLevel.Error,
      msg: "hello",
    },
  ]);
});

test("main return must be boolean", async () => {
  const ruleFn = `function main(inp, metadata) {
  return "hello world";
}
`;
  await expect(runRule(ruleFn, [], nullMeta)).rejects.toThrow(
    "main function must return boolean",
  );
});

test("infinite loop", async () => {
  const ruleFn = `function main(inp, metadata) {
  while (true) {}
  return "hello world";
}
`;
  await expect(runRule(ruleFn, [], nullMeta)).rejects.toThrow(
    "user defined rule timed out",
  );
}, 10000);

test("XMLHTTPRequest not supported", async () => {
  const ruleFn = `function main(inp, metadata) {
  var req = new XMLHttpRequest();
  req.addEventListener("readystatechange", function() {
    if (req.readyState === 4 && req.status === 200) {
      setOutput("false");
    }
  });
  req.open("GET", inp[0].id);
  req.send();
  return true;
}`;

  await expect(
    runRule(
      ruleFn,
      [
        {
          contentsID: "http://example.com/example.txt",
          path: "foo.txt",
          op: PatchOp.Insert,
          additions: 0,
          deletions: 0,
          diff: [],
        },
      ],
      nullMeta,
    ),
  ).rejects.toThrow("XMLHttpRequest is not defined");
});

test("fetch is not supported", async () => {
  const ruleFn = `function main(inp) {
  fetch(inp[0].id).then(function(response) {
    setOutput("false");
  });
  return true
}`;

  await expect(
    runRule(
      ruleFn,
      [
        {
          contentsID: "http://example.com/example.txt",
          path: "foo.txt",
          op: PatchOp.Insert,
          additions: 0,
          deletions: 0,
          diff: [],
        },
      ],
      nullMeta,
    ),
  ).rejects.toThrow("fetch is not defined");
});

test("process is not supported", async () => {
  const ruleFn = `function main(inp) {
  console.log(process.env)
  return true
}`;

  await expect(
    runRule(
      ruleFn,
      [
        {
          contentsID: "helloworld",
          path: "foo.txt",
          op: PatchOp.Insert,
          additions: 0,
          deletions: 0,
          diff: [],
        },
      ],
      nullMeta,
    ),
  ).rejects.toThrow("process is not defined");
});

test("Deno is not supported", async () => {
  const ruleFn = `function main(inp) {
  console.log(Deno.env)
  return true
}`;

  await expect(
    runRule(
      ruleFn,
      [
        {
          contentsID: "helloworld",
          path: "foo.txt",
          op: PatchOp.Insert,
          additions: 0,
          deletions: 0,
          diff: [],
        },
      ],
      nullMeta,
    ),
  ).rejects.toThrow("Deno is not defined");
});
