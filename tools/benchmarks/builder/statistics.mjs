/** Nearest-rank p95, descriptive statistics only; never a significance claim. */
export function describe(values) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new TypeError('Expected nonempty finite nonnegative measurements');
  const sorted = [...values].sort((a, b) => a - b);
  const medianOf = (list) =>
    list.length % 2
      ? list[(list.length - 1) / 2]
      : (list[list.length / 2 - 1] + list[list.length / 2]) / 2;
  const median = medianOf(sorted);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
  return {
    count: values.length,
    min: sorted[0],
    max: sorted.at(-1),
    median,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    mean,
    medianAbsoluteDeviation: medianOf(
      values.map((value) => Math.abs(value - median)).sort((a, b) => a - b),
    ),
    sampleStandardDeviation: Math.sqrt(variance),
    coefficientOfVariation: mean === 0 ? null : Math.sqrt(variance) / mean,
    percentileMethod: 'nearest-rank',
  };
}

/** Keep invalid trials in evidence but refuse their admission to distributions. */
export function summarize(samples, { expectedCount, metric }) {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1)
    throw new TypeError('Invalid expectedCount');
  if (typeof metric !== 'string' || !metric) throw new TypeError('Missing metric');
  const ids = new Set();
  const admitted = [];
  const rejected = [];
  let cohort;
  for (const sample of samples) {
    if (typeof sample.id !== 'string' || !sample.id || ids.has(sample.id))
      throw new Error('Missing or duplicate sample ID');
    ids.add(sample.id);
    // A mode, workload, scenario, host lane and machine form one cohort. Different
    // cache states or corpus sizes may never silently share a distribution.
    const key = JSON.stringify(
      ['mode', 'workload', 'scenario', 'lane', 'machine', 'sourceDigest', 'fixtureDigest'].map(
        (field) => {
          if (typeof sample[field] !== 'string' || !sample[field])
            throw new Error(`Missing cohort field ${field}`);
          return sample[field];
        },
      ),
    );
    if (cohort && key !== cohort) throw new Error('Mixed benchmark cohorts');
    cohort = key;
    const reasons = [];
    if (!Array.isArray(sample.invalidations)) reasons.push('missing-invalidations');
    else for (const reason of sample.invalidations) reasons.push(`invalid:${String(reason)}`);
    if (sample.exitCode !== 0) reasons.push('exit');
    for (const field of [
      'correctnessPassed',
      'cleanupComplete',
      'exclusiveOwnership',
      'clockContinuous',
    ])
      if (sample[field] !== true) reasons.push(field);
    if (!Number.isFinite(sample.metrics?.[metric]) || sample.metrics[metric] < 0)
      reasons.push('metric');
    if (reasons.length) rejected.push({ id: sample.id, reasons });
    else admitted.push(sample);
  }
  if (admitted.length > expectedCount)
    throw new Error('More valid trials than preregistered count');
  return {
    complete: admitted.length === expectedCount,
    expectedCount,
    admittedIds: admitted.map(({ id }) => id),
    rejected,
    statistics: admitted.length ? describe(admitted.map((sample) => sample.metrics[metric])) : null,
    inference: 'Descriptive only; small differences are not evidence of statistical significance.',
  };
}

export function regression(reference, candidate, budget = 0.1) {
  if (
    ![reference, candidate, budget].every(Number.isFinite) ||
    reference < 0 ||
    candidate < 0 ||
    budget < 0
  )
    throw new TypeError('Invalid regression inputs');
  const ratio = reference === 0 ? (candidate === 0 ? 1 : null) : candidate / reference;
  return { ratio, investigationRequired: ratio === null || ratio > 1 + budget };
}
