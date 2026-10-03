import { train, predictProba } from '../../src/ai/ml/logisticRegression.js';
import { evaluate } from '../../src/ai/ml/metrics.js';
import { toVector, ML_FEATURES } from '../../src/ai/ml/featureVector.js';

describe('logistic regression + metrics', () => {
  test('learns a separable problem', () => {
    const X = []; const y = [];
    for (let i = 0; i < 200; i += 1) { const v = (i % 20) / 10; X.push([v, 1 - v]); y.push(v > 1 ? 1 : 0); }
    const model = train(X, y, { epochs: 800 });
    expect(predictProba(model, [1.9, -0.9])).toBeGreaterThan(0.8);
    expect(predictProba(model, [0.1, 0.9])).toBeLessThan(0.2);
  });

  test('metrics are computed from the confusion matrix', () => {
    const m = evaluate([1, 1, 0, 0, 1, 0], [0.9, 0.2, 0.1, 0.7, 0.8, 0.3]);
    expect(m.confusionMatrix).toEqual({ tp: 2, fp: 1, tn: 2, fn: 1 });
    expect(m.precision).toBeCloseTo(2 / 3, 3);
    expect(m.recall).toBeCloseTo(2 / 3, 3);
    expect(m.accuracy).toBeCloseTo(4 / 6, 3);
  });

  test('feature vector imputes missing values', () => {
    const v = toVector({ sstC: 28 });
    expect(v).toHaveLength(ML_FEATURES.length);
    expect(v[0]).toBe(28);
    expect(v.every(Number.isFinite)).toBe(true);
  });
});
