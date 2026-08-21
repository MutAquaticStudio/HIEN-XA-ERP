import { createBoundedContextHandler } from "./bounded-context-handler";

export const controlsCommandHandler = createBoundedContextHandler("controls", [
  "resolveImportIssue",
  "ignoreImportIssue"
]);
