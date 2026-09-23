import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repository root (…/mwanimlinzi). */
export const REPO_ROOT = path.resolve(here, '../../..');
export const MODELS_DIR = process.env.MODELS_DIR ? path.resolve(process.env.MODELS_DIR) : path.join(REPO_ROOT, 'ai', 'models');
export const DATASETS_DIR = process.env.DATASETS_DIR ? path.resolve(process.env.DATASETS_DIR) : path.join(REPO_ROOT, 'ai', 'datasets');

/** Model file paths are stored relative to the repo root; resolve safely (no traversal outside MODELS_DIR). */
export function resolveModelPath(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  const normalized = path.resolve(abs);
  if (!normalized.startsWith(path.resolve(MODELS_DIR))) throw new Error('Model path is outside the models directory');
  return normalized;
}
