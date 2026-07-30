const AUD_RECONCILIATION_TOLERANCE = 0.01;

function calculateReconciliation(
  account,
  transactions,
  tolerance = AUD_RECONCILIATION_TOLERANCE
) {
  const validNumber = (value) => (
    value !== null && value !== undefined
    && !(typeof value === 'string' && value.trim() === '')
    && Number.isFinite(Number(value))
  );
  const providerBalance = validNumber(account.balance) ? Number(account.balance) : NaN;
  const timestamp = (row) => {
    const value = row.provider_posted_at || row.post_date;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const hasInvalidEvidence = (transactions || []).some(
    (row) => !validNumber(row.amount) || !Number.isFinite(timestamp(row))
  );
  const ordered = (transactions || [])
    .filter((row) => validNumber(row.amount) && Number.isFinite(timestamp(row)))
    .sort((a, b) => {
      return timestamp(a) - timestamp(b) || Number(a.transaction_id) - Number(b.transaction_id);
    });
  const anchorIndex = ordered.findIndex((row) => validNumber(row.balance_after));
  const reconciled = anchorIndex >= 0 ? ordered.slice(anchorIndex) : [];
  const ambiguousOrder = reconciled.some(
    (row, index) => index > 0 && timestamp(row) === timestamp(reconciled[index - 1])
  );
  if (
    !Number.isFinite(providerBalance)
    || !reconciled.length
    || ambiguousOrder
    || hasInvalidEvidence
  ) {
    return {
      account_reference: account.account_reference,
      provider_balance: Number.isFinite(providerBalance) ? providerBalance : null,
      calculated_balance: null, difference: null, status: 'insufficient_data',
      transaction_count: reconciled.length,
      anchor_transaction_id: reconciled.length && !ambiguousOrder && !hasInvalidEvidence
        ? reconciled[0].transaction_id : null,
    };
  }
  const anchor = reconciled[0];
  const calculated = Number(anchor.balance_after)
    + reconciled.slice(1).reduce((sum, row) => sum + Number(row.amount), 0);
  const difference = providerBalance - calculated;
  return {
    account_reference: account.account_reference,
    provider_balance: providerBalance,
    calculated_balance: calculated,
    difference,
    status: Math.abs(difference) <= tolerance + 1e-9 ? 'matched' : 'mismatch',
    transaction_count: reconciled.length,
    anchor_transaction_id: anchor.transaction_id,
  };
}

module.exports = { AUD_RECONCILIATION_TOLERANCE, calculateReconciliation };
