// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

// The use of globalThis in here is gross, but it's an artifact of JS-Interpreter being a library designed for use in
// the browser. As such, we have to pollute the globalThis environment to use it properly.
declare global {
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  var Interpreter: any;
  // eslint-disable-next-line no-var,@typescript-eslint/no-explicit-any
  var acorn: any;
}

import "JS-Interpreter/interpreter.js";
import * as acorn from "JS-Interpreter/acorn.js";
globalThis.acorn = acorn;

import { Octokit } from "@octokit/rest";

import { IChangeSetMetadata, IPatch } from "./patch_types.ts";

// Max time in milliseconds for the user defined rule to run. Any UDR functions that take longer than this will throw an error.
const maxUDRRuntime = 5000;
// Sleep every 100 steps to yield to other tasks.
const maxStepIterationsBeforeSleep = 100;
const sleepBetweenStepIterations = 100;

/**
 * The client objects to use for fetching the file contents.
 * @property github The authenticated Octokit client that should be used to fetch the file contents for GitHub.
 */
export interface IFileFetchClients {
  github: Octokit;
}

export enum RuleLogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

/**
 * The logging mode of the rules interpreter.
 * @property Drop Drop all messages.
 * @property Console Log to the native console.
 * @property Capture Capture the log entries into memory and return it.
 */
export enum RuleLogMode {
  Drop = "drop",
  Console = "console",
  Capture = "capture",
}

/**
 * Options for the rule interpreter engine.
 * @property logMode The logging mode that the interpreter should operate in.
 */
export interface IRuleInterpreterOpts {
  logMode?: RuleLogMode;
}

/**
 * Log entry from the rule function.
 * @property level The log level.
 * @property msg The log message.
 */
export interface IRuleLogEntry {
  level: RuleLogLevel;
  msg: string;
}

/**
 * The results of running a rule.
 * @property approve Whether to approve the change.
 * @property logs A list of log entries.
 */
export interface IRuleResult {
  approve: boolean;
  logs: IRuleLogEntry[];
}

/**
 * Execute the given user defined rule function in JavaScript (EcmaScript 5) against the given patch object.
 *
 * @param ruleFn A string containing the definition of a main function that takes in the patch object and returns a bool
 *               indicating if the patch passes the rule (and thus should allow auto-merge).
 * @param patch A list of patch objects to evaluate the rule against.
 * @param changeSetMetadata Metadata about the change set that is useful for constructing approval rules.
 * @param opts Optional parameters that configure the behavior of the rule engine.
 * @returns A boolean indicating whether the given patch passes the user defined rule.
 */
export function runRule(
  ruleFn: string,
  patchList: IPatch[],
  changeSetMetadata: IChangeSetMetadata,
  // TODO: add support for fetching the contents of files
  opts?: IRuleInterpreterOpts,
): Promise<IRuleResult> {
  const code = `${ruleFn}
var inp = JSON.parse(getInput());
var out = main(inp.patches, inp.metadata);
if (typeof out !== "boolean") {
  throw new Error("main function must return boolean (returned " + out + ")");
}
setOutput(JSON.stringify(out));
`;

  let logMode = RuleLogMode.Drop;
  if (opts && opts.logMode) {
    logMode = opts.logMode;
  }

  const result: IRuleResult = {
    approve: false,
    logs: [],
  };
  const interpreter = new globalThis.Interpreter(
    code,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (interpreter: any, scope: any) => {
      // Setup the console object so that the user functions can emit debug logs for introspection.
      const nativeConsole = interpreter.createObjectProto(
        interpreter.OBJECT_PROTO,
      );
      interpreter.setProperty(
        nativeConsole,
        "log",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interpreter.createNativeFunction((...objs: any[]) => {
          switch (logMode) {
            case RuleLogMode.Console:
              console.log(...objs);
              break;
            case RuleLogMode.Capture:
              result.logs.push({
                level: RuleLogLevel.Info,
                msg: objsToString(objs),
              });
              break;
          }
        }),
      );
      interpreter.setProperty(
        nativeConsole,
        "info",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interpreter.createNativeFunction((...objs: any[]) => {
          switch (logMode) {
            case RuleLogMode.Console:
              console.info(...objs);
              break;
            case RuleLogMode.Capture:
              result.logs.push({
                level: RuleLogLevel.Info,
                msg: objsToString(objs),
              });
              break;
          }
        }),
      );
      interpreter.setProperty(
        nativeConsole,
        "debug",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interpreter.createNativeFunction((...objs: any[]) => {
          switch (logMode) {
            case RuleLogMode.Console:
              console.debug(...objs);
              break;
            case RuleLogMode.Capture:
              result.logs.push({
                level: RuleLogLevel.Debug,
                msg: objsToString(objs),
              });
              break;
          }
        }),
      );
      interpreter.setProperty(
        nativeConsole,
        "warn",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interpreter.createNativeFunction((...objs: any[]) => {
          switch (logMode) {
            case RuleLogMode.Console:
              console.warn(...objs);
              break;
            case RuleLogMode.Capture:
              result.logs.push({
                level: RuleLogLevel.Warn,
                msg: objsToString(objs),
              });
              break;
          }
        }),
      );
      interpreter.setProperty(
        nativeConsole,
        "error",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interpreter.createNativeFunction((...objs: any[]) => {
          switch (logMode) {
            case RuleLogMode.Console:
              console.error(...objs);
              break;
            case RuleLogMode.Capture:
              result.logs.push({
                level: RuleLogLevel.Error,
                msg: objsToString(objs),
              });
              break;
          }
        }),
      );
      interpreter.setProperty(scope, "console", nativeConsole);

      // Setup getInput and getOutput inline so that they can access the patch object and output variable to message
      // pass between the main thread and the interpreter.
      interpreter.setProperty(
        scope,
        "getInput",
        interpreter.createNativeFunction((): string => {
          return JSON.stringify({
            patches: patchList,
            metadata: changeSetMetadata,
          });
        }),
      );
      interpreter.setProperty(
        scope,
        "setOutput",
        interpreter.createNativeFunction((jsonOut: string) => {
          result.approve = JSON.parse(jsonOut);
        }),
      );
    },
  );

  // Use REGEXP_MODE = 1 since some clients (e.g., Deno) doesn't support REGEXP_MODE = 2
  interpreter.REGEXP_MODE = 1;

  // Use a promise so that we can implement timeouts. This routine ensures that the interpreter runs the code
  // concurrently in the background and gives the main thread a chance to catch runaway execution so that it can be
  // stopped.
  const outputPromise = new Promise<IRuleResult>((resolve, reject) => {
    (async () => {
      let rejected = false;
      let sleeping: NodeJS.Timeout | null = null;
      const tout = setTimeout(() => {
        if (sleeping) {
          clearTimeout(sleeping);
        }
        rejected = true;
        reject(new Error("user defined rule timed out"));
      }, maxUDRRuntime);

      let iterations = 0;
      try {
        while (interpreter.step()) {
          if (rejected) {
            return;
          }
          iterations++;
          // Every max step iterations, sleep to yield to other threads and then reset the counter
          if (iterations > maxStepIterationsBeforeSleep) {
            await new Promise(
              (resolve) =>
                (sleeping = setTimeout(resolve, sleepBetweenStepIterations)),
            );
            iterations = 0;
          }
        }
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        clearTimeout(tout);
      }
    })();
  });
  return outputPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objsToString(objs: any[]): string {
  const msgs: string[] = [];
  for (const o of objs) {
    msgs.push(`${o}`);
  }
  return msgs.join(" ");
}
