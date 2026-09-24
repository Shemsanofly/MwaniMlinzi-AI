/**
 * Minimal, dependency-free logistic regression (batch gradient descent, L2, class weighting).
 * Chosen over TensorFlow.js for the MVP: no native binaries, deterministic, fully inspectable.
 */
const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function standardize(X) {
  const d = X[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (const row of X) row.forEach((v, j) => { means[j] += v / X.length; });
  for (const row of X) row.forEach((v, j) => { stds[j] += (v - means[j]) ** 2 / X.length; });
  for (let j = 0; j < d; j += 1) stds[j] = Math.sqrt(stds[j]) || 1;
  return { means, stds };
}

export const applyScaling = (row, { means, stds }) => row.map((v, j) => (v - means[j]) / stds[j]);

export function train(X, y, { epochs = 1500, learningRate = 0.2, l2 = 0.001, balance = true } = {}) {
  const scaling = standardize(X);
  const Xs = X.map((r) => applyScaling(r, scaling));
  const n = Xs.length;
  const d = Xs[0].length;
  const pos = y.filter((v) => v === 1).length;
  const wPos = balance && pos > 0 ? n / (2 * pos) : 1;
  const wNeg = balance && n - pos > 0 ? n / (2 * (n - pos)) : 1;
  const weights = new Array(d).fill(0);
  let bias = 0;
  let loss = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grad = new Array(d).fill(0);
    let gBias = 0;
    loss = 0;
    for (let i = 0; i < n; i += 1) {
      let z = bias;
      for (let j = 0; j < d; j += 1) z += weights[j] * Xs[i][j];
      const p = sigmoid(z);
      const w = y[i] === 1 ? wPos : wNeg;
      const err = (p - y[i]) * w;
      for (let j = 0; j < d; j += 1) grad[j] += err * Xs[i][j];
      gBias += err;
      loss += -w * (y[i] * Math.log(p + 1e-12) + (1 - y[i]) * Math.log(1 - p + 1e-12));
    }
    for (let j = 0; j < d; j += 1) weights[j] -= learningRate * (grad[j] / n + l2 * weights[j]);
    bias -= learningRate * (gBias / n);
  }
  return { weights, bias, ...scaling, finalLoss: loss / n };
}

export function predictProba(model, row) {
  const xs = applyScaling(row, model);
  let z = model.bias;
  for (let j = 0; j < xs.length; j += 1) z += model.weights[j] * xs[j];
  return sigmoid(z);
}
