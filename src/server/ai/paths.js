import path from 'node:path';

/** Repository root (…/MwaniMlinzi-AI). Next.js, Jest and the scripts all run from the repo root. */
export const REPO_ROOT = process.env.MWANI_REPO_ROOT ? path.resolve(process.env.MWANI_REPO_ROOT) : process.cwd();
export const MODELS_DIR = process.env.MODELS_DIR ? path.resolve(process.env.MODELS_DIR) : path.join(REPO_ROOT, 'ai', 'models');
export const DATASETS_DIR = process.env.DATASETS_DIR ? path.resolve(process.env.DATASETS_DIR) : path.join(REPO_ROOT, 'ai', 'datasets');

/** Model file paths are stored relative to the repo root; resolve safely (no traversal outside MODELS_DIR). */
export function resolveModelPath(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  const normalized = path.resolve(abs);
  const root = path.resolve(MODELS_DIR);
  // Compare with a trailing separator so e.g. /data/models_backup cannot pass as /data/models.
  if (!normalized.startsWith(root + path.sep)) throw new Error('Model path is outside the models directory');
  return normalized;
}
