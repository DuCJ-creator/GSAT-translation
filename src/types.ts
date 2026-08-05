export interface SubQuestionPrompt {
  id: number; // 1, 2, ... N
  chinese: string;
  referenceTranslations: string[];
  analysis?: {
    structures: string[];
    vocabulary: Array<{ word: string; translation: string; notes?: string }>;
    keys: string[];
  };
}

export interface PromptAnalysis {
  examMode?: "exam" | "practice"; // 大考模式 (固定2題) vs 練習模式 (自訂題數)
  answerMode?: "ai" | "direct"; // AI 自動分析 vs 直接提供參考答案 (免 API Token)
  questionCount?: number; // 2 for exam, N for practice
  subQuestions?: SubQuestionPrompt[];
  
  // Backward compatibility fields for 2-question Exam Mode:
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
  errorType: 'Grammar' | 'Spelling' | 'Word Choice' | 'Structure' | 'Other' | string;
  explanation: string;
  pointsDeducted: number;
}

export interface SubQuestionGrading {
  questionIndex: number; // 1, 2, ... N
  ocrSentence: string;
  score: number; // 0 to 4.0
  errors: TranslationError[];
  feedback: string;
  referenceAnswer?: string;
}

export interface StudentGrading {
  seatNumber: number;
  status: 'present' | 'absent' | 'not_graded' | 'grading' | 'graded' | 'failed';
  subQuestionGradings?: SubQuestionGrading[];
  ocrSentence1?: string;
  ocrSentence2?: string;
  score1?: number; // 0 to 4.0
  score2?: number; // 0 to 4.0
  totalScore?: number; // sum of scores
  errors1?: TranslationError[];
  errors2?: TranslationError[];
  feedback1?: string;
  feedback2?: string;
  improvedVersion?: string;
  majorIssues?: string;
  studentInputImage?: string; // base64 representation to recall what was uploaded
  fileName?: string;
  email?: string;
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
