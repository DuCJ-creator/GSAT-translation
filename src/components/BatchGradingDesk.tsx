import React, { useState, useEffect, useRef } from "react";
import { StudentGrading, PromptAnalysis, TranslationError } from "../types";
import { DEMO_STUDENT_SUBMISSIONS, generateHandwritingSvg } from "../data/demoSubmissions";
import { LangType, getTranslation } from "../lib/translations";
import { 
  FileText, Upload, Sparkles, AlertCircle, CheckCircle, 
  Trash2, Layers, Keyboard, Award, ArrowUpRight, HelpCircle, RefreshCw, Mail 
} from "lucide-react";
import { sendStudentEmailReport } from "../lib/emailService";

interface GradingDeskProps {
  activeSeat: number;
  student: StudentGrading;
  promptAnalysis: PromptAnalysis | null;
  onGradingComplete: (updatedStudent: StudentGrading) => void;
  lang?: LangType;
  smtpConfig?: any;
}

export default function GradingDesk({
  activeSeat,
  student,
  promptAnalysis,
  onGradingComplete,
  lang = "bilingual",
  smtpConfig,
}: GradingDeskProps) {
  const [inputMode, setInputMode] = useState<"upload" | "text">("text");
  const [typedText, setTypedText] = useState<string>("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isMailing, setIsMailing] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<{ type: "success" | "error" | "info"; title: string; desc?: string } | null>(null);

  // Sync state if active seat changes
  useEffect(() => {
    setEmailStatus(null);
    if (student.ocrSentence1 || student.ocrSentence2) {
      // already graded
      const sentencesText = `${student.ocrSentence1 || ""}\n${student.ocrSentence2 || ""}`;
      setTypedText(sentencesText);
      setAttachedImage(student.studentInputImage || null);
      setImageName(student.fileName || "");
    } else {
      // not graded or new seat: start completely empty
      setLocalError(null);
      setTypedText("");
      setAttachedImage(null);
      setImageName("");
      setInputMode("text");
    }
  }, [activeSeat, student]);

  // Handle Drag & Drop for real files
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setLocalError("請拖曳或上傳標準圖片檔案 (PNG, JPG, JPEG)！");
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAttachedImage(e.target.result as string);
        setLocalError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  // Run the grading using Gemini API
  const handleStartGrading = async () => {
    if (!promptAnalysis) {
      setLocalError("請先在上方『翻譯考題與學術分析』中設定並解析中文題幹！");
      return;
    }

    if (inputMode === "text" && !typedText.trim()) {
      setLocalError("請在左側文字欄位中輸入學生的英文翻譯句子！");
      return;
    }

    if ((inputMode === "upload" || inputMode === "demo") && !attachedImage) {
      setLocalError("請上傳學生作業掃描圖像檔，或使用預設仿寫圖示！");
      return;
    }

    setIsGrading(true);
    setLocalError(null);

    // Prepare updatedStudent template
    const processingStudent: StudentGrading = {
      ...student,
      status: "grading"
    };
    onGradingComplete(processingStudent);

    try {
      const res = await fetch("/api/grade-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seatNumber: activeSeat,
          image: (inputMode === "upload" || inputMode === "demo") ? attachedImage : null,
          manualText: inputMode === "text" ? typedText : null,
          promptAnalysis
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP 失敗狀態碼: ${res.status}`);
      }

      const report = await res.json();

      const gradedStudent: StudentGrading = {
        seatNumber: activeSeat,
        status: "graded",
        ocrSentence1: report.ocrSentence1,
        ocrSentence2: report.ocrSentence2,
        score1: report.score1,
        score2: report.score2,
        totalScore: report.totalScore,
        errors1: report.errors1,
        errors2: report.errors2,
        feedback1: report.feedback1,
        feedback2: report.feedback2,
        improvedVersion: report.improvedVersion,
        majorIssues: report.majorIssues,
        studentInputImage: attachedImage || undefined,
        fileName: imageName || "manual_input.txt"
      };

      onGradingComplete(gradedStudent);
    } catch (err: any) {
      console.error(err);
      setLocalError(err.message || "評分失敗，請確認伺服器連線與 AI Key。");
      onGradingComplete({
        ...student,
        status: "failed"
      });
    } finally {
      setIsGrading(false);
    }
  };

  const handleDeleteAttachment = () => {
    setAttachedImage(null);
    setImageName("");
    setTypedText("");
  };

  const handleLoadDemoText = () => {
    const foundDemo = DEMO_STUDENT_SUBMISSIONS.find(d => d.seatNumber === activeSeat);
    if (foundDemo) {
      setTypedText(foundDemo.textInput);
      const svgUri = generateHandwritingSvg(activeSeat, foundDemo.textInput);
      setAttachedImage(svgUri);
      setImageName(`demo_seat_${activeSeat}_scan.svg`);
      setLocalError(null);
    } else {
      // random fallback
      setTypedText("Many students feel anxiety when they choose college.\nBut they can make appropriate decisions under expert assistance.");
      setLocalError(null);
    }
  };

  return (
    <div id="desk-workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* 1. Left Side: Inputs, OCR simulator and scanner source */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-5 h-5 bg-sky-100 text-sky-800 rounded-full flex items-center justify-center text-xs font-mono font-bold">
                {activeSeat}
              </span>
              <span>號學生作業登錄</span>
            </h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  inputMode === "text"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                打字登錄 (Type/Paste Response)
              </button>
              <button
                type="button"
                onClick={() => setInputMode("upload")}
                className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  inputMode === "upload"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                拍照/上傳作業 (Upload Scan)
              </button>
            </div>
          </div>

          {/* Core Input Display Section */}
          {inputMode === "upload" && (
            <div className="space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Student Translation Capture</span>
              
              {attachedImage ? (
                <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-100 shadow-3xs p-1">
                  <img src={attachedImage} alt="Uploaded student sheet" className="w-full h-auto max-h-[300px] object-contain rounded-md" />
                  <div className="absolute top-2 left-2 bg-slate-900/85 text-white text-[10px] font-mono py-0.5 px-2 rounded-md">
                    {imageName}
                  </div>
                  <div className="absolute bottom-2 right-2">
                    <button
                      onClick={handleDeleteAttachment}
                      className="bg-rose-500 hover:bg-rose-600 text-white p-1.5 rounded-md shadow-xs transition-colors"
                      title="清除上傳"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragActive
                      ? "border-emerald-500 bg-emerald-50/20 text-emerald-700"
                      : "border-slate-300 hover:border-slate-400 bg-slate-50/50 text-slate-500"
                  }`}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-300 pointer-events-none" />
                  <p className="text-xs font-semibold text-slate-600">拖曳作業圖像、或點此瀏覽本機檔案</p>
                  <p className="text-[10px] text-slate-400 mt-1">支援 PNG, JPG, JPEG 格式手寫拍照作業</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )}

          {inputMode === "text" && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Manual English Transcription</span>
              <textarea
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                rows={5}
                className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-slate-50/50 font-mono tracking-tight"
                placeholder="貼上或輸入學生作答的英文翻譯句子... (第一句與第二句可以分行輸入)"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setTypedText("")}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded cursor-pointer"
                >
                  清除輸入 (Clear)
                </button>
              </div>
            </div>
          )}

          {/* Local validation error banner */}
          {localError && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="whitespace-pre-wrap leading-relaxed font-normal">{localError}</div>
            </div>
          )}

          {/* Trigger grading btn */}
          <button
            onClick={handleStartGrading}
            disabled={isGrading || !promptAnalysis}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              isGrading
                ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                : !promptAnalysis
                ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-teal-600 hover:bg-teal-700 text-white shadow-md active:scale-98"
            }`}
          >
            {isGrading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                正在進行 OCR 辨識與 GSAT 學術模組評分中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                送出評分 (OCR + 智慧批改)
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Right Side: Grading Output Report & Traditional Red Ink Marks */}
      <div className="lg:col-span-7">
        {student.status === "graded" ? (
          <div className="space-y-4">
            
            {/* Inline Helper Box for manual adjustments & individual reset */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 shadow-xs space-y-2.5">
              <div className="text-left space-y-1">
                <span className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  手寫字跡太草致 OCR 辨識有誤？
                </span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  大考 OCR 有時會因拍照反光或草寫而有些微出入。您可以點選下方<b>「手動修正」</b>在左側編輯學生真正的作答內容並<b>重新送出評分</b>；或者點選<b>「個別重置」</b>將此座號退回至初始待評狀態。
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("text");
                    if (!typedText.trim()) {
                      const sentencesText = `${student.ocrSentence1 || ""}\n${student.ocrSentence2 || ""}`;
                      setTypedText(sentencesText);
                    }
                    const elem = document.getElementById("desk-workspace");
                    if (elem) elem.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-md cursor-pointer transition-colors"
                >
                  📝 手動修正學生的翻譯
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`確認要清除第 ${activeSeat} 號學生的評分，重新輸入嗎？`)) {
                      const resetStudent: StudentGrading = {
                        seatNumber: activeSeat,
                        status: "present",
                        ocrSentence1: undefined,
                        ocrSentence2: undefined,
                        score1: undefined,
                        score2: undefined,
                        totalScore: undefined,
                        errors1: undefined,
                        errors2: undefined,
                        feedback1: undefined,
                        feedback2: undefined,
                        improvedVersion: undefined,
                        majorIssues: undefined,
                        studentInputImage: undefined,
                        fileName: undefined
                      };
                      onGradingComplete(resetStudent);
                      setTypedText("");
                      setAttachedImage(null);
                      setImageName("");
                    }
                  }}
                  className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 font-bold hover:bg-rose-100 text-[10px] rounded-md cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  個別重置
                </button>
              </div>
            </div>

            {/* Score Summary Billboard card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 p-3 flex items-center justify-between text-white">
                <div className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-200"># {activeSeat} 號 學生學術診斷評分表</span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 py-0.5 px-2 rounded-sm border border-emerald-800 font-bold">
                  Deduction Metres Approved
                </span>
              </div>

              {/* Red Pen Circle Grading Board */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-radial from-slate-50 to-white">
                <div className="flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 pb-4 sm:pb-0">
                  <div className="relative w-28 h-28 flex flex-col items-center justify-center">
                    {/* Retro red-ink hand-drawn teacher grading circle */}
                    <div className="absolute inset-0 border-4 border-rose-500 rounded-full border-dashed animate-pulse" style={{ transform: "rotate(-5deg)", borderRadius: "48% 52% 50% 50% / 40% 41% 59% 60%" }}></div>
                    <span className="text-[10px] font-bold text-rose-500 tracking-wider rotate-[-6deg] uppercase">GSAT TOTAL</span>
                    <span className="text-4xl font-extrabold text-rose-600 font-handwritten rotate-[-6deg] my-0.5">
                      {student.totalScore?.toFixed(1)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">out of 8.0 pts</span>
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        第一句評分 (Sentence 1):
                      </span>
                      <span className="font-mono font-bold text-slate-800">{student.score1?.toFixed(1)} / 4.0</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-rose-500 h-full" style={{ width: `${((student.score1 || 0) / 4) * 100}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        第二句評分 (Sentence 2):
                      </span>
                      <span className="font-mono font-bold text-slate-800">{student.score2?.toFixed(1)} / 4.0</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-rose-500 h-full" style={{ width: `${((student.score2 || 0) / 4) * 100}%` }}></div>
                    </div>
                  </div>

                  <div className="pt-1.5 flex gap-1.5">
                    <span className="text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-sm">
                      {student.errors1?.length || 0} S1 處瑕疵
                    </span>
                    <span className="text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded-sm">
                      {student.errors2?.length || 0} S2 處瑕疵
                    </span>
                    <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-sm">
                      扣分制 (-0.5 起)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* OCR Transcribed text feedback comparison */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-1 border-b border-slate-100 pb-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h5 className="text-xs font-semibold text-slate-700">學生作答內容辨識與即時紅筆批註</h5>
              </div>

              {/* Sentence 1 Sheet Correction */}
              <div className="space-y-1 bg-amber-50/30 p-3 rounded-lg border border-amber-200/50">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                  <span>SENTENCE 1 ORIGINAL TRANSCRIPTION</span>
                  <span className="text-emerald-700">Score: {student.score1?.toFixed(1)}/4.0</span>
                </div>
                <blockquote className="text-xs font-mono py-1.5 border-l-2 border-slate-300 pl-3 italic text-slate-700 text-slate-800 bg-white/70 rounded-r-md">
                  {student.ocrSentence1 || "(空白或無辨識結果)"}
                </blockquote>
                
                {/* Visual Red Corrections for Sentence 1 */}
                {student.errors1 && student.errors1.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[9px] font-bold text-rose-600 uppercase flex items-center gap-1">
                      <span className="w-1 h-3 bg-rose-500 inline-block"></span>紅筆糾錯 (Red Corrections):
                    </div>
                    {student.errors1.map((err, idx) => (
                      <div key={idx} className="bg-rose-50/70 border border-rose-100 p-2 rounded-md text-[11px] space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="bg-rose-100 text-rose-800 font-mono text-[9px] px-1 py-0.2 rounded font-bold">{err.errorType}</span>
                          <span className="line-through text-slate-400 font-mono text-[10px]">{err.originalSegment}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-emerald-700 font-bold font-mono text-[11px]">{err.suggestedSegment}</span>
                          <span className="text-rose-600 font-bold ml-auto font-mono text-[10px]">-{err.pointsDeducted}</span>
                        </div>
                        <p className="text-slate-600 text-[10px] leading-relaxed italic">{err.explanation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-emerald-700 font-medium italic mt-1">Excellent sentence construction! No grammatical or spelling errors detected.</p>
                )}
                
                {student.feedback1 && (
                  <div className="text-[11px] bg-slate-50 p-2 rounded-md text-slate-600 leading-normal mt-2 border-l border-slate-200">
                    <span className="font-semibold text-slate-800 text-[10.5px]">第一句點評：</span>
                    {student.feedback1}
                  </div>
                )}
              </div>

              {/* Sentence 2 Sheet Correction */}
              <div className="space-y-1 bg-purple-50/30 p-3 rounded-lg border border-purple-200/50">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                  <span>SENTENCE 2 ORIGINAL TRANSCRIPTION</span>
                  <span className="text-emerald-700">Score: {student.score2?.toFixed(1)}/4.0</span>
                </div>
                <blockquote className="text-xs font-mono py-1.5 border-l-2 border-slate-300 pl-3 italic text-slate-700 text-slate-800 bg-white/70 rounded-r-md">
                  {student.ocrSentence2 || "(空白或無辨識結果)"}
                </blockquote>
                
                {/* Visual Red Corrections for Sentence 2 */}
                {student.errors2 && student.errors2.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[9px] font-bold text-rose-600 uppercase flex items-center gap-1">
                      <span className="w-1 h-3 bg-rose-500 inline-block"></span>紅筆糾錯 (Red Corrections):
                    </div>
                    {student.errors2.map((err, idx) => (
                      <div key={idx} className="bg-rose-50/70 border border-rose-100 p-2 rounded-md text-[11px] space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="bg-rose-100 text-rose-800 font-mono text-[9px] px-1 py-0.2 rounded font-bold">{err.errorType}</span>
                          <span className="line-through text-slate-400 font-mono text-[10px]">{err.originalSegment}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-emerald-700 font-bold font-mono text-[11px]">{err.suggestedSegment}</span>
                          <span className="text-rose-600 font-bold ml-auto font-mono text-[10px]">-{err.pointsDeducted}</span>
                        </div>
                        <p className="text-slate-600 text-[10px] leading-relaxed italic">{err.explanation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-emerald-700 font-medium italic mt-1">Excellent sentence construction! No grammatical or spelling errors detected.</p>
                )}
                
                {student.feedback2 && (
                  <div className="text-[11px] bg-slate-50 p-2 rounded-md text-slate-600 leading-normal mt-2 border-l border-slate-200">
                    <span className="font-semibold text-slate-800 text-[10.5px]">第二句點評：</span>
                    {student.feedback2}
                  </div>
                )}
              </div>
            </div>

            {/* Custom Major issues & Recommended improved model answer */}
            <div className="bg-slate-950 text-white rounded-xl p-4 space-y-3.5 shadow-md">
              <div>
                <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 py-0.5 px-2 rounded">
                  本卷主體問題診斷 (DIAGNOSTIC CRITIQUE)
                </span>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed font-sans">{student.majorIssues}</p>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                  <span>建議仿寫與進階修辭佳句 (IMPROVED VERSION)</span>
                  <span className="text-emerald-400 font-mono text-[9.5px]">Best Recommended Writing</span>
                </div>
                <p className="text-xs text-slate-100 font-mono leading-relaxed mt-1.5 select-all p-2.5 bg-slate-900 rounded-md border border-slate-800">
                  {student.improvedVersion}
                </p>
              </div>
            </div>

            {/* Email dispatch section */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Mail className="w-4.5 h-4.5 text-teal-600" />
                <h4 className="text-xs font-bold text-slate-800">
                  ✉️ 學生紅筆診斷報告 Email 寄送 (Email Dispatcher)
                </h4>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-left">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      學生收件電子信箱 (Student Email)
                    </label>
                    <input
                      type="email"
                      value={student.email || ""}
                      onChange={(e) => {
                        onGradingComplete({
                          ...student,
                          email: e.target.value
                        });
                      }}
                      placeholder={`例如: student${String(student.seatNumber).padStart(2, "0")}@chhs.hcc.edu.tw`}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 bg-slate-50/50 font-mono"
                    />
                  </div>
                  <div className="self-end pb-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const seatStr = String(student.seatNumber).padStart(2, "0");
                        onGradingComplete({
                          ...student,
                          email: `student${seatStr}@chhs.hcc.edu.tw`
                        });
                      }}
                      className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg cursor-pointer"
                      title="套用學校預設信箱格式"
                    >
                      自動信箱
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-[10px] text-slate-500">
                  <span>夾帶檔案格式：A4 印刷型高解析 PDF 糾錯回饋表</span>
                  <span className="font-semibold text-teal-600">自動生成 A4 Canvas</span>
                </div>

                {emailStatus && (
                  <div className={`p-2.5 rounded-lg text-xs border text-left ${
                    emailStatus.type === "success" 
                      ? "bg-teal-50 border-teal-200 text-teal-800" 
                      : emailStatus.type === "error"
                      ? "bg-rose-50 border-rose-100 text-rose-800"
                      : "bg-slate-50 border-slate-100 text-slate-700 animate-pulse"
                  }`}>
                    <p className="font-bold">{emailStatus.title}</p>
                    {emailStatus.desc && <p className="mt-1 text-[11px] font-normal leading-relaxed whitespace-pre-wrap">{emailStatus.desc}</p>}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isMailing || !student.email || !student.email.includes("@")}
                  onClick={async () => {
                    setIsMailing(true);
                    setEmailStatus({ type: "info", title: "⏳ 正在生成紅墨水 A4 PDF 附件與袋包裝...", desc: "系統正利用 html2canvas 高解析度繪製並編譯該學生的個人紅墨水 A4 考卷 PDF..." });
                    try {
                      const res = await sendStudentEmailReport(student, promptAnalysis, smtpConfig || null, student.email || "");
                      if (res.success) {
                        setEmailStatus({ 
                          type: "success", 
                          title: "✅ " + res.msg, 
                          desc: res.detail || "該學生的專屬 PDF 紅字糾錯回饋報告已順利寄發！" 
                        });
                      } else {
                        throw new Error(res.msg || "伺服器通報異常");
                      }
                    } catch (err: any) {
                      console.error(err);
                      setEmailStatus({ 
                        type: "error", 
                        title: "❌ 電子郵件傳送失敗 (Mailer Dispatch Failure)", 
                        desc: `原因說明：${err.message || err}\n\n【排查方案】：若您尚未設定您學校的真實 SMTP 寄信伺服器，您可以至右上角的「學生郵件/SMTP 設定」查閱或進行配置。` 
                      });
                    } finally {
                      setIsMailing(false);
                    }
                  }}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    isMailing
                      ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                      : !student.email || !student.email.includes("@")
                      ? "bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-98"
                  }`}
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  {isMailing ? "正在輸出 PDF 並傳送中..." : "✉️ 寄送個人紅字 A4 批改信件給學生"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 h-full flex flex-col items-center justify-center min-h-[400px]">
            <Award className="w-12 h-12 stroke-1 mb-3 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-700">批改桌尚無當前評分報表</p>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-normal">
              請左側完成當前 # {activeSeat} 號學生的作業上傳或貼上有關句子，並點選下方<strong>「送出評分」</strong>按鈕。專家級 AI 將隨即進行線上比對並自動分析學術反饋。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
