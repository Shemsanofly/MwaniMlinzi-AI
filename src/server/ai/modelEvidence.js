/** A production prediction must have field-data provenance and held-out evaluation. */
export function hasFieldEvidence(model) {
  return model?.syntheticData === false
    && model.dataset === 'field-outcomes'
    && Number.isInteger(model.trainingRecords) && model.trainingRecords > 0
    && Number.isInteger(model.testRecords) && model.testRecords > 0;
}

export function validProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
