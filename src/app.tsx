import React, { useState, useEffect } from "react";
import { StudentGrading, PromptAnalysis } from "./types";
import { DEMO_PROMPTS } from "./data/demoSubmissions";
import PromptCanvas from "./components/PromptCanvas";
import SeatLayout from "./components/SeatLayout";
import GradingDesk from "./components/GradingDesk";
import BatchGradingDesk from "./components/BatchGradingDesk";
import ClassStats from "./components/ClassStats";
import { LangType, getTranslation } from "./lib/translations";
import { 
  Award, BookOpen, GraduationCap, Sparkles, 
  ChevronRight, Heart, FileDown, Layers, CheckSquare, 
  HelpCircle, Eye, RefreshCw, FileText, Globe,
  Settings, Users, BarChart3, FileSpreadsheet, ChevronDown, ChevronUp, ChevronLeft, ArrowRight
} from "lucide-react";

export default function App() {
  const [lang, setLang] = useState<LangType>("bilingual");
  const [promptAnalysis, setPromptAnalysis] = useState<PromptAnalysis | null>(null);
  const [maxSeats, setMaxSeats] = useState<number>(20);
  const [students, setStudents] = useState<StudentGrading[]>([]);
  const [activeSeat, setActiveSeat] = useState<number | null>(null);
  const [promptSetupOpen, setPromptSetupOpen] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<"batch" | "stats" | "transcript">("batch");

  // Handle navigating to next present student
  const handleNextStudent = () => {
    if (activeSeat === null) return;
    const presentSeats = students
      .filter((s) => s.status !== "absent")
      .map((s) => s.seatNumber)
      .sort((a, b) => a - b);
    const currentIndex = presentSeats.indexOf(activeSeat);
    if (currentIndex !== -1 && currentIndex < presentSeats.length - 1) {
      setActiveSeat(presentSeats[currentIndex + 1]);
    } else if (presentSeats.length > 0) {
      setActiveSeat(presentSeats[0]); // Wrap around
    }
  };

  // Handle navigating to previous present student
  const handlePrevStudent = () => {
    if (activeSeat === null) return;
    const presentSeats = students
      .filter((s) => s.status !== "absent")
      .map((s) => s.seatNumber)
      .sort((a, b) => a - b);
    const currentIndex = presentSeats.indexOf(activeSeat);
    if (currentIndex > 0) {
      setActiveSeat(presentSeats[currentIndex - 1]);
    } else if (presentSeats.length > 0) {
      setActiveSeat(presentSeats[presentSeats.length - 1]); // Wrap around
    }
  };

  // Initialize students array when maxSeats changes
  useEffect(() => {
    setStudents((prev) => {
      const updated = Array.from({ length: maxSeats }, (_, i) => {
        const seatNum = i + 1;
        const existing = prev.find((s) => s.seatNumber === seatNum);
        if (existing) return existing;
        return {
          seatNumber: seatNum,
          status: "present" as const,
        };
      });
      // Filter out any seats beyond maxSeats
      return updated.filter((s) => s.seatNumber <= maxSeats);
    });

    // Reset active seat if it exceeds new bounds
    if (activeSeat && activeSeat > maxSeats) {
      setActiveSeat(null);
    }
  }, [maxSeats]);

  // Handle seat click
  const handleSelectSeat = (seatNo: number) => {
    setActiveSeat(seatNo);
  };

  // Toggle present/absent
  const handleTogglePresence = (seatNo: number) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.seatNumber === seatNo) {
          const isAbsent = s.status === "absent";
          return {
            ...s,
            status: isAbsent ? "present" as const : "absent" as const,
            // Clear grading stats if marked absent
            score1: undefined,
            score2: undefined,
            totalScore: undefined,
            errors1: undefined,
            errors2: undefined,
            ocrSentence1: undefined,
            ocrSentence2: undefined,
            feedback1: undefined,
            feedback2: undefined,
          };
        }
        return s;
      })
    );

    if (activeSeat === seatNo) {
      setActiveSeat(null);
    }
  };

  // Set all students to present or absent
  const handleSetAllPresence = (present: boolean) => {
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        status: present ? ("present" as const) : ("absent" as const),
        score1: undefined,
        score2: undefined,
        totalScore: undefined,
        errors1: undefined,
        errors2: undefined,
        ocrSentence1: undefined,
        ocrSentence2: undefined,
        feedback1: undefined,
        feedback2: undefined,
      }))
    );
    setActiveSeat(null);
  };

  // Callback when student's grading is completed on the GradingDesk
  const handleGradingComplete = (updatedStudent: StudentGrading) => {
    setStudents((prev) =>
      prev.map((s) => (s.seatNumber === updatedStudent.seatNumber ? updatedStudent : s))
    );
  };

  // Export current grades and student responses to CSV/Excel format compatible with MS Excel (UTF-8 BOM)
  const handleExportExcel = () => {
    const headers = [
      lang === "zh" ? "座號" : "Seat No.",
      lang === "zh" ? "狀態" : "Status",
      lang === "zh" ? "第一句得分 (4.0分)" : "S1 Score (4.0)",
      lang === "zh" ? "第二句得分 (4.0分)" : "S2 Score (4.0)",
      lang === "zh" ? "總分 (8.0分)" : "Total Score (8.0)",
      lang === "zh" ? "第一句作答" : "S1 Student Submission",
      lang === "zh" ? "第二句作答" : "S2 Student Submission",
      lang === "zh" ? "語法障礙重點" : "Major Issues / Feedback"
    ];

    const rows = students.map((s) => {
      let statusStr = "";
      if (s.status === "absent") {
        statusStr = lang === "zh" ? "缺席" : "Absent";
      } else if (s.status === "graded") {
        statusStr = lang === "zh" ? "已批改" : "Graded";
      } else {
        statusStr = lang === "zh" ? "未批改" : "Pending";
      }

      return [
        s.seatNumber,
        statusStr,
        s.status === "graded" && s.score1 !== undefined ? s.score1.toFixed(1) : "",
        s.status === "graded" && s.score2 !== undefined ? s.score2.toFixed(1) : "",
        s.status === "graded" && s.totalScore !== undefined ? s.totalScore.toFixed(1) : "",
        s.ocrSentence1 || "",
        s.ocrSentence2 || "",
        s.majorIssues || ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(val => {
          const cleanVal = typeof val === "string" ? val.replace(/"/g, '""').replace(/\n/g, ' ') : val;
          return `"${cleanVal}"`;
        }).join(",")
      )
    ].join("\n");

    // Add \ufeff BOM for Microsoft Excel traditional Chinese character rendering correctness
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GSAT_Grader_Class_Scores_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export beautiful red ink annotations reports for all graded sheets to PDF
  const handleExportRedInkReports = () => {
    window.print();
  };



  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-teal-500 selection:text-white flex flex-col font-sans">
      
      {/* Top Professional Centered Navigation Header Bar */}
      <header className="bg-slate-950 text-white border-b border-teal-500/20 sticky top-0 z-50 shadow-lg py-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center space-y-4">
          
          {/* Centered Logo brand and spacious layout */}
          <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-xl shadow-teal-500/30 transition-transform hover:scale-105 duration-300">
            <GraduationCap className="w-9 h-9 text-slate-950 stroke-[2]" />
          </div>
          
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white leading-none filter drop-shadow-md">
              {getTranslation("navTitle", lang)}
            </h1>
            <p className="text-sm md:text-base text-teal-400 font-semibold tracking-wider uppercase opacity-95">
              {getTranslation("navSubtitle", lang)}
            </p>
          </div>

        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-5">
        
        {/* UNIFIED BULK EXPORT WORKSPACE BAR (High Visibility) */}
        {students.filter(s => s.status === "graded").length > 0 && (
          <div className="bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/35 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-teal-400 animate-pulse" />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-xs text-teal-400 uppercase tracking-widest">
                  {lang === "zh" ? "大考手寫智能校閱系統 · 完成成果" : "AI GRADING COMPLETED PROMPTS"}
                </h4>
                <p className="text-[11.5px] text-slate-300 font-medium leading-relaxed">
                  {lang === "zh"
                    ? `已成功評閱並產出 A4 紅筆糾錯與手寫糾偏考卷！目前全班已批改：${students.filter(s => s.status === "graded").length} 人 / 出席：${students.filter(s => s.status !== "absent").length} 人`
                    : `High-resolution A4 reports are ready! Total graded: ${students.filter(s => s.status === "graded").length} / present: ${students.filter(s => s.status !== "absent").length}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap shrink-0">
              <button
                onClick={handleExportRedInkReports}
                className="flex-1 md:flex-none py-2 px-3.5 bg-rose-600 hover:bg-rose-550 border border-rose-500/40 text-[11px] font-black tracking-wide text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98 transition-all"
                title="匯出全班紅筆糾錯批註考卷至一完整 PDF"
              >
                <FileText className="w-4 h-4 text-rose-100" />
                <span>{lang === "zh" ? "📥 匯出全班紅筆批註 PDF" : "Export Red Ink PDF (A4)"}</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="flex-1 md:flex-none py-2 px-3.5 bg-emerald-750 hover:bg-emerald-700 border border-emerald-600/40 text-[11px] font-black tracking-wide text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                <span>{lang === "zh" ? "📥 匯出成績單 CSV" : "Export Excel (CSV)"}</span>
              </button>
            </div>
          </div>
        )}

        {/* MASTER COMPACT PROMPT BOX (Accordion) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden transition-all duration-200">
          <div 
            onClick={() => setPromptSetupOpen(!promptSetupOpen)}
            className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors"
          >
            <div className="flex items-center gap-2 overflow-hidden text-ellipsis mr-4">
              <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
              <div className="text-xs truncate">
                <span className="font-bold text-slate-800">
                  {lang === "zh" ? "📖 當前翻譯題及常模設定：" : lang === "en" ? "📖 Active Prompts & Norms:" : "📖 當前翻譯題及設定 (Active Prompt):"}
                </span>
                <span className="text-slate-500 font-mono ml-1.5 bg-slate-200/60 px-1.5 py-0.5 rounded text-[10px]">
                  {promptAnalysis ? "Parsed / 已設定" : "Pending / 待設定"}
                </span>
                <span className="text-slate-600 font-medium ml-2 text-[11px] truncate hidden md:inline">
                  {promptAnalysis 
                    ? `${promptAnalysis.sentence1Chinese.slice(0, 15)}... & ${promptAnalysis.sentence2Chinese.slice(0, 15)}...`
                    : "請輸入並設定您要批改的中文句型常模"}
                </span>
              </div>
            </div>
            <div className="text-neutral-500 hover:text-neutral-700 p-1 flex items-center gap-1 text-[11px] font-bold">
              {promptSetupOpen ? (
                <>
                  <span>{lang === "zh" ? "收合設定" : lang === "en" ? "Collapse Settings" : "收合設定 (Collapse)"}</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>{lang === "zh" ? "展開編輯與常模" : lang === "en" ? "Configure Prompt & AI Norms" : "展開編輯與常模 (Configure)"}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </div>
          </div>

          {/* Conditional PromptCanvas content with slide/fade */}
          {promptSetupOpen && (
            <div className="border-t border-slate-100 bg-white">
              <PromptCanvas 
                onAnalysisGenerated={(analysis) => {
                  setPromptAnalysis(analysis);
                  // Auto close accordion after parse so the workspace is immediately visible
                  setPromptSetupOpen(false);
                }} 
                currentAnalysis={promptAnalysis} 
                lang={lang}
              />
            </div>
          )}
        </section>

        {/* TWO-COLUMN SPLIT DASHBOARD WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* LEFT SIDEBAR PANEL (Seat Layout Grid & Presence - width: 4/12) */}
          <div className={`lg:col-span-4 lg:sticky lg:top-18 space-y-3 ${activeSeat !== null ? "hidden lg:block" : ""}`}>
            <SeatLayout
              students={students}
              activeSeat={activeSeat}
              onSelectSeat={handleSelectSeat}
              onTogglePresence={handleTogglePresence}
              onSetAllPresence={handleSetAllPresence}
              maxSeats={maxSeats}
              onSetMaxSeats={setMaxSeats}
              lang={lang}
            />

            {/* Attendance Analytics Indicators Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-3xs text-[10px] text-slate-500 grid grid-cols-3 gap-1 text-center font-medium font-mono">
              <div>
                <span className="text-slate-400 block text-[9.5px] font-sans uppercase">{lang === "zh" ? "總人數" : "TOTAL"}</span>
                <span className="text-slate-800 font-bold text-xs">{students.length}</span>
              </div>
              <div>
                <span className="text-emerald-500 block text-[9.5px] font-sans uppercase">{lang === "zh" ? "出席" : "PRESENT"}</span>
                <span className="text-emerald-700 font-bold text-xs">{students.filter(s => s.status !== "absent").length}</span>
              </div>
              <div>
                <span className="text-indigo-50 block text-[9.5px] font-sans uppercase bg-indigo-100/60 p-0.5 rounded text-indigo-700">{lang === "zh" ? "已批改" : "GRADED"}</span>
                <span className="text-indigo-700 font-bold text-xs block mt-0.5">{students.filter(s => s.status === "graded").length}</span>
              </div>
            </div>
          </div>

          {/* RIGHT MAIN PANEL (Action Center - width: 8/12) */}
          <div className="lg:col-span-8">
            {activeSeat !== null ? (
              /* INDIVIDUAL STUDENT WORKSPACE */
              <div className="space-y-4">
                
                {/* Individual navigation toolbar (Dynamic Control Bar) */}
                <div className="bg-white rounded-xl border border-slate-250 p-3 shadow-2xs flex items-center justify-between flex-wrap gap-2 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs font-mono font-bold shadow-xs">
                      #{activeSeat.toString().padStart(2, "0")}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 leading-tight">
                        {lang === "zh" ? `座位 ${activeSeat} 號 · 個別作答學診分析` : lang === "en" ? `Seat #${activeSeat} Interactive Grading` : `座位 ${activeSeat} 號 (Seat #${activeSeat})`}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {students.find(s => s.seatNumber === activeSeat)?.status === "graded" 
                          ? (lang === "zh" ? "🎉 評分診斷已完成，可點擊左右側按鍵切換下一個學生" : "Graded & Analyzed successfully")
                          : (lang === "zh" ? "⏳ 等待作答輸入或調卷模擬 (Awaiting Script Submission)" : "Awaiting response inputs")}
                      </p>
                    </div>
                  </div>

                  {/* Horizontal Sequential Student Navigation Helpers */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePrevStudent}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-250 p-1.5 rounded-lg flex items-center text-xs transition-all cursor-pointer font-bold"
                      title="上一個學生"
                    >
                      <ChevronLeft className="w-4 h-4 mr-0.5" />
                      <span>{lang === "zh" ? "前一位" : "Prev"}</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleNextStudent}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-250 p-1.5 rounded-lg flex items-center text-xs transition-all cursor-pointer font-bold"
                      title="下一個學生"
                    >
                      <span>{lang === "zh" ? "後一位" : "Next"}</span>
                      <ChevronRight className="w-4 h-4 ml-0.5" />
                    </button>

                    <div className="w-px h-5 bg-slate-200 mx-1"></div>

                    <button
                      type="button"
                      onClick={() => setActiveSeat(null)}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                    >
                      {getTranslation("backToClass", lang)}
                    </button>
                  </div>
                </div>

                {/* GradingDesk View */}
                <GradingDesk
                  activeSeat={activeSeat}
                  student={students.find((s) => s.seatNumber === activeSeat)!}
                  promptAnalysis={promptAnalysis}
                  onGradingComplete={handleGradingComplete}
                  lang={lang}
                />
              </div>
            ) : (
              /* CLASS ASSESSMENT HUB (WITHOUT ACTIVE SEAT SELECTED) */
              <div className="space-y-4">
                
                {/* Tab layout headers */}
                <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-3xs flex items-center gap-1.5 font-bold text-xs select-none">
                  <button
                    onClick={() => setRightTab("batch")}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      rightTab === "batch"
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    }`}
                  >
                    <Layers className="w-4 h-4 hover:translate-y-px transition-transform text-teal-400" />
                    <span>{lang === "zh" ? "整批自動批改" : lang === "en" ? "Batch Grading Center" : "整批自動批改"}</span>
                  </button>

                  <button
                    onClick={() => setRightTab("stats")}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      rightTab === "stats"
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 hover:scale-105 transition-transform text-teal-400" />
                    <span>{lang === "zh" ? "全班大會統計" : lang === "en" ? "Class Analytics" : "全班大會統計"}</span>
                    {students.filter(s => s.status === "graded").length > 0 && (
                      <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-mono">
                        {students.filter(s => s.status === "graded").length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setRightTab("transcript")}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      rightTab === "transcript"
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                    <span>{lang === "zh" ? "評分總表 transcript" : lang === "en" ? "Transcript" : "大考成績總表"}</span>
                  </button>
                </div>

                {/* Tab dynamic container */}
                <div className="transition-all duration-155">
                  {rightTab === "batch" && (
                    <BatchGradingDesk
                      students={students}
                      promptAnalysis={promptAnalysis}
                      onGradingComplete={handleGradingComplete}
                      onSelectSeat={handleSelectSeat}
                      onSetStudents={setStudents}
                      lang={lang}
                    />
                  )}

                  {rightTab === "stats" && (
                    <ClassStats students={students} lang={lang} />
                  )}

                  {rightTab === "transcript" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
                      <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <div>
                            <h3 className="font-bold text-xs text-slate-100">{getTranslation("step5", lang)}</h3>
                            <span className="text-[9px] text-slate-400 block -mt-0.5">{getTranslation("step5Sub", lang)}</span>
                          </div>
                        </div>
                        {students.filter(s => s.status === "graded").length > 0 && (
                          <div className="flex gap-2 flex-wrap justify-end">
                            <button 
                              onClick={handleExportExcel}
                              className="bg-emerald-700 hover:bg-emerald-650 text-white border border-emerald-600 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <FileSpreadsheet className="w-3 h-3 text-emerald-100" />
                              <span>{lang === "zh" ? "匯出 Excel 檔 (CSV)" : "Export Excel (CSV)"}</span>
                            </button>
                            <button 
                              onClick={handleExportRedInkReports}
                              className="bg-rose-700 hover:bg-rose-650 text-white border border-rose-600 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                              title="匯出全班紅筆糾錯批註考卷至一完整 PDF"
                            >
                              <FileText className="w-3 h-3 text-rose-100" />
                              <span>{lang === "zh" ? "匯出紅筆批註 PDF" : "Export Red Ink PDF"}</span>
                            </button>
                            <button 
                              onClick={() => window.print()}
                              className="bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <FileDown className="w-3 h-3" />
                              <span>{lang === "zh" ? "列印學術報表 (Print)" : "Print Transcript"}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-3 overflow-x-auto">
                        {students.filter(s => s.status === "graded").length === 0 ? (
                          <div className="text-center py-10 text-slate-400 space-y-2.5">
                            <FileSpreadsheet className="w-10 h-10 stroke-1 mx-auto text-slate-350" />
                            <div className="text-xs font-semibold">{lang === "zh" ? "尚無批改資料可登錄成績單" : "No grader data parsed yet"}</div>
                            <div className="text-[10px] max-w-sm mx-auto text-slate-400">
                              {lang === "zh" ? "請點選左側座位個別評分，或切換至第一分頁一鍵模擬模擬/整批批改，隨即在此列印正式臺灣高中大考成績表。" : "Please input individual responses or execute batch simulator scripts first."}
                            </div>
                          </div>
                        ) : (
                          <table className="w-full text-[11px] text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 text-[9.5px] font-bold uppercase bg-slate-50/50">
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "座號" : lang === "en" ? "Seat No." : "座號 (Seat)"}
                                </th>
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "辨識狀態" : lang === "en" ? "OCR State" : "原卷辨識狀態 (OCR State)"}
                                </th>
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "第一句 S1 (4.0分)" : lang === "en" ? "Sentence S1 (4.0)" : "第一句 S1 (4.0)"}
                                </th>
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "第二句 S2 (4.0分)" : lang === "en" ? "Sentence S2 (4.0)" : "第二句 S2 (4.0)"}
                                </th>
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "總分 (8.0分)" : lang === "en" ? "Grand Total (8.0)" : "大考總分 (8.0)"}
                                </th>
                                <th className="py-2.5 px-3">
                                  {lang === "zh" ? "語法障礙及錯字摘要" : lang === "en" ? "Errors Found" : "語法障礙重點"}
                                </th>
                                <th className="py-2.5 px-3 text-right">
                                  {lang === "zh" ? "作業評分" : lang === "en" ? "Action" : "作業評分"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {students.map((student) => {
                                const isGraded = student.status === "graded";
                                const isAbsent = student.status === "absent";
                                
                                if (isAbsent) {
                                  return (
                                    <tr key={student.seatNumber} className="hover:bg-slate-50 text-slate-400/80">
                                      <td className="py-2 px-3 font-mono font-bold">{student.seatNumber.toString().padStart(2, "0")}</td>
                                      <td className="py-2 px-3 text-[10px]" colSpan={5}>
                                        <span className="bg-slate-100 text-slate-400 px-1.5 py-0.2 rounded font-semibold text-[9px]">
                                          {lang === "zh" ? "未到/缺席" : lang === "en" ? "Absent" : "未到/缺席 (Absent)"}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right">-</td>
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={student.seatNumber} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 font-mono font-bold text-slate-850">
                                      {student.seatNumber.toString().padStart(2, "0")} {lang === "en" ? "" : "號"}
                                    </td>
                                    <td className="py-2 px-3">
                                      {isGraded ? (
                                        <span className="text-[9.5px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold px-2 py-0.2 rounded">
                                          {lang === "zh" ? "已完成批改" : lang === "en" ? "Graded" : "OCR 已評"}
                                        </span>
                                      ) : (
                                        <span className="text-[9.5px] text-slate-400 italic">
                                          {lang === "zh" ? "待評分" : lang === "en" ? "Pending" : "（待評）"}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 font-mono">
                                      {isGraded ? `${student.score1?.toFixed(1)} Pts` : "-"}
                                    </td>
                                    <td className="py-2 px-3 font-mono">
                                      {isGraded ? `${student.score2?.toFixed(1)} Pts` : "-"}
                                    </td>
                                    <td className="py-2 px-3 font-mono font-bold text-teal-850">
                                      {isGraded ? `${student.totalScore?.toFixed(1)}` : "-"}
                                    </td>
                                    <td className="py-2 px-3 text-slate-600 whitespace-pre-line break-words min-w-[200px] max-w-[320px] leading-relaxed text-[11px]">
                                      {isGraded ? student.majorIssues : "-"}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <button
                                        onClick={() => handleSelectSeat(student.seatNumber)}
                                        className="bg-slate-800 text-white font-bold text-[9.5px] py-1 px-2 rounded-md hover:bg-slate-700 transition-all cursor-pointer"
                                      >
                                        {lang === "zh" ? "觀看學生卷" : lang === "en" ? "Review" : "調照檢視"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modern minimal academic credits footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <p>© 2026 GSAT AI English Grading Platform. Designed for Taiwan high school English departments.</p>
          <div className="flex items-center gap-1 text-slate-400 font-medium">
            <span>Made with precision for high school teachers</span> <Heart className="w-3 h-3 text-rose-500 fill-current" />
          </div>
        </div>
      </footer>

      {/* ───── PRINT SECTION ───── */}
      <div id="print-section" className="hidden print:block bg-white text-black p-0 m-0">
        {students
          .filter((s) => s.status === "graded")
          .map((student) => {
            return (
              <div key={student.seatNumber} className="print-page border-b border-gray-200 pb-12 mb-12">
                
                {/* Header Title Grid */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">
                      高中學測中英翻譯(GSAT C-E Translation). 紅筆對照與評鑑表
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-mono">
                      GSAT ENGLISH TRANSLATION INTELLIGENT FEEDBACK & SCORE SHEET
                    </p>
                    <p className="text-[11px] text-slate-600 mt-2">
                      <strong>題目翻譯對照常模：</strong>
                      第一句：{promptAnalysis?.sentence1Chinese || "許多學生在選擇大學學系時會感到焦慮與迷惘。"} | 
                      第二句：{promptAnalysis?.sentence2Chinese || "然而，透過自我探索和諮詢專家，他們能做出更合適的決定。"}
                    </p>
                  </div>
                  
                  {/* Seat badge and Teacher grade ring */}
                  <div className="text-right flex flex-col items-end">
                    <div className="bg-slate-900 text-white font-mono font-bold text-sm px-3 py-1 rounded-md mb-2">
                      座號 SEAT #{student.seatNumber}
                    </div>
                    {/* Circle Score Badge */}
                    <div className="w-20 h-20 rounded-full border-4 border-red-500 flex flex-col items-center justify-center text-red-600">
                      <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Score</span>
                      <span className="text-2xl font-black leading-none mt-1">{student.totalScore?.toFixed(1)}</span>
                      <span className="text-[8px] font-bold text-red-400 border-t border-red-200 mt-1 pt-0.5 leading-none">/ 8.0 Pts</span>
                    </div>
                  </div>
                </div>

                {/* Score Summary Grid */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 border border-slate-200 p-3 rounded-lg mb-6">
                  <div className="text-center border-r border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">第一句得分 (Sentence 1)</div>
                    <div className="text-lg font-black text-slate-800">{student.score1?.toFixed(1)} / 4.0</div>
                  </div>
                  <div className="text-center border-r border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">第二句得分 (Sentence 2)</div>
                    <div className="text-lg font-black text-slate-800">{student.score2?.toFixed(1)} / 4.0</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">瑕疵總扣分 (Deductions)</div>
                    <div className="text-lg font-black text-red-600">
                      -{Math.max(0, 8.0 - (student.totalScore || 0)).toFixed(1)} Pts
                    </div>
                  </div>
                </div>

                {/* Handwriting Image Scan Reference if present */}
                {student.studentInputImage && (
                  <div className="mb-6">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2 border-l-2 border-slate-700 pl-2">
                       學生原手寫考卷掃描 (Student Copy Scan Ref.)
                    </h3>
                    <div className="border border-slate-200 rounded-lg p-2 bg-[#fafaf9] max-h-[140px] flex items-center justify-center overflow-hidden">
                      <img 
                        src={student.studentInputImage} 
                        alt={`Seat ${student.seatNumber} Handwriting`} 
                        className="max-h-[120px] object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}

                {/* Sentence 1 Area */}
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2 border-l-2 border-slate-700 pl-2">
                     第一句細項批改 (Sentence 1 Red-Ink Resolution)
                  </h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">學生翻譯 Transcription:</div>
                      <div className="font-sans text-sm text-slate-800 italic mt-1 bg-white border border-slate-100 p-2 rounded">
                        {student.ocrSentence1}
                      </div>
                    </div>

                    {/* Table of errors */}
                    {student.errors1 && student.errors1.length > 0 ? (
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold mb-1">聯合理紅筆糾錯紀錄 (Red-Ink Marks):</div>
                        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white">
                          <thead>
                            <tr className="bg-slate-100 text-[10px] uppercase font-bold text-slate-700 border-b border-slate-200">
                              <th className="py-1 px-2 border-r border-slate-200 w-1/6">類別 (Type)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-2/6 text-red-600">原物瑕疵 (Error)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-2/6 text-green-600">更正指引 (Correction)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-1/12 text-center text-red-600">扣分</th>
                              <th className="py-1 px-2">詳盡解析 (Taiwan Chinese Explanation)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {student.errors1.map((err, idx) => (
                              <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                                <td className="py-1 px-2 border-r border-slate-200 font-semibold">{err.errorType}</td>
                                <td className="py-1 px-2 border-r border-slate-200 font-mono text-red-600 bg-red-50/50 line-through">{err.originalSegment}</td>
                                <td className="py-1 px-2 border-r border-slate-200 font-mono text-green-700 bg-green-50/50">{err.suggestedSegment}</td>
                                <td className="py-1 px-2 border-r border-slate-200 text-center font-mono font-bold text-red-600">
                                  {err.pointsDeducted > 0 ? `-${err.pointsDeducted}` : "0.0"}
                                </td>
                                <td className="py-1 px-2 text-[10.5px] text-slate-600 leading-normal">{err.explanation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-green-700 font-medium italic mt-1">
                        ✨ 完全正確：此句結構語意流暢且拼拼字 100% 精準，無觸犯任何扣分條例。
                      </p>
                    )}

                    {student.feedback1 && (
                      <div className="text-[11px] bg-white p-2 rounded border border-slate-100 text-slate-600 leading-relaxed font-sans">
                        <strong>名師點評 (Feedback S1)：</strong>{student.feedback1}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sentence 2 Area */}
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2 border-l-2 border-slate-700 pl-2">
                     第二句細項批改 (Sentence 2 Red-Ink Resolution)
                  </h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">學生翻譯 Transcription:</div>
                      <div className="font-sans text-sm text-slate-800 italic mt-1 bg-white border border-slate-100 p-2 rounded">
                        {student.ocrSentence2}
                      </div>
                    </div>

                    {/* Table of errors */}
                    {student.errors2 && student.errors2.length > 0 ? (
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold mb-1">聯合理紅筆糾錯紀錄 (Red-Ink Marks):</div>
                        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white">
                          <thead>
                            <tr className="bg-slate-100 text-[10px] uppercase font-bold text-slate-700 border-b border-slate-200">
                              <th className="py-1 px-2 border-r border-slate-200 w-1/6">類別 (Type)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-2/6 text-red-600">原物瑕疵 (Error)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-2/6 text-green-600">更正指引 (Correction)</th>
                              <th className="py-1 px-2 border-r border-slate-200 w-1/12 text-center text-red-600">扣分</th>
                              <th className="py-1 px-2">詳盡解析 (Taiwan Chinese Explanation)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {student.errors2.map((err, idx) => (
                              <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                                <td className="py-1 px-2 border-r border-slate-200 font-semibold">{err.errorType}</td>
                                <td className="py-1 px-2 border-r border-slate-200 font-mono text-red-600 bg-red-50/50 line-through">{err.originalSegment}</td>
                                <td className="py-1 px-2 border-r border-slate-200 font-mono text-green-700 bg-green-50/50">{err.suggestedSegment}</td>
                                <td className="py-1 px-2 border-r border-slate-200 text-center font-mono font-bold text-red-600">
                                  {err.pointsDeducted > 0 ? `-${err.pointsDeducted}` : "0.0"}
                                </td>
                                <td className="py-1 px-2 text-[10.5px] text-slate-600 leading-normal">{err.explanation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-green-700 font-medium italic mt-1">
                        ✨ 完全正確：此句結構語意流暢且拼拼字 100% 精準，無觸犯任何扣分條例。
                      </p>
                    )}

                    {student.feedback2 && (
                      <div className="text-[11px] bg-white p-2 rounded border border-slate-100 text-slate-600 leading-relaxed font-sans">
                        <strong>名師點評 (Feedback S2)：</strong>{student.feedback2}
                      </div>
                    )}
                  </div>
                </div>

                {/* Diagnostic Wrapup */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      大考常模範文精修對比 (High-Fidelity Model Essay)
                    </h4>
                    <p className="text-[11.5px] text-slate-750 leading-relaxed border-l-2 border-teal-500 pl-2 font-mono">
                      {student.improvedVersion}
                    </p>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      大考整合學術診斷 (Aesthetic Analysis & Diagnosis)
                    </h4>
                    <p className="text-[11px] text-slate-700 leading-relaxed italic">
                      {student.majorIssues}
                    </p>
                  </div>
                </div>

              </div>
            );
          })}
      </div>

    </div>
  );
}
