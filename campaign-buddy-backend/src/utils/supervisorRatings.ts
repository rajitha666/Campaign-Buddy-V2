// Standard 1-5 scale a supervisor uses to score a promoter on every `range`
// checklist task. Fixed across campaigns so scores are comparable.
export const RATING_SCALE = [
  { value: 1, label: "Poor", description: "Well below standard. Needs immediate corrective action." },
  { value: 2, label: "Needs improvement", description: "Below standard. Clear gaps; follow-up required." },
  { value: 3, label: "Meets standard", description: "Acceptable. Meets the basic campaign requirement." },
  { value: 4, label: "Good", description: "Above standard. Only minor room for improvement." },
  { value: 5, label: "Excellent", description: "Outstanding. Sets the benchmark for other promoters." },
] as const;

export const MAX_TASK_IMAGES = 10;
