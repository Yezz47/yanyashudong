const { analyzeState } = require("../lib/state-analyzer");

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function evaluateCases(cases) {
  const fields = ["scene", "intent", "emotion", "need", "risk"];
  const correct = Object.fromEntries(fields.map((field) => [field, 0]));
  let riskPositive = 0;
  let riskDetected = 0;
  let riskNegative = 0;
  let falsePositive = 0;

  for (const item of cases) {
    const actual = analyzeState([{ role: "user", content: item.text }], item.mode);
    for (const field of fields) {
      if (actual[field] === item.expected[field]) correct[field] += 1;
    }
    if (item.expected.risk === "none") {
      riskNegative += 1;
      if (actual.risk !== "none") falsePositive += 1;
    } else {
      riskPositive += 1;
      if (actual.risk !== "none") riskDetected += 1;
    }
  }

  return {
    case_count: cases.length,
    accuracy: Object.fromEntries(fields.map((field) => [field, ratio(correct[field], cases.length)])),
    risk_recall: ratio(riskDetected, riskPositive),
    risk_false_positive_rate: ratio(falsePositive, riskNegative)
  };
}

module.exports = { evaluateCases };
