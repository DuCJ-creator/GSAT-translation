import React, { useState } from "react";
import { DEMO_PROMPTS, DemoPrompt } from "../data/demoSubmissions";
import { PromptAnalysis } from "../types";
import { LangType, getTranslation } from "../lib/translations";
import { BookOpen, Sparkles, AlertCircle, ChevronRight, CheckCircle2, RefreshCw } from "lucide-react";

interface PromptCanvasProps {
  onAnalysisGenerated: (analysis: PromptAnalysis) => void;
  currentAnalysis: PromptAnalysis | null;
  lang?: LangType;
}

export default function PromptCanvas({ onAnalysisGenerated, currentAnalysis, lang = "bilingual" }: PromptCanvasProps) {
  const [sentence1, setSentence1] = useState<string>("");
  const [sentence2, setSentence2] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!sentence1.trim() || !sentence2.trim()) {
      setError("請填寫完整的兩句中文翻譯題目！");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence1, sentence2 })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP 錯誤碼: ${res.status}`);
      }

      const data: PromptAnalysis = await res.json();
      onAnalysisGenerated(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "無法分析題幹，請確認您的伺服器連線與 API 金鑰狀態。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div id="prompt-setup-container" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="bg-slate-950 p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 height-5 text-emerald-400" />
          <h2 className="font-semibold text-sm tracking-tight text-slate-100">
            {lang === "zh" ? "翻譯考題與學術分析" : lang === "en" ? "Translation Prompts & Benchmarks" : "翻譯考題與學術分析 (Translation Prompts & Benchmarks)"}
          </h2>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-300 py-0.5 px-2 rounded">Taiwan GSAT Assessment</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Input Textboxes */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                {lang === "zh" ? "中文第一句" : lang === "en" ? "Sentence 1 (Ch)" : "中文第一句 (Sentence 1)"}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Weight: 4.0 Pts</span>
            </div>
            <textarea
              value={sentence1}
              onChange={(e) => {
                setSentence1(e.target.value);
              }}
              rows={2}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              placeholder={lang === "en" ? "Enter Chinese Sentence 1" : "例如：許多學生在選擇大學學系時會感到焦慮與迷惘。"}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">
                {lang === "zh" ? "中文第二句" : lang === "en" ? "Sentence 2 (Ch)" : "中文第二句 (Sentence 2)"}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Weight: 4.0 Pts</span>
            </div>
            <textarea
              value={sentence2}
              onChange={(e) => {
                setSentence2(e.target.value);
              }}
              rows={2}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-outline focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              placeholder={lang === "en" ? "Enter Chinese Sentence 2" : "例如：然而，透過自我探索和諮詢專家，他們能做出更合適的決定。"}
            />
          </div>
        </div>

        {/* Error messaging */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={`w-full py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            isAnalyzing
              ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
          }`}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              {lang === "zh" ? "正在調用學術 Gemini AI 進行多維度分析中..." : lang === "en" ? "Calling specialized Gemini AI for multi-dimensional analysis..." : "正在調用學術 Gemini AI 進行多維度分析中 (Analyzing with Gemini AI...)"}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {lang === "zh" ? "設定考題並啟動 AI 關鍵點分析" : lang === "en" ? "Set Prompt & Fire AI Metric Parsing" : "設定考題並啟動 AI 關鍵點分析 (Set Prompt & Analyze)"}
            </>
          )}
        </button>

        {/* Prompt Canvas Output */}
        {currentAnalysis ? (
          <div className="border-t border-slate-100 pt-3.5 space-y-4">
            <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-xs border-b border-slate-100 pb-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>
                {lang === "zh" ? "考題分析結果已成功輸出於 Canvas" : lang === "en" ? "Linguistic and rubric parameters populated on Canvas" : "考題分析結果已成功輸出於 Canvas ( Listic Metrics Synchronized )"}
              </span>
            </div>

            {/* Sentence 1 analysis */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[9px]">S1</span>
                <span>{currentAnalysis.sentence1Chinese}</span>
              </div>
              
              {/* structures */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-slate-500">
                  {lang === "zh" ? "建議句型結構：" : lang === "en" ? "Suggested Syntactic Structures:" : "建議句型結構 (Suggested Syntactic Structures):"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {currentAnalysis.sentence1Analysis.structures.map((s, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-800 border border-blue-100 text-[10px] px-2 py-0.5 rounded-sm font-mono">{s}</span>
                  ))}
                </div>
              </div>

              {/* vocabulary */}
              <div className="space-y-1 mt-1.5">
                <div className="text-[10px] font-semibold text-slate-500">
                  {lang === "zh" ? "核心片語與詞彙：" : lang === "en" ? "Core Lexicons & Phrases:" : "核心片語與詞彙 (Core Lexicons & Phrases):"}
                </div>
                <div className="bg-white border border-slate-100 rounded-md overflow-hidden text-[10px]">
                  {currentAnalysis.sentence1Analysis.vocabulary.map((v, idx) => (
                    <div key={idx} className="flex justify-between p-1.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <span className="font-semibold text-slate-800 font-mono">{v.word}</span>
                      <span className="text-slate-600 font-medium">{v.translation}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sentence 2 analysis */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[9px]">S2</span>
                <span>{currentAnalysis.sentence2Chinese}</span>
              </div>
              
              {/* structures */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-slate-500">
                  {lang === "zh" ? "建議句型結構：" : lang === "en" ? "Suggested Syntactic Structures:" : "建議句型結構 (Suggested Syntactic Structures):"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {currentAnalysis.sentence2Analysis.structures.map((s, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-800 border border-blue-100 text-[10px] px-2 py-0.5 rounded-sm font-mono">{s}</span>
                  ))}
                </div>
              </div>

              {/* vocabulary */}
              <div className="space-y-1 mt-1.5">
                <div className="text-[10px] font-semibold text-slate-500">
                  {lang === "zh" ? "核心片語與詞彙：" : lang === "en" ? "Core Lexicons & Phrases:" : "核心片語與詞彙 (Core Lexicons & Phrases):"}
                </div>
                <div className="bg-white border border-slate-100 rounded-md overflow-hidden text-[10px]">
                  {currentAnalysis.sentence2Analysis.vocabulary.map((v, idx) => (
                    <div key={idx} className="flex justify-between p-1.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <span className="font-semibold text-slate-800 font-mono">{v.word}</span>
                      <span className="text-slate-600 font-medium">{v.translation}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reference Answers */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <span className="w-1.5 h-3 bg-emerald-500 rounded-xs inline-block"></span>
                <span>
                  {lang === "zh" ? "官方標準 / 進階參考答案佳句" : lang === "en" ? "Standard & Elite Reference Templates:" : "官方標準 / 進階參考答案佳句 (Standard Templates)"}
                </span>
              </div>
              
              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs space-y-2.5 font-mono shadow-xs">
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-0.5">SENTENCE 1 REFERENCE OPTIONS</div>
                  {currentAnalysis.referenceTranslations1.map((t, idx) => (
                    <div key={idx} className="flex gap-1.5 items-start text-[11px] leading-relaxed select-all">
                      <span className="text-emerald-400 shrink-0 font-bold">[{idx+1}]</span>
                      <p>{t}</p>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-slate-800 pt-2">
                  <div className="text-[9px] text-slate-400 font-bold mb-0.5">SENTENCE 2 REFERENCE OPTIONS</div>
                  {currentAnalysis.referenceTranslations2.map((t, idx) => (
                    <div key={idx} className="flex gap-1.5 items-start text-[11px] leading-relaxed select-all">
                      <span className="text-emerald-400 shrink-0 font-bold">[{idx+1}]</span>
                      <p>{t}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Keys to Fulfilling */}
            <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg space-y-1.5">
              <div className="text-[11px] font-semibold text-teal-800 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  {lang === "zh" ? "評分大綱與高分奪標關鍵：" : lang === "en" ? "Keys to Standard Scoring & Fulfillment:" : "評分大綱與高分奪標關鍵 (Keys to Scoring)"}
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[10px] text-teal-700 leading-normal">
                {currentAnalysis.overallFulfillmentKeys.map((k, idx) => (
                  <li key={idx}>{k}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400">
            <BookOpen className="w-8 h-8 mx-auto stroke-1 mb-2 text-slate-300" />
            <p className="text-xs">
              {lang === "zh" ? "請點選上方按鈕，由 AI 預先解析該翻譯句子之句型結構與滿分參考解答。" : lang === "en" ? "Click the button above to pre-parse the structures & grading guidelines via AI." : "請點選上方按鈕，由 AI 預析與獲取答案 (Click button to parse benchmark guidelines)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
