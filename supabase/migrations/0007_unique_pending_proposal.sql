CREATE UNIQUE INDEX idx_one_pending_proposal_per_group
  ON settlement_proposals(group_id)
  WHERE status = 'pending';
