import type { ErpModuleDefinition } from "./types";

export type OdooFieldType =
  | "char"
  | "text"
  | "boolean"
  | "integer"
  | "float"
  | "monetary"
  | "date"
  | "datetime"
  | "selection"
  | "many2one"
  | "one2many";

export type OdooFieldDefinition = {
  name: string;
  label: string;
  type: OdooFieldType;
  relation?: string;
  required?: boolean;
  readonly?: boolean;
};

export type OdooModelDefinition = {
  model: string;
  name: string;
  moduleId: string;
  entity: string;
  fields: OdooFieldDefinition[];
};

export type OdooWindowAction = {
  xmlId: string;
  name: string;
  resModel: string;
  viewModes: Array<"kanban" | "tree" | "form" | "pivot" | "graph" | "activity">;
  domain: string;
  context: Record<string, string | number | boolean>;
  moduleId: string;
};

export type OdooMenuItem = {
  xmlId: string;
  name: string;
  sequence: number;
  parentXmlId?: string;
  actionXmlId?: string;
  moduleId?: string;
};

export type OdooSecurityGroup = {
  xmlId: string;
  name: string;
  category: string;
  impliedIds: string[];
};

export type OdooRecordRule = {
  xmlId: string;
  name: string;
  model: string;
  domain: string;
  groups: string[];
  permissions: {
    read: boolean;
    write: boolean;
    create: boolean;
    unlink: boolean;
  };
};

export type OdooMetadata = {
  addonName: string;
  rootMenu: OdooMenuItem;
  models: OdooModelDefinition[];
  actions: OdooWindowAction[];
  menus: OdooMenuItem[];
  groups: OdooSecurityGroup[];
  recordRules: OdooRecordRule[];
  actionByModuleId: Map<string, OdooWindowAction>;
  modelByEntity: Map<string, OdooModelDefinition>;
};

export function createOdooMetadata<ModuleId extends string, CommandName extends string>(
  modules: ErpModuleDefinition<ModuleId, CommandName>[],
  addonName = "vlxd_operations"
): OdooMetadata {
  const rootMenu: OdooMenuItem = {
    xmlId: `${addonName}.menu_root`,
    name: "VLXD",
    sequence: 10
  };
  const models = modules.flatMap((module) =>
    module.ownedEntities.map((entity) => createModelDefinition(module.id, entity))
  );
  const modelByEntity = new Map(models.map((model) => [model.entity, model]));
  const actions = modules.map((module) => createWindowAction(addonName, module, modelByEntity));
  const actionByModuleId = new Map(actions.map((action) => [action.moduleId, action]));
  const menus = modules.map((module) => ({
    xmlId: `${addonName}.menu_${toSnakeCase(module.id)}`,
    name: module.label,
    sequence: module.menuOrder,
    parentXmlId: rootMenu.xmlId,
    actionXmlId: actionByModuleId.get(module.id)?.xmlId,
    moduleId: module.id
  }));

  return {
    addonName,
    rootMenu,
    models,
    actions,
    menus,
    groups: createSecurityGroups(addonName),
    recordRules: createRecordRules(addonName, models),
    actionByModuleId,
    modelByEntity
  };
}

function createModelDefinition(moduleId: string, entity: string): OdooModelDefinition {
  return {
    model: toOdooModelName(entity),
    name: titleFromEntity(entity),
    moduleId,
    entity,
    fields: commonFieldsForEntity(entity)
  };
}

function createWindowAction<ModuleId extends string, CommandName extends string>(
  addonName: string,
  module: ErpModuleDefinition<ModuleId, CommandName>,
  modelByEntity: Map<string, OdooModelDefinition>
): OdooWindowAction {
  const primaryEntity = module.ownedEntities[0];
  const resModel = primaryEntity ? modelByEntity.get(primaryEntity)?.model ?? toOdooModelName(primaryEntity) : "vlxd.reporting.dashboard";

  return {
    xmlId: `${addonName}.action_${toSnakeCase(module.id)}`,
    name: module.title,
    resModel,
    viewModes: viewModesForModule(module.id),
    domain: "[]",
    context: {
      search_default_active: true,
      vlxd_module: module.id
    },
    moduleId: module.id
  };
}

function createSecurityGroups(addonName: string): OdooSecurityGroup[] {
  return [
    { xmlId: `${addonName}.group_owner`, name: "Owner", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_accountant`, name: "Accountant", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_sales`, name: "Sales", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_warehouse`, name: "Warehouse", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_dispatcher`, name: "Dispatcher", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_driver`, name: "Driver", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_worker`, name: "Worker", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_supervisor`, name: "Supervisor", category: "VLXD", impliedIds: [] },
    { xmlId: `${addonName}.group_viewer`, name: "Viewer", category: "VLXD", impliedIds: [] }
  ];
}

function createRecordRules(addonName: string, models: OdooModelDefinition[]): OdooRecordRule[] {
  return models.map((model) => ({
    xmlId: `${addonName}.rule_${model.model.replace(/\./g, "_")}_company`,
    name: `${model.name}: company data`,
    model: model.model,
    domain: "[('company_id', 'in', user.company_ids.ids)]",
    groups: [`${addonName}.group_owner`],
    permissions: {
      read: true,
      write: true,
      create: true,
      unlink: false
    }
  }));
}

function commonFieldsForEntity(entity: string): OdooFieldDefinition[] {
  const fields: OdooFieldDefinition[] = [
    { name: "name", label: "Name", type: "char", required: true },
    { name: "active", label: "Active", type: "boolean" },
    { name: "company_id", label: "Company", type: "many2one", relation: "res.company", required: true },
    { name: "state", label: "Status", type: "selection", readonly: true }
  ];

  if (entity.includes("Ledger") || entity.includes("Payment") || entity.includes("Compensation")) {
    fields.push({ name: "amount_total", label: "Total", type: "monetary", readonly: true });
  }
  if (entity.includes("Order") || entity.includes("Job") || entity.includes("Issue")) {
    fields.push({ name: "date", label: "Date", type: "date", required: true });
  }

  return fields;
}

function viewModesForModule(moduleId: string): OdooWindowAction["viewModes"] {
  if (moduleId === "reporting") {
    return ["pivot", "graph", "tree"];
  }
  if (moduleId === "overview") {
    return ["kanban", "activity", "tree"];
  }
  return ["tree", "form", "kanban", "activity"];
}

export function toOdooModelName(entity: string) {
  return `vlxd.${entity
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/_/g, ".")
    .toLowerCase()}`;
}

function titleFromEntity(entity: string) {
  return entity.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}
