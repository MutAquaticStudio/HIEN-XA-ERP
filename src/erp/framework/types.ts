export type ErpCommandKind = "create" | "workflow" | "posting" | "report";

export type ErpCommandCriticality = "normal" | "financial" | "inventory" | "compensation" | "import";

export type ErpCommandDefinition<CommandName extends string = string> = {
  name: CommandName;
  label: string;
  description: string;
  kind: ErpCommandKind;
  criticality: ErpCommandCriticality;
  permission: string;
  idempotent: boolean;
  auditEvent: string;
  transactionBoundary: "none" | "single_aggregate" | "cross_module";
};

export type ErpWorkflowTransition<CommandName extends string = string> = {
  from: string;
  to: string;
  command?: CommandName;
};

export type ErpWorkflowDefinition<CommandName extends string = string> = {
  name: string;
  entity: string;
  states: string[];
  transitions: ErpWorkflowTransition<CommandName>[];
};

export type ErpModuleDefinition<ModuleId extends string = string, CommandName extends string = string> = {
  id: ModuleId;
  technicalName: string;
  label: string;
  title: string;
  subtitle: string;
  iconKey: string;
  menuOrder: number;
  ownerContext: string;
  ownedEntities: string[];
  readModels: string[];
  commands: ErpCommandDefinition<CommandName>[];
  workflows: ErpWorkflowDefinition<CommandName>[];
  invariants: string[];
};

export type ErpNavigationItem<ModuleId extends string = string> = {
  id: ModuleId;
  label: string;
  title: string;
  subtitle: string;
  iconKey: string;
};
