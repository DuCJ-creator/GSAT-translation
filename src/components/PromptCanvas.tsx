import React, { useState, useEffect } from "react";
import { DEMO_PROMPTS } from "../data/demoSubmissions";
import { PromptAnalysis, SubQuestionPrompt } from "../types";
import { LangType } from "../lib/translations";
import { BookOpen, Sparkles, AlertCircle, CheckCircle2, RefreshCw, Zap, Sliders, Plus, Trash2, Award } from "lucide-react";

interface PromptCanvasProps {
  onAnalysisGenerated: (analysis: PromptAnalysis) => void;
  currentAnalysis: PromptAnalysis | null;
  lang?: LangType;
}

interface QuestionInput {
  chinese: string;
  reference: string;
}

export default function PromptCanvas({ onAnalysisGenerated, currentAnalysis, lang = "bilingual" }: PromptCanvasProps) {
  const [examMode, setExamMode] = useState<"exam" | "practice">("exam");
  const [answerMode, setAnswerMode] = useState<"direct" | "ai">("direct");
  const [questionCount, setQuestionCount] = useState<number>(2);

  // Sub-questions input list
  const [questions, setQuestions] = useState<QuestionInput[]>([
    {
      chinese: DEMO_PROMPTS[0].sentence1Chinese,
      reference: "Many students feel anxious and confused when choosing a university department."
    },
    {
      chinese: DEMO_PROMPTS[0].sentence2Chinese,
      reference: "However, through self-exploration and consulting experts, they can make a more appropriate decision."
    }
  ]);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState<boolean>(true);

  // Sync mode and question count when mode changes
  const handleModeChange = (newMode: "exam" | "practice") => {
    setExamMode(newMode);
    setError(null);
    if (newMode === "exam") {
      setQuestionCount(2);
      setQuestions(prev => {
        const sliced = prev.slice(0, 2);
        while (sliced.length < 2) {
          sliced.push({
            chinese: DEMO_PROMPTS[0].sentence1Chinese,
            reference: "Many students feel anxious and confused when choosing a university department."
          });
        }
        return sliced;
      });
    } else {
      // Practice mode default 3 questions or current length
      if (questions.length < 1) {
        setQuestions([
          { chinese: "題目一：學測英文翻譯模擬測試第一題。", reference: "Question 1: Sample reference answer." },
          { chinese: "題目二：學測英文翻譯模擬測試第二題。", reference: "Question 2: Sample reference answer." },
          { chinese: "題目三：學測英文翻譯模擬測試第三題。", reference: "Question 3: Sample reference answer." }
        ]);
        setQuestionCount(3);
      }
    }
  };

  const handleCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(10, newCount));
    setQuestionCount(clamped);
    setQuestions(prev => {
      const copy = [...prev];
      if (clamped > copy.length) {
        for (let i = copy.length; i < clamped; i++) {
          copy.push({
            chinese: `練習題 ${i + 1}：請在此輸入題目語意中文。`,
            reference: `Question ${i + 1} reference answer sample.`
          });
        }
      } else {
        copy.splice(clamped);
      }
      return copy;
    });
  };

  // Auto-collapse setting when prompt analysis has loaded
  useEffect(() => {
    if (currentAnalysis) {
      setShowConfig(false);
      if (currentAnalysis.examMode) setExamMode(currentAnalysis.examMode);
      if (currentAnalysis.answerMode) setAnswerMode(currentAnalysis.answerMode);
      if (currentAnalysis.questionCount) setQuestionCount(currentAnalysis.questionCount);
    } else {
      setShowConfig(true);
    }
  }, [currentAnalysis]);

  const handleAnalyzeOrSave = async () => {
    // Validate inputs
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].chinese.trim()) {
        setError(`請填寫第 ${i + 1} 題的中文題目！`);
        return;
      }
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      if (answerMode === "direct") {
        // ⚡ 直接提供參考答案 - 免 API Token!
        const subQuestionsData: SubQuestionPrompt[] = questions.map((q, idx) => ({
          id: idx + 1,
          chinese: q.chinese.trim(),
          referenceTranslations: q.reference.trim()
            ? [q.reference.trim()]
            : [`Standard reference translation for Q${idx + 1}`],
          analysis: {
            structures: ["S + V + O / Modifiers"],
            vocabulary: [
              { word: "Key vocabulary", translation: "核心詞彙/片語", notes: "請注意搭配詞與時態" }
            ],
            keys: [`第 ${idx + 1} 題評分參考點：依據教師所提供之標準參考答案進行精準對比。`]
          }
        }));

        const s1Ref = subQuestionsData[0]?.referenceTranslations || [];
        const s2Ref = subQuestionsData[1]?.referenceTranslations || s1Ref;

        const analysis: PromptAnalysis = {
          examMode,
          answerMode: "direct",
          questionCount: questions.length,
          subQuestions: subQuestionsData,
          sentence1Chinese: questions[0]?.chinese || "",
          sentence2Chinese: questions[1]?.chinese || questions[0]?.chinese || "",
          sentence1Analysis: subQuestionsData[0]?.analysis || { structures: [], vocabulary: [], keys: [] },
          sentence2Analysis: subQuestionsData[1]?.analysis || { structures: [], vocabulary: [], keys: [] },
          referenceTranslations1: s1Ref,
          referenceTranslations2: s2Ref,
          overallFulfillmentKeys: [
            `【${examMode === "exam" ? "大考模式 (固定2題組)" : `練習模式 (自訂${questions.length}題)`}】：每題獨立占 4.0 分，總滿分為 ${(questions.length * 4.0).toFixed(1)} 分。`,
            "【直接提供參考答案 (免 Token)】：系統直接使用您設定的標準解答進行校對批改，無需消耗 API Token。"
          ]
        };

        onAnalysisGenerated(analysis);
      } else {
        // 🤖 AI 自動分析與生成解答 - 呼叫 API
        const subQuestionStrings = questions.map(q => q.chinese);
        const res = await fetch("/api/analyze-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examMode,
            answerMode: "ai",
            questionCount: questions.length,
            subQuestions: subQuestionStrings,
            sentence1: questions[0]?.chinese,
            sentence2: questions[1]?.chinese
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP 錯誤碼: ${res.status}`);
        }

        const data: PromptAnalysis = await res.json();
        // Enrich data with modes
        data.examMode = examMode;
        data.answerMode = "ai";
        data.questionCount = questions.length;
        if (!data.subQuestions || data.subQuestions.length === 0) {
          data.subQuestions = questions.map((q, idx) => ({
            id: idx + 1,
            chinese: q.chinese,
            referenceTranslations: idx === 0 ? data.referenceTranslations1 : idx === 1 ? data.referenceTranslations2 : [q.reference || "Standard reference"],
            analysis: idx === 0 ? data.sentence1Analysis : idx === 1 ? data.sentence2Analysis : { structures: [], vocabulary: [], keys: [] }
          }));
        }
        onAnalysisGenerated(data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "無法解析考題，請確認網路或 API 設定。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div id="prompt-setup-container" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="bg-slate-950 p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-sm tracking-tight text-slate-100">
            {lang === "zh" ? "考題模式設定與評分標準" : lang === "en" ? "Exam Mode & Benchmark Settings" : "考題模式設定與評分標準 (Exam Mode & Rubrics)"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
            examMode === "exam" ? "bg-emerald-900 text-emerald-200 border border-emerald-700" : "bg-cyan-900 text-cyan-200 border border-cyan-700"
          }`}>
            {examMode === "exam" ? "🎓 大考模式 (固定2題)" : `✏️ 練習模式 (自訂${questionCount}題)`}
          </span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
            answerMode === "direct" ? "bg-amber-900 text-amber-200 border border-amber-700" : "bg-purple-900 text-purple-200 border border-purple-700"
          }`}>
            {answerMode === "direct" ? "⚡ 免 Token / 直接參考答案" : "🤖 AI 分析模式"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {currentAnalysis && !showConfig ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1.5 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  當前考題與答案設定
                </span>
                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  {currentAnalysis.examMode === "practice" ? `練習模式 (${currentAnalysis.questionCount || questions.length} 題)` : "大考模式 (固定 2 題)"}
                </span>
                <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  {currentAnalysis.answerMode === "direct" ? "⚡ 直接提供參考答案 (免 Token)" : "🤖 AI 自動生成答案"}
                </span>
              </div>
              <div className="font-sans text-slate-700 space-y-1">
                {(currentAnalysis.subQuestions || []).map((q, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 mt-0.5">
                      Q{idx + 1}
                    </span>
                    <div className="truncate font-semibold text-slate-800" title={q.chinese}>
                      {q.chinese}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="text-teal-700 hover:text-white font-bold flex items-center gap-1.5 py-1.5 px-3.5 rounded bg-white hover:bg-teal-600 border border-slate-200 cursor-pointer text-xs shrink-0 transition-all shadow-xs hover:shadow-sm"
            >
              ✏️ 重新設定考題與模式
            </button>
          </div>
        ) : (
          <>
            {/* 1. Mode Selection Bar */}
            <div className="bg-slate-100/80 p-1.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleModeChange("exam")}
                className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  examMode === "exam"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <Award className="w-4 h-4 text-emerald-600" />
                <span>🎓 大考模式</span>
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">(固定2題組, 滿分8分)</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("practice")}
                className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  examMode === "practice"
                    ? "bg-white text-cyan-800 shadow-xs border border-cyan-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <Sliders className="w-4 h-4 text-cyan-600" />
                <span>✏️ 練習模式</span>
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">(自訂題數, 每題4分)</span>
              </button>
            </div>

            {/* Practice Mode Settings bar if in Practice Mode */}
            {examMode === "practice" && (
              <div className="bg-cyan-50/70 border border-cyan-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cyan-900">⚙️ 練習模式設定 - 考題數量：</span>
                  <div className="flex items-center border border-cyan-300 rounded-md bg-white overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={() => handleCountChange(questionCount - 1)}
                      disabled={questionCount <= 1}
                      className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-extrabold disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 font-mono font-bold text-cyan-900 text-xs">
                      {questionCount} 題
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCountChange(questionCount + 1)}
                      disabled={questionCount >= 10}
                      className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-extrabold disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-cyan-700 font-semibold">
                  總分：{(questionCount * 4.0).toFixed(1)} 分 (每題 4.0 分)
                </span>
              </div>
            )}

            {/* 2. Answer Method Switcher */}
            <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>參考答案獲取方式：</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnswerMode("direct")}
                  className={`px-3 py-1.5 rounded-md font-bold transition-all text-xs cursor-pointer ${
                    answerMode === "direct"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-250 hover:bg-slate-50"
                  }`}
                >
                  ⚡ 直接提供參考答案 (免 API Token)
                </button>

                <button
                  type="button"
                  onClick={() => setAnswerMode("ai")}
                  className={`px-3 py-1.5 rounded-md font-bold transition-all text-xs cursor-pointer ${
                    answerMode === "ai"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-250 hover:bg-slate-50"
                  }`}
                >
                  🤖 AI 自行生成解答
                </button>
              </div>
            </div>

            {/* 3. Preset Selector Dropdown */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {lang === "zh" ? "💡 快速載入經典大考題庫與標準答案：" : "💡 Quick Load Exam Prompts:"}
              </span>
              <select
                onChange={(e) => {
                  const selected = DEMO_PROMPTS.find(p => p.id === e.target.value);
                  if (selected) {
                    if (examMode === "exam") {
                      setQuestions([
                        {
                          chinese: selected.sentence1Chinese,
                          reference: selected.id === "univ"
                            ? "Many students feel anxious and lost when choosing a university department."
                            : selected.id === "climate"
                            ? "In recent years, extreme weather has caused severe impacts on global agriculture."
                            : "In the era of social media, protecting personal privacy has become more difficult than ever."
                        },
                        {
                          chinese: selected.sentence2Chinese,
                          reference: selected.id === "univ"
                            ? "However, through self-exploration and consulting experts, they can make a more appropriate decision."
                            : selected.id === "climate"
                            ? "We must take concrete actions to ensure the stability of the food supply."
                            : "Therefore, users should remain highly vigilant when sharing personal information online."
                        }
                      ]);
                    } else {
                      // Practice mode
                      setQuestions(prev => {
                        const copy = [...prev];
                        if (copy[0]) {
                          copy[0].chinese = selected.sentence1Chinese;
                          copy[0].reference = "Sample standard reference translation for question 1.";
                        }
                        if (copy[1]) {
                          copy[1].chinese = selected.sentence2Chinese;
                          copy[1].reference = "Sample standard reference translation for question 2.";
                        }
                        return copy;
                      });
                    }
                    setError(null);
                  }
                }}
                defaultValue="univ"
                className="text-xs bg-white border border-slate-250 hover:border-slate-300 rounded-md px-2 py-1.5 font-bold text-slate-850 focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full sm:w-auto"
              >
                {DEMO_PROMPTS.map(p => (
                  <option key={p.id} value={p.id}>{p.tag}</option>
                ))}
              </select>
            </div>

            {/* 4. Question Input List */}
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={idx} className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-mono">
                        {idx + 1}
                      </span>
                      <span>第 {idx + 1} 題 (Question {idx + 1})</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">
                      配分：4.0 分
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">
                      【題目中文語意】:
                    </label>
                    <textarea
                      value={q.chinese}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuestions(prev => {
                          const copy = [...prev];
                          copy[idx].chinese = val;
                          return copy;
                        });
                      }}
                      rows={2}
                      className="w-full text-xs p-2 rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-white"
                      placeholder={`請輸入第 ${idx + 1} 題的中文題目...`}
                    />
                  </div>

                  {answerMode === "direct" && (
                    <div>
                      <label className="text-[10px] font-bold text-amber-700 mb-0.5 block flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        【標準參考答案】(免 Token 直採模式 - 可直接輸入或修改對照英文答案)：
                      </label>
                      <textarea
                        value={q.reference}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuestions(prev => {
                            const copy = [...prev];
                            copy[idx].reference = val;
                            return copy;
                          });
                        }}
                        rows={2}
                        className="w-full text-xs p-2 rounded-md border border-amber-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500 bg-amber-50/30 font-mono text-slate-800"
                        placeholder={`例如：Standard reference translation for question ${idx + 1}...`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Error Messaging */}
            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="whitespace-pre-wrap leading-relaxed font-normal">{error}</div>
              </div>
            )}

            {/* Action Submit Button */}
            <button
              onClick={handleAnalyzeOrSave}
              disabled={isAnalyzing}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isAnalyzing
                  ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                  : answerMode === "direct"
                  ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                  : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
              }`}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                  {answerMode === "direct" ? "正在處理並載入題目與解答..." : "正在調用學術 AI 進行多維度分析中..."}
                </>
              ) : answerMode === "direct" ? (
                <>
                  <Zap className="w-4 h-4 fill-amber-300" />
                  <span>完成設定 (⚡ 免 API Token 直接使用參考答案)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>設定考題並啟動 🤖 AI 關鍵點分析</span>
                </>
              )}
            </button>
          </>
        )}

        {/* Prompt Canvas Output View */}
        {currentAnalysis && (
          <div className="border-t border-slate-100 pt-3.5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>考題與標準解答設定完成</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-bold">
                {currentAnalysis.examMode === "practice" ? `練習模式 (${currentAnalysis.questionCount} 題, 滿分 ${(currentAnalysis.questionCount! * 4).toFixed(1)}分)` : "大考模式 (固定 2 題, 滿分 8.0分)"}
              </span>
            </div>

            {/* List all sub-questions analysis */}
            {(currentAnalysis.subQuestions || []).map((q, idx) => (
              <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono">Q{idx + 1}</span>
                    <span className="font-semibold">{q.chinese}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">4.0 Pts</span>
                </div>

                {q.referenceTranslations && q.referenceTranslations.length > 0 && (
                  <div className="bg-slate-900 text-slate-100 p-2.5 rounded-md font-mono text-[11px] space-y-1">
                    <div className="text-[9px] text-emerald-400 font-bold uppercase">標準參考解答 (Reference Translation)：</div>
                    {q.referenceTranslations.map((refText, rIdx) => (
                      <p key={rIdx} className="text-slate-200 select-all leading-relaxed">
                        [{rIdx + 1}] {refText}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Keys & Rubric */}
            {currentAnalysis.overallFulfillmentKeys && (
              <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg space-y-1 text-xs">
                <div className="text-[11px] font-bold text-teal-800 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>評分與作答重點摘要：</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[10px] text-teal-700 leading-normal">
                  {currentAnalysis.overallFulfillmentKeys.map((k, idx) => (
                    <li key={idx}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
