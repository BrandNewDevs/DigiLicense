const sensitiveQuestionPatterns = [
  /\b[6-9]\d{9}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/u,
  /\b[A-Z]{5}\d{4}[A-Z]\b/u,
  /\b(?:application|licen[cs]e|document|passport|aadhaar|pan)\s*(?:number|no\.?|id)?\s*[:#-]?\s*[A-Z0-9/-]{6,}\b/iu,
  /\b(?:upi|card|cvv|otp|transaction|payment reference)\b/iu,
  /\b(?:user|assistant|system)\s*:/iu,
] as const

function questionContainsSensitiveData(question: string): boolean {
  return sensitiveQuestionPatterns.some((pattern) => pattern.test(question))
}

export { questionContainsSensitiveData }
