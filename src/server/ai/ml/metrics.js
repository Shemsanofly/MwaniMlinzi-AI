/** Classification metrics computed on held-out data. Nothing here is estimated or hard-coded. */
export function evaluate(yTrue, yProb, threshold = 0.5) {
  let tp = 0; let fp = 0; let tn = 0; let fn = 0;
  yTrue.forEach((t, i) => {
    const p = yProb[i] >= threshold ? 1 : 0;
    if (p === 1 && t === 1) tp += 1;
    else if (p === 1 && t === 0) fp += 1;
    else if (p === 0 && t === 0) tn += 1;
    else fn += 1;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = yTrue.length ? (tp + tn) / yTrue.length : 0;
  return {
    precision: r4(precision), recall: r4(recall), f1: r4(f1), accuracy: r4(accuracy),
    rocAuc: r4(auc(yTrue, yProb)),
    positiveRate: r4(yTrue.filter((v) => v === 1).length / (yTrue.length || 1)),
    support: yTrue.length,
    threshold,
    confusionMatrix: { tp, fp, tn, fn },
  };
}

function auc(yTrue, yProb) {
  const pairs = yTrue.map((t, i) => [yProb[i], t]).sort((a, b) => a[0] - b[0]);
  const pos = yTrue.filter((v) => v === 1).length;
  const neg = yTrue.length - pos;
  if (!pos || !neg) return 0;
  let rankSum = 0;
  pairs.forEach(([, t], i) => { if (t === 1) rankSum += i + 1; });
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

const r4 = (v) => Math.round(v * 10000) / 10000;
