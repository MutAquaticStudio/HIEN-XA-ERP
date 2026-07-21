import type { ErpCommandDefinition, ErpModuleDefinition, ErpNavigationItem } from "./types";

export type ErpRegistry<ModuleId extends string = string, CommandName extends string = string> = {
  modules: ErpModuleDefinition<ModuleId, CommandName>[];
  navigation: ErpNavigationItem<ModuleId>[];
  commands: ErpCommandDefinition<CommandName>[];
  commandByName: Map<CommandName, ErpCommandDefinition<CommandName>>;
  moduleByCommand: Map<CommandName, ErpModuleDefinition<ModuleId, CommandName>>;
  moduleById: Map<ModuleId, ErpModuleDefinition<ModuleId, CommandName>>;
  permissionSet: Set<string>;
};

export function createErpRegistry<ModuleId extends string, CommandName extends string>(
  modules: ErpModuleDefinition<ModuleId, CommandName>[]
): ErpRegistry<ModuleId, CommandName> {
  const sortedModules = [...modules].sort((left, right) => left.menuOrder - right.menuOrder);
  const commandByName = new Map<CommandName, ErpCommandDefinition<CommandName>>();
  const moduleByCommand = new Map<CommandName, ErpModuleDefinition<ModuleId, CommandName>>();
  const moduleById = new Map<ModuleId, ErpModuleDefinition<ModuleId, CommandName>>();
  const permissionSet = new Set<string>();

  for (const module of sortedModules) {
    if (moduleById.has(module.id)) {
      throw new Error(`ERP module id bị trùng: ${module.id}`);
    }
    moduleById.set(module.id, module);

    for (const command of module.commands) {
      if (commandByName.has(command.name)) {
        throw new Error(`ERP command bị trùng: ${command.name}`);
      }
      commandByName.set(command.name, command);
      moduleByCommand.set(command.name, module);
      permissionSet.add(command.permission);
    }
  }

  return {
    modules: sortedModules,
    navigation: sortedModules.map((module) => ({
      id: module.id,
      label: module.label,
      title: module.title,
      subtitle: module.subtitle,
      iconKey: module.iconKey
    })),
    commands: sortedModules.flatMap((module) => module.commands),
    commandByName,
    moduleByCommand,
    moduleById,
    permissionSet
  };
}

export function getErpCommand<ModuleId extends string, CommandName extends string>(
  registry: ErpRegistry<ModuleId, CommandName>,
  commandName: CommandName
) {
  return registry.commandByName.get(commandName);
}

export function requireErpCommand<ModuleId extends string, CommandName extends string>(
  registry: ErpRegistry<ModuleId, CommandName>,
  commandName: CommandName
) {
  const command = getErpCommand(registry, commandName);
  if (!command) {
    throw new Error(`Command chưa được đăng ký trong ERP registry: ${commandName}`);
  }
  return command;
}

export function getErpModuleForCommand<ModuleId extends string, CommandName extends string>(
  registry: ErpRegistry<ModuleId, CommandName>,
  commandName: CommandName
) {
  return registry.moduleByCommand.get(commandName);
}

export function requireErpModule<ModuleId extends string, CommandName extends string>(
  registry: ErpRegistry<ModuleId, CommandName>,
  moduleId: ModuleId
) {
  const module = registry.moduleById.get(moduleId);
  if (!module) {
    throw new Error(`Module chưa được đăng ký trong ERP registry: ${moduleId}`);
  }
  return module;
}
