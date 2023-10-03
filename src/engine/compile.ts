// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import * as babel from "@babel/core";

const minifyCfg = {
  mangle: { exclude: "main" },
};

/**
 * The source language of the rule function. Determines compiler settings to ensure it can be compiled down to ES5.
 * @property ES5 The source is using ecmascript 5.
 * @property ES6 The source is using ecmascript 6.
 * @property Typescript The source is using Typescript.
 */
export enum RuleFnSourceLang {
  ES5 = "es5",
  ES6 = "es6",
  Typescript = "ts",
}

/**
 * Compiles the given rule function using Babel. The rule function can be provided as ES6.
 *
 * @param ruleFn A string containing the definition of a main function in ES6.
 * @param srcType What language the source is written in. If omitted, defaults to ES5.
 * @returns A string containing the ES5 version of the provided main function.
 */
export function compileRuleFn(
  ruleFn: string,
  srcLang?: RuleFnSourceLang,
): string {
  if (!srcLang || srcLang == RuleFnSourceLang.ES5) {
    return babelTransform(ruleFn, {
      presets: [["babel-preset-minify", minifyCfg]],
    });
  }

  if (srcLang == RuleFnSourceLang.Typescript) {
    // For typescript, we need two passes: once to compile TS to ES6, then ES6 to ES5.
    // So here, we just take care of compiling to ES6.
    // We also remove any lines surrounding the keyword "fensak remove-start" and "fensak remove-end" to support type imports.
    ruleFn = removeCommentSurroundedKeyword(ruleFn);
    ruleFn = babelTransform(ruleFn, {
      presets: ["@babel/preset-typescript"],
      filename: "rule.ts",
    });
  }

  // ruleFn is assumed to be in ES6 at this point.
  return babelTransform(ruleFn, {
    presets: ["@babel/preset-env", ["babel-preset-minify", minifyCfg]],
  });
}

function babelTransform(code: string, opts: babel.TransformOptions): string {
  const transformed = babel.transform(code, opts);
  if (!transformed) {
    throw new Error("Error compiling rule function");
  }

  const compiledCode = transformed.code;
  if (!compiledCode) {
    throw new Error("Error compiling rule function");
  }

  return compiledCode;
}

function removeCommentSurroundedKeyword(ruleFn: string): string {
  const out: string[] = [];
  const lines = ruleFn.split("\n");
  let ignore = false;
  for (const l of lines) {
    if (l === "// fensak remove-start") {
      ignore = true;
    } else if (l === "// fensak remove-end") {
      ignore = false;
    } else if (!ignore) {
      out.push(l);
    }
  }
  return out.join("\n");
}
