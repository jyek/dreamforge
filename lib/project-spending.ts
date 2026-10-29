// Ledger charges are authoritative. Legacy token runs have only supplier cost
// estimates, so keep their model-priced value separate from actual deductions.
export type ModelSpending = {
  model: string;
  used_tokens: string;
  input_tokens: string;
  output_tokens: string;
  credit_cost_micros: string;
  estimated_credit_micros: string;
  legacy_runs: string;
};
export type ProjectSpending = Omit<ModelSpending, "model"> & {
  vm_id: string;
  project_name: string;
  models: ModelSpending[];
};
export function groupProjectSpending(
  rows: (ModelSpending & { vm_id: string; project_name: string })[],
): ProjectSpending[] {
  const projects = new Map<string, ProjectSpending>();
  const totals = [
    "used_tokens",
    "input_tokens",
    "output_tokens",
    "credit_cost_micros",
    "estimated_credit_micros",
    "legacy_runs",
  ] as const;
  for (const row of rows) {
    let project = projects.get(row.vm_id);
    if (!project) {
      project = {
        vm_id: row.vm_id,
        project_name: row.project_name || "Untitled project",
        models: [],
        used_tokens: "0",
        input_tokens: "0",
        output_tokens: "0",
        credit_cost_micros: "0",
        estimated_credit_micros: "0",
        legacy_runs: "0",
      };
      projects.set(row.vm_id, project);
    }
    for (const key of totals)
      project[key] = String(BigInt(project[key]) + BigInt(row[key] || "0"));
    if (row.model) project.models.push(row);
  }
  return [...projects.values()];
}
