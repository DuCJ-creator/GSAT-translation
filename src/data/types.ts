export interface PromptAnalysis {
  sentence1Chinese: string;
  sentence2Chinese: string;
  sentence1Analysis: {
    structures: string[];
    vocabulary: Array<{ word: string; translation: string; notes?: string }>;
    keys: string[];
  };
  sentence2Analysis: {
    structures: string[];
    vocabulary: Array<{ word: string; translation: string; notes?: string }>;
    keys: string[];
  };
  referenceTranslations1: string[];
  referenceTranslations2: string[];
  overallFulfillmentKeys: string[];
}

export interface TranslationError {
  originalSegment: string;
  suggestedSegment: string;
  errorType: 'Grammar' | 'Spelling' | 'Word Choice' | 'Structure' | 'Other';
  explanation: string;
  pointsDeducted: number;
}

export interface StudentGrading {
  seatNumber: number;
  status: 'present' | 'absent' | 'not_graded' | 'grading' | 'graded' | 'failed';
  ocrSentence1?: string;
  ocrSentence2?: string;
  score1?: number; // 0 to 4.0
  score2?: number; // 0 to 4.0
  totalScore?: number; // score1 + score2
  errors1?: TranslationError[];
  errors2?: TranslationError[];
  feedback1?: string;
  feedback2?: string;
  improvedVersion?: string;
  majorIssues?: string;
  studentInputImage?: string; // base64 representation to recall what was uploaded
  fileName?: string;
}

export interface ClassStatistics {
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  attendanceCount: number;
  absentCount: number;
  gradedCount: number;
  scoreRanges: {
    range: string; // "7.5-8.0", "6.0-7.0", etc.
    count: number;
  }[];
  commonErrors: {
    errorText: string;
    description: string;
    count: number;
  }[];
}
