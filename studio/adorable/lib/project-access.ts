import { platformEnabled, platformProjectAccess } from "./platform-auth";
import { demoMode } from "./demo-mode";
import { listProjectVms } from "./project-vm";
import { projectAccess } from "./harness-access";
import { usesDatabaseStorage, readProjectMetadata } from "./project-storage";
export const authorizeProject = async (projectId: string, readOnly = false) => {
  if (platformEnabled()) return platformProjectAccess(projectId, readOnly);
  if (demoMode()) {
    if (usesDatabaseStorage()) {
      if (!/^vm-[a-z0-9]+$/.test(projectId)) return null;
      try {
        return await readProjectMetadata(projectId);
      } catch (error) {
        if (error instanceof Error && error.message === "Project not found")
          return null;
        throw error;
      }
    }
    const exists = (await listProjectVms()).some((vm) => vm.id === projectId);
    return exists ? readProjectMetadata(projectId) : null;
  }
  const access = await projectAccess(projectId, readOnly);
  return access ? readProjectMetadata(projectId) : null;
};
