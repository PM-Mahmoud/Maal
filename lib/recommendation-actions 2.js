const RANKING_VERSION = 'action-ranking-v1';
const RANKING_FORMULA = '((impact × 0.4) + (urgency × 0.3) + ((6 − effort) × 0.3)) × confidence ÷ 5 × 20';
const clampRating = (value) => Math.max(1, Math.min(5, Math.round(Number(value) || 1)));

function rankActions(actions) {
  return (actions || []).map((action, index) => {
    const impact = clampRating(action.impact);
    const urgency = clampRating(action.urgency);
    const confidence = clampRating(action.confidence);
    const effort = clampRating(action.effort);
    const score = Math.round(((impact * 0.4) + (urgency * 0.3) + ((6 - effort) * 0.3)) * (confidence / 5) * 20 * 10) / 10;
    return { ...action, impact, urgency, confidence, effort, rank_score: score, ranking: { methodology_version: RANKING_VERSION, formula: RANKING_FORMULA }, _index: index };
  }).sort((a, b) => b.rank_score - a.rank_score || String(a.key || '').localeCompare(String(b.key || '')) || a._index - b._index)
    .map(({ _index, ...action }, index) => ({ ...action, rank: index + 1 }));
}

const ACTIONS = {
  savings: { title: 'Strengthen your savings buffer', category: 'cash', impact: 5, urgency: 5, confidence: 5, effort: 3 },
  debt: { title: 'Reduce your effective debt load', category: 'debt', impact: 5, urgency: 5, confidence: 5, effort: 4 },
  super: { title: 'Review your super contribution path', category: 'super', impact: 4, urgency: 3, confidence: 4, effort: 3 },
  wealth: { title: 'Improve your wealth trajectory', category: 'wealth', impact: 4, urgency: 3, confidence: 3, effort: 4 },
  protection: { title: 'Close protection and planning gaps', category: 'protection', impact: 4, urgency: 4, confidence: 4, effort: 3 },
};

function actionsFromHealthRules(rules) {
  const actions = (rules || []).filter((rule) => rule.status !== 'healthy').map((rule) => {
    const template = ACTIONS[rule.key] || { title: `Review ${rule.key}`, category: 'general', impact: 3, urgency: 3, confidence: 3, effort: 3 };
    const needsData = rule.status === 'needs_data';
    return {
      key: rule.key, source_key: `health:${rule.key}`, category: template.category,
      title: needsData ? `Complete the data for ${rule.key}` : template.title,
      description: needsData ? 'Add the missing financial details so Maal can assess this area without fallbacks.' : rule.explanation,
      rationale: rule.explanation || 'This financial-health rule needs attention.',
      impact: needsData ? 3 : template.impact, urgency: needsData ? 3 : template.urgency,
      confidence: needsData ? 5 : template.confidence, effort: needsData ? 1 : template.effort,
      baseline: { value: needsData ? null : (rule.observed?.value ?? null), unit: rule.observed?.unit || null, captured_from: 'maal-health-rules-v1' },
      target: rule.target || null,
    };
  });
  return rankActions(actions);
}

module.exports = { rankActions, actionsFromHealthRules, RANKING_VERSION, RANKING_FORMULA };
