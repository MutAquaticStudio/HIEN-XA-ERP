"use client";

import { useState } from "react";
import { operationsErpRegistry, type OperationsModuleId } from "@/modules/operations/erp-registry";
import { operationsActorRoleOptions, visibleModulesForRole } from "@/modules/operations/identity";
import type { UserRole } from "@/modules/operations/types";

type RoleModuleFieldsProps = {
  initialRole: UserRole;
  initialModuleIds: OperationsModuleId[];
  allowedRoles?: UserRole[];
  compact?: boolean;
};

export function RoleModuleFields({
  initialRole,
  initialModuleIds,
  allowedRoles = operationsActorRoleOptions.map((option) => option.id),
  compact = false
}: RoleModuleFieldsProps) {
  const [role, setRole] = useState(initialRole);
  const [selectedModuleIds, setSelectedModuleIds] = useState(() => new Set(initialModuleIds));
  const allowedModuleIds = new Set(visibleModulesForRole(role));
  const roleOptions = operationsActorRoleOptions.filter((option) => allowedRoles.includes(option.id));

  function changeRole(nextRole: UserRole) {
    setRole(nextRole);
    setSelectedModuleIds(new Set(visibleModulesForRole(nextRole)));
  }

  return (
    <div className={compact ? "role-module-fields role-module-fields-compact" : "role-module-fields"}>
      <label className="field">
        <span>Vai trò</span>
        <select name="role" value={role} onChange={(event) => changeRole(event.target.value as UserRole)}>
          {roleOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <fieldset className="module-permission-fieldset">
        <legend>Module được phép xem và thao tác</legend>
        <div className="module-permission-grid">
          {operationsErpRegistry.navigation.map((module) => {
            const allowed = allowedModuleIds.has(module.id);
            const checked = module.id === "overview" || (allowed && selectedModuleIds.has(module.id));
            return (
              <label className={allowed ? "module-check" : "module-check module-check-disabled"} key={module.id}>
                <input
                  type="checkbox"
                  name="moduleIds"
                  value={module.id}
                  checked={checked}
                  disabled={!allowed || module.id === "overview"}
                  onChange={(event) => {
                    setSelectedModuleIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) {
                        next.add(module.id);
                      } else {
                        next.delete(module.id);
                      }
                      return next;
                    });
                  }}
                />
                <span>{module.label}</span>
              </label>
            );
          })}
          <input type="hidden" name="moduleIds" value="overview" />
        </div>
      </fieldset>
    </div>
  );
}
