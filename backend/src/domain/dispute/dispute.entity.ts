// Re-export the Phase 5 Dispute entity to keep import paths stable for new
// phase-8 callers without forcing churn on Phase 5 imports.
export type { Dispute, DisputeStatus } from '../match/match.entity.js';

export type DisputeResolution =
  | 'side_a_result_stands'
  | 'side_b_result_stands'
  | 'match_voided'
  | 'match_replay_required'
  | 'admin_decided_score';
