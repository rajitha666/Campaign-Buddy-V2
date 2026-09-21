import type { TargetCategorization, TargetUnit } from '@/api/types';

// Label + value text for a promoter's target (Home, Sales Summary, Performance).
// The two fields are optional so an older server that only sends a bare
// `target` still renders as before ("Target", LKR).

export function targetLabel(categorization?: TargetCategorization): string {
  if (categorization === 'daily') return 'Daily target';
  if (categorization === 'monthly') return 'Monthly target';
  return 'Target';
}

export function targetValueText(target: number, unit?: TargetUnit): string {
  if (unit === 'unit_wise') return `${target.toLocaleString()} ${target === 1 ? 'unit' : 'units'}`;
  return `LKR ${target.toLocaleString()}`;
}
