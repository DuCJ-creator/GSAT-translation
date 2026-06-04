import React, { useState, useRef, useEffect } from "react";
import { StudentGrading, PromptAnalysis, TranslationError } from "../types";
import { DEMO_STUDENT_SUBMISSIONS, generateHandwritingSvg } from "../data/demoSubmissions";
import { LangType, getTranslation } from "../lib/translations";
import { 
  Upload, FileText, Sparkles, AlertCircle, CheckCircle2, 
  Trash2, RefreshCw, Layers, ListFilter, Play, Settings, Clipboard, CheckCircle
} from "lucide-react";

interface BatchGradingDeskProps {
  students: StudentGrading[];
  promptAnalysis: PromptAnalysis | null;
  onGradingComplete: (updatedStudent: StudentGrading) => void;
  onSelectSeat: (seatNo: number) => void;
  onSetStudents: React.Dispatch<React.SetStateAction<StudentGrading[]>>;
  lang?: LangType;
}

interface QueuedStudent {
  id: string;
  seatNumber: number;
  fileName: string;
  image?: string;
  manualText?: string;
  status: "idle" | "grading" | "graded" | "failed";
  progress?: string;
  score?: string;
  errorMsg?: string;
}

export default function BatchGradingDesk({
  students,
  promptAnalysis,
  onGradingComplete,
  onSelectSeat,
  onSetStudents,
  lang = "bilingual",
}: BatchGradingDeskProps) {
  const [activeTab, setActiveTab] = useState<"text" | "simulator">("simulator");
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // States for tab-simulator interactive booklet uploading
  interface SimFile {
    id: string;
    name: string;
    seatNumber: number;
  }
  const [simFiles, setSimFiles] = useState<SimFile[]>([]);
  const simFileInputRef = useRef<HTMLInputElement>(null);
  
  // States for tab-text (multi-student textarea)
  const [combinedText, setCombinedText] = useState<string>("");

  // State for the batch queue itself
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processQueue, setProcessQueue] = useState<QueuedStudent[]>([]);
  const [currentConcurrences, setCurrentConcurrences] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Find present students
  const presentStudents = students.filter(s => s.status !== "absent");

  // Keep track of present seats
  const presentSeatNumbers = presentStudents.map(s => s.seatNumber);

  // Log message helper
  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // Helper to trigger grading API for a single seat
  const gradeSingleStudent = async (
    seatNo: number, 
    image: string | null, 
    text: string | null
  ): Promise<StudentGrading> => {
    if (!promptAnalysis) {
      throw new Error("Missing prompt analysis context.");
    }
    const res = await fetch("/api/grade-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seatNumber: seatNo,
        image,
        manualText: text,
        promptAnalysis
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP 失敗狀態碼: ${res.status}`);
    }

    const report = await res.json();
    return {
      seatNumber: seatNo,
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
      studentInputImage: image || undefined,
      fileName: image ? "batch_scan.png" : "batch_text_sheet.txt"
    };
  };

  // Run the batch pipeline with queue control (concurrency: 3)
  const runBatchPipeline = async (itemsToProcess: QueuedStudent[]) => {
    if (!promptAnalysis) {
      setLocalError("請先在第一步設定翻譯考題與 AI 常模！");
      return;
    }
    if (itemsToProcess.length === 0) {
      setLocalError("沒有待批改的學生。請確保上方第二步有勾選出席學生！");
      return;
    }

    setIsProcessing(true);
    setLocalError(null);
    setLogs([]);
    addLog(`🚀 啟動批改任務佇列，總共 ${itemsToProcess.length} 名出席學生。`);

    // In step 3: mark all selected students as "grading" in parent app state
    onSetStudents(prev => 
      prev.map(s => {
        const queueItem = itemsToProcess.find(q => q.seatNumber === s.seatNumber);
        if (queueItem) {
          return { ...s, status: "grading" };
        }
        return s;
      })
    );

    // Deep copy state of queue
    const activeQueue = itemsToProcess.map(item => ({ ...item, status: "idle" as const }));
    setProcessQueue(activeQueue);

    const CONCURRENCY_LIMIT = 2; // Keep it modest and reliable
    const uncompleted = [...activeQueue];
    const workingPool = new Set<QueuedStudent>();

    // Runner function
    const executeNext = async () => {
      if (uncompleted.length === 0 && workingPool.size === 0) {
        return;
      }

      while (workingPool.size < CONCURRENCY_LIMIT && uncompleted.length > 0) {
        const nextItem = uncompleted.shift()!;
        workingPool.add(nextItem);

        // Update item state to grading
        setProcessQueue(prev => 
          prev.map(q => q.id === nextItem.id ? { ...q, status: "grading", progress: "正在評閱..." } : q)
        );
        addLog(`⏳ 座號 #${nextItem.seatNumber} 已移入前端處理器...`);

        // Trigger request in background
        (async (item) => {
          try {
            addLog(`🤖 正在與 AI 連線評分 座號 #${item.seatNumber}`);
            const result = await gradeSingleStudent(
              item.seatNumber,
              item.image || null,
              item.manualText || null
            );

            // Complete in react state
            onGradingComplete(result);

            setProcessQueue(prev => 
              prev.map(q => q.id === item.id ? { 
                ...q, 
                status: "graded", 
                progress: "Done",
                score: `${result.totalScore?.toFixed(1)} 分`
              } : q)
            );
            addLog(`✅ 座號 #${item.seatNumber} 批改完成：${result.totalScore?.toFixed(1)}分 (大考 ${result.majorIssues})`);
          } catch (err: any) {
            console.error(err);
            onGradingComplete({
              seatNumber: item.seatNumber,
              status: "failed"
            });
            setProcessQueue(prev => 
              prev.map(q => q.id === item.id ? { 
                ...q, 
                status: "failed", 
                progress: "Error",
                errorMsg: err.message || "失敗"
              } : q)
            );
            addLog(`❌ 座號 #${item.seatNumber} 評分失敗：${err.message || '連線錯誤'}`);
          } finally {
            workingPool.delete(item);
            // Trigger tail recursion to run the next item
            executeNext();
          }
        })(nextItem);
      }
    };

    // Kick off first workers
    await executeNext();
  };

  // Wait/Monitor processing completion
  useEffect(() => {
    if (isProcessing && processQueue.length > 0) {
      const allDone = processQueue.every(q => q.status === "graded" || q.status === "failed");
      if (allDone) {
        setIsProcessing(false);
        addLog(`🎉 全班批改完畢！統計看版與總成績冊已即時更新。`);
      }
    }
  }, [processQueue, isProcessing]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSimFilesUpload(e.dataTransfer.files);
    }
  };

  // Tab 2: Combined Text Parsing Act
  const handleLoadDemoTextTemplate = () => {
    let template = "";
    presentStudents.forEach((student, idx) => {
      // Rotate submissions
      const sub = DEMO_STUDENT_SUBMISSIONS[idx % DEMO_STUDENT_SUBMISSIONS.length];
      template += `#${student.seatNumber.toString().padStart(2, "0")}\n${sub.textInput}\n\n`;
    });
    setCombinedText(template.trim());
  };

  const startTextBatchGrading = () => {
    if (!combinedText.trim()) {
      setLocalError("請輸入或貼上學生們的作答內容！");
      return;
    }

    // Parse text
    // Splitting by #xx or # Seat xx standard definitions
    const sections = combinedText.split(/#\s*(\d+)/g);
    // index 0 might be blank or header
    const parsedMap = new Map<number, string>();
    
    for (let i = 1; i < sections.length; i += 2) {
      const seatNo = parseInt(sections[i], 10);
      const text = sections[i + 1]?.trim();
      if (!isNaN(seatNo) && text) {
        parsedMap.set(seatNo, text);
      }
    }

    if (parsedMap.size === 0) {
      // Fallback: assume split by blank line and map to present students
      const paragraphs = combinedText.split(/\n\s*\n/);
      presentStudents.forEach((st, idx) => {
        const para = paragraphs[idx];
        if (para && para.trim()) {
          parsedMap.set(st.seatNumber, para.trim());
        }
      });
    }

    const items: QueuedStudent[] = presentStudents
      .filter(s => parsedMap.has(s.seatNumber))
      .map((student, idx) => ({
        id: `text-${student.seatNumber}-${idx}-${Math.random()}`,
        seatNumber: student.seatNumber,
        fileName: "batch_input.txt",
        manualText: parsedMap.get(student.seatNumber),
        status: "idle" as const
      }));

    if (items.length === 0) {
      setLocalError("無法解析作答內容與座號對應，請遵循 #01 #02 的標記樣式。");
      return;
    }

    runBatchPipeline(items);
  };

  // Tab 3: Automatic Class Simulator Booklet Uploading & Ordering Mechanics
  const handleSimFilesUpload = (files: FileList) => {
    if (students.length === 0) {
      setLocalError("當前班級無任何學生設定。");
      return;
    }

    const fileArray = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const newSimFiles: SimFile[] = [];

    // Use presentStudents if there are multiple checked, otherwise default to all class students for sequential mapping
    const mappingList = presentStudents.length > 1 ? presentStudents : students;

    // Check if it is a single PDF with several pages requested to be mapped page-by-page
    if (fileArray.length === 1 && fileArray[0].name.toLowerCase().endsWith(".pdf")) {
      const file = fileArray[0];
      // Assume a multipage booklet mapping page-by-page to current present students or class roster in order
      mappingList.forEach((student, sIdx) => {
        newSimFiles.push({
          id: `${file.name}-page-${sIdx + 1}-${Math.random()}`,
          name: `${file.name} (學籍考卷頁次 ${sIdx + 1} / Page ${sIdx + 1})`,
          seatNumber: student.seatNumber
        });
      });
      addLog(`📂 成功裝載單一 PDF 檔：已為當前之 ${mappingList.length} 位學生依序分頁配對考卷`);
    } else {
      // Multiple separate PDF/JPG/PNG files mapped in sequential seat number order
      fileArray.forEach((file, index) => {
        const assignedStudent = mappingList[index % mappingList.length];
        newSimFiles.push({
          id: `${file.name}-${index}-${Math.random()}`,
          name: file.name,
          seatNumber: assignedStudent ? assignedStudent.seatNumber : index + 1
        });
      });
      addLog(`📂 成功裝載整疊獨立考卷：已讀入 ${fileArray.length} 份檔案，並依序分派對應座號`);
    }

    setSimFiles(newSimFiles);
    setLocalError(null);
  };

  const handleGenerateSimBundle = () => {
    const listToGenerate = presentStudents.length > 1 ? presentStudents : students;
    const newSimFiles: SimFile[] = listToGenerate.map((student, idx) => ({
      id: `sim-page-${student.seatNumber}`,
      name: `Compiled_Class_Exams_Seat_${student.seatNumber.toString().padStart(2, "0")}.pdf`,
      seatNumber: student.seatNumber
    }));
    setSimFiles(newSimFiles);
    setLocalError(null);
    addLog(`✨ 已自動生成全班整合 PDF 手寫考卷組（共 ${listToGenerate.length} 頁學生的裝頁卷）`);
  };

  const handleUpdateSimSeat = (fileId: string, newSeat: number) => {
    setSimFiles(prev => prev.map(f => f.id === fileId ? { ...f, seatNumber: newSeat } : f));
  };

  const startSimulatorBatchGrading = () => {
    if (simFiles.length === 0) {
      setLocalError("請先上傳 PDF 整疊考卷或選擇一鍵生成模擬裝卷。");
      return;
    }

    const items: QueuedStudent[] = simFiles.map((f, idx) => {
      // Find matches in DEMO_STUDENT_SUBMISSIONS, fallback to generic
      const foundDemo = DEMO_STUDENT_SUBMISSIONS.find(d => d.seatNumber === f.seatNumber || d.seatNumber === ((f.seatNumber - 1) % 5) + 1);
      const textInput = foundDemo 
        ? foundDemo.textInput 
        : `Many students feel anxious when picking their major.\nBut through consulting expert advisers they can make appropriate decisions. (Seat #${f.seatNumber} student Response)`;
      
      const svgUri = generateHandwritingSvg(f.seatNumber, textInput);
      
      return {
        id: f.id || `sim-${f.seatNumber}-${idx}-${Math.random()}`,
        seatNumber: f.seatNumber,
        fileName: f.name,
        image: svgUri,
        manualText: textInput,
        status: "idle" as const
      };
    });

    runBatchPipeline(items);
  };

  // Clear states
  const resetBatchGrading = () => {
    setSimFiles([]);
    setProcessQueue([]);
    setLogs([]);
    setLocalError(null);
    setIsProcessing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 shadow-xs">
      
      {/* Header Block with quick stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <span className="w-5.5 h-5.5 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </span>
            <span>⚡ 全班批改與自動分派中心 (Class Batch Grading Hub)</span>
          </h4>
          <p className="text-[11px] text-slate-500 leading-normal mt-1">
            當前班級出席人數：<span className="font-mono font-bold text-slate-900">{presentStudents.length} 人</span> 𐄁 
            最大學生人數限制：<span className="font-mono font-bold text-slate-900">{students.length} 人</span>
          </p>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("simulator")}
            className={`py-1.5 px-3 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
              activeTab === "simulator"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-500 animate-pulse" />
            一鍵批改全班 (Class Batch Grading)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`py-1.5 px-3 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
              activeTab === "text"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            批次貼上打字 (Text)
          </button>
        </div>
      </div>

      {localError && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{localError}</p>
        </div>
      )}

      {/* Main Tab Interface Switcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Setup Column */}
        <div className="lg:col-span-5 space-y-4">

          {/* Tab Content B: Combined Text Paste */}
          {activeTab === "text" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">班級打字整批登錄</span>
                <button
                  type="button"
                  onClick={handleLoadDemoTextTemplate}
                  className="text-[10px] text-teal-600 hover:text-teal-800 font-bold flex items-center gap-0.5"
                >
                  <Clipboard className="w-3 h-3" /> 載入出席生作文範本
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                請在下方框中輸入整班作答。標記 <code>#座號</code>（例如 <code>#01</code>），系統會自動剖析並分派各學生的翻譯作答：
              </p>

              <textarea
                value={combinedText}
                onChange={(e) => setCombinedText(e.target.value)}
                rows={8}
                className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-sky-500 bg-slate-50/50 font-mono tracking-tight leading-relaxed"
                placeholder="在此輸入/貼上..."
              />

              <button
                type="button"
                onClick={startTextBatchGrading}
                disabled={isProcessing}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                  isProcessing
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                解析並啟動整批翻譯句子批改
              </button>
            </div>
          )}

          {/* Tab Content C: One-Click Simulated Entire Class (Default) */}
          {activeTab === "simulator" && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-bold text-teal-600 tracking-wider flex items-center gap-1 bg-teal-50 border border-teal-200/50 px-2 py-0.5 rounded w-max">
                <Sparkles className="w-3 h-3 text-teal-500 animate-pulse" /> CLASS EVALUATION CORE
              </span>
              <div>
                <h5 className="text-xs font-bold text-slate-800">一鍵智能分配全班批改 (Class Batch Grading)</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  請先上傳全班手寫 PDF/影像卷（支援單頁多頁檔或多份影像檔），系統將依出席名單或檔名順序自動分配。您隨時可按需手動微調校正。
                </p>
              </div>

              {simFiles.length === 0 ? (
                <div className="space-y-3">
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => simFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      dragActive
                        ? "border-teal-500 bg-teal-50/50 text-teal-700"
                        : "border-slate-300 hover:border-slate-400 bg-slate-50/50 text-slate-500"
                    }`}
                  >
                    <Upload className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">選擇或拖曳全班 PDF / 影像至此</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      選擇 1 份 PDF（依出席人數自動分頁對應）或同時框選多份 PDF/影像考卷
                    </p>
                    <input
                      ref={simFileInputRef}
                      type="file"
                      accept=".pdf,image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleSimFilesUpload(e.target.files);
                        }
                      }}
                      className="hidden"
                    />
                  </div>

                  <div className="text-center py-1">
                    <span className="text-[10px] text-slate-400 font-mono">— OR / 或點此模擬體驗 —</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateSimBundle}
                    disabled={presentStudents.length === 0}
                    className="w-full py-2 px-3 border border-dashed border-teal-500/40 hover:border-teal-500/80 bg-teal-500/5 hover:bg-teal-500/10 text-teal-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    未備妥實體卷？點此自動載入全班模擬考卷組 (Demo)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Loaded Simulation Files and Seat Allocations */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2.5 max-h-[280px] overflow-y-auto">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-205 pb-1.5">
                      <span className="flex items-center gap-1 text-slate-700">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        已封裝全班 {simFiles.length} 份考卷檔案
                      </span>
                      <button
                        type="button"
                        onClick={() => setSimFiles([])}
                        className="text-rose-500 hover:text-rose-600 flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> 移除重新上傳
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      💡 備忘：若部分學生的考卷排序與座號順序不符，您可以<b>點選下拉選單手動校正座號對應</b>：
                    </p>

                    <div className="divide-y divide-slate-150 space-y-1.5">
                      {simFiles.map((f, i) => (
                        <div key={f.id} className="pt-2 pb-1 text-xs font-sans text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <span className="truncate max-w-[200px] font-mono text-slate-500" title={f.name}>
                            📄 {f.name}
                          </span>
                          
                          {/* Fine-Tuning Dropdown Selector */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-teal-600 font-bold">對應 ➔</span>
                            <select
                              value={f.seatNumber}
                              onChange={(e) => handleUpdateSimSeat(f.id, parseInt(e.target.value, 10))}
                              className="text-[11px] bg-white border border-slate-300 rounded-md px-1.5 py-0.5 font-bold text-slate-800 focus:ring-1 focus:ring-teal-500 max-w-[120px]"
                            >
                              {students.map(student => (
                                <option key={student.seatNumber} value={student.seatNumber}>
                                  座號 #{student.seatNumber.toString().padStart(2, "0")} {student.status === "absent" ? "(未勾選出席)" : "學生"}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between font-medium">
                      <span>準備批改生出席人數：</span>
                      <span className="text-slate-900 font-bold font-mono">{presentStudents.length} 人</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>模擬大考標準準則：</span>
                      <span className="text-emerald-600 font-bold">4.0 非選扣分計分法</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startSimulatorBatchGrading}
                    disabled={isProcessing || simFiles.length === 0}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      isProcessing || simFiles.length === 0
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-teal-600 hover:bg-teal-700 text-white font-extrabold hover:shadow-md cursor-pointer transition-colors active:scale-98"
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current text-white animate-pulse" />
                    確校無誤，啟動 AI 智能分派與高速批改
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Side: Active Processing Monitor and System Pipeline Logs */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Progress Overview Panel */}
          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 border border-slate-800 space-y-4">
            
            <div className="flex justify-between items-center">
              <div>
                <h5 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-3 bg-teal-400 rounded-xs"></span>
                  即時評改串接佇列 (Pipeline Monitor)
                </h5>
                <p className="text-[10px] text-slate-400">顯示系統與 AWS/OCR/AI 連接點的即時回應狀態</p>
              </div>

              {processQueue.length > 0 && (
                <button
                  type="button"
                  onClick={resetBatchGrading}
                  className="bg-slate-800 text-slate-300 hover:bg-slate-700 py-0.5 px-2 rounded text-[10px] border border-slate-700"
                >
                  清除狀態
                </button>
              )}
            </div>

            {/* Simulated progress meters */}
            {processQueue.length > 0 ? (
              <div className="space-y-3.5">
                
                {/* Stats summary bar */}
                <div className="flex justify-between font-mono text-[11px] bg-slate-950 p-2 border border-slate-800/80 rounded-lg">
                  <div>
                    <span>進度：</span>
                    <span className="text-teal-400">
                      {processQueue.filter(q => q.status === "graded" || q.status === "failed").length}
                    </span>
                    <span className="text-slate-500"> / {processQueue.length}</span>
                  </div>
                  <div>
                    <span>評估狀態：</span>
                    {isProcessing ? (
                      <span className="text-amber-400 animate-pulse">批改中...</span>
                    ) : (
                      <span className="text-emerald-400">完成</span>
                    )}
                  </div>
                </div>

                {/* Micro mini cards display for seats */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {processQueue.map((item, idx) => (
                    <div 
                      key={item.id || `${item.seatNumber}-${idx}`} 
                      onClick={() => item.status === "graded" && onSelectSeat(item.seatNumber)}
                      className={`p-1 text-center rounded-md border font-mono text-[10.5px] cursor-pointer transition-all ${
                        item.status === "grading"
                          ? "bg-amber-950/50 border-amber-600 text-amber-200 animate-pulse"
                          : item.status === "graded"
                          ? "bg-emerald-950/50 border-emerald-600 text-emerald-200 hover:bg-emerald-900/60"
                          : item.status === "failed"
                          ? "bg-rose-950/50 border-rose-600 text-rose-200"
                          : "bg-slate-950/30 border-slate-800 text-slate-500"
                      }`}
                    >
                      <div className="font-bold"># {item.seatNumber.toString().padStart(2, "0")}</div>
                      <div className="text-[8.5px] mt-0.5 truncate font-medium">
                        {item.status === "grading" && "評分中..."}
                        {item.status === "graded" && (item.score || "✓")}
                        {item.status === "failed" && "❌ 錯誤"}
                        {item.status === "idle" && "佇列中"}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-950/30 border border-slate-950 rounded-lg">
                <Settings className="w-8 h-8 mx-auto mb-1 animate-spin stroke-1" />
                <p className="text-[11px] font-bold">無進行中之大批改作業</p>
                <p className="text-[9px] mt-0.5">請在左側選取登錄模式，點選啟動以監測即時 AI 作業分析</p>
              </div>
            )}

            {/* Console Log display */}
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">即時管道日誌 (System Logs)</span>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-950 text-[10px] font-mono text-slate-400 h-28 overflow-y-auto space-y-1">
                {logs.length > 0 ? (
                  logs.map((log, i) => (
                    <div key={i} className="leading-relaxed border-b border-slate-900/50 pb-0.5">{log}</div>
                  ))
                ) : (
                  <span className="text-slate-600 italic">Waiting for incoming grading queue...</span>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
