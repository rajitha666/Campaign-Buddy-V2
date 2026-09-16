// Best-effort sync of an issue's triage stage onto a GitHub Projects v2 board.
// Labels are the source of truth for the pipeline; this is a visual mirror only,
// so any failure here is logged and swallowed rather than failing the run.
export function makeProjectSync({ github, owner, projectNumber, statusFieldName = 'Status' }) {
  if (!projectNumber) {
    return { syncIssueStatus: async () => {} };
  }

  let cache = null;

  async function loadProject() {
    if (cache) return cache;
    const data = await github.graphql(
      `query($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField { id name options { id name } }
              }
            }
          }
        }
      }`,
      { owner, number: projectNumber }
    );
    const project = data.user?.projectV2;
    if (!project) {
      throw new Error(`Project v2 #${projectNumber} not found for user ${owner}`);
    }
    const statusField = project.fields.nodes.find((f) => f?.name === statusFieldName);
    cache = { projectId: project.id, statusField };
    return cache;
  }

  async function ensureItem(contentId) {
    const { projectId } = await loadProject();
    const data = await github.graphql(
      `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
      }`,
      { projectId, contentId }
    );
    return data.addProjectV2ItemById.item.id;
  }

  return {
    async syncIssueStatus(issueNodeId, statusName) {
      try {
        const { projectId, statusField } = await loadProject();
        if (!statusField) {
          console.warn(`[project-sync] no "${statusFieldName}" single-select field on project #${projectNumber}`);
          return;
        }
        const option = statusField.options.find((o) => o.name === statusName);
        if (!option) {
          console.warn(`[project-sync] no "${statusName}" option on field "${statusFieldName}"`);
          return;
        }
        const itemId = await ensureItem(issueNodeId);
        await github.graphql(
          `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(
              input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId } }
            ) { projectV2Item { id } }
          }`,
          { projectId, itemId, fieldId: statusField.id, optionId: option.id }
        );
      } catch (err) {
        console.warn(`[project-sync] skipped: ${err.message}`);
      }
    },
  };
}
