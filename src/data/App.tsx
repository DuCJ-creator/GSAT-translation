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
  HelpCircle, Eye, RefreshCw, FileText, Globe
} from "lucide-react";

export default function App() {
  const [lang, setLang] = useState<LangType>("bilingual");
  const [promptAnalysis, setPromptAnalysis] = useState<PromptAnalysis | null>(null);
  const [maxSeats, setMaxSeats] = useState<number>(20);
  const [students, setStudents] = useState<StudentGrading[]>([]);
  const [activeSeat, setActiveSeat] = useState<number | null>(null);

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

  // Auto-generate analysis on load with the first preset to avoid a blank screen
  useEffect(() => {
    const triggerDefaultAnalysis = async () => {
      try {
        const univPrompt = DEMO_PROMPTS[0];
        const res = await fetch("/api/analyze-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentence1: univPrompt.sentence1Chinese,
            sentence2: univPrompt.sentence2Chinese,
          }),
        });
        if (res.ok) {
          const data = await res.ok ? await res.json() : null;
          if (data) {
            setPromptAnalysis(data);
          }
        }
      } catch (err) {
        console.warn("Could not pre-load default prompt analysis", err);
      }
    };
    triggerDefaultAnalysis();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-teal-500 selection:text-white flex flex-col font-sans">
      
      {/* Top Professional Navigation Header Bar */}
      <header className="bg-slate-950 text-white border-b border-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center shadow-md shadow-teal-500/10">
              <GraduationCap className="w-5.5 h-5.5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 leading-none">
                {getTranslation("navTitle", lang)}
              </h1>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide block mt-1">
                {getTranslation("navSubtitle", lang)}
              </span>
            </div>
          </div>

          {/* Quick Header Indicators & Lang Selection */}
          <div className="flex flex-wrap items-center gap-3 text-xs justify-end">
            {/* Language Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-xs text-slate-300">
              <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LangType)}
                className="bg-transparent text-slate-100 text-[11px] font-bold outline-hidden border-none cursor-pointer focus:ring-0"
              >
                <option value="bilingual" className="bg-slate-900 text-slate-100">🌐 Bilingual / 雙語</option>
                <option value="zh" className="bg-slate-900 text-slate-100">🇹🇼 繁體中文</option>
                <option value="en" className="bg-slate-900 text-slate-100">🇺🇸 English</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-900/50 border border-slate-800 px-3 py-1 rounded-md text-[11px] text-teal-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              <span>{getTranslation("navEngine", lang)}</span>
            </div>
            <span className="text-[10.5px] text-slate-400 font-mono hidden sm:inline">
              UTC: 2026-06-01
            </span>
          </div>

        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        
        {/* Academic Introductory Box banner */}
        <div className="bg-radial from-teal-900 to-slate-950 text-white p-6 rounded-2xl border border-teal-800/30 relative overflow-hidden shadow-md">
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="relative z-10 max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-teal-400/15 border border-teal-400/20 text-teal-300 text-[10px] font-bold rounded-full uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-amber-400" /> {getTranslation("bannerBadge", lang)}
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
              {getTranslation("bannerTitle", lang)}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-2xl">
              {getTranslation("bannerDesc", lang)}
            </p>
          </div>
        </div>

        {/* Level 1: Prompt Input Canvas (Full Width) */}
        <section id="step-1-canvas">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">1</span>
            <h3 className="font-bold text-sm text-slate-800">
              {getTranslation("step1", lang)}
            </h3>
          </div>
          <PromptCanvas 
            onAnalysisGenerated={(analysis) => setPromptAnalysis(analysis)} 
            currentAnalysis={promptAnalysis} 
            lang={lang}
          />
        </section>

        {/* Level 2: Seat Status Grid (1-50 Organizer) */}
        <section id="step-2-seat-table">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">2</span>
            <h3 className="font-bold text-sm text-slate-800">
              {getTranslation("step2", lang)}
            </h3>
          </div>
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
        </section>

        {/* Level 3: Active Workspace Desk */}
        {activeSeat !== null ? (
          <section id="step-3-desk" className="scroll-mt-20 space-y-2">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">3</span>
                <h3 className="font-bold text-sm text-slate-800">
                  {getTranslation("step3Desk", lang)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveSeat(null)}
                className="bg-slate-900 hover:bg-slate-850 text-white text-[11px] font-bold py-1.5 px-3.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors duration-150 cursor-pointer"
              >
                {getTranslation("backButtonText", lang)}
              </button>
            </div>
            <GradingDesk
              activeSeat={activeSeat}
              student={students.find((s) => s.seatNumber === activeSeat)!}
              promptAnalysis={promptAnalysis}
              onGradingComplete={handleGradingComplete}
              lang={lang}
            />
          </section>
        ) : (
          <section id="step-3-desk" className="scroll-mt-20 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">3</span>
              <h3 className="font-bold text-sm text-slate-800">
                {getTranslation("step3", lang)}
              </h3>
            </div>
            <BatchGradingDesk
              students={students}
              promptAnalysis={promptAnalysis}
              onGradingComplete={handleGradingComplete}
              onSelectSeat={handleSelectSeat}
              onSetStudents={setStudents}
              lang={lang}
            />
          </section>
        )}

        {/* Level 4: Classroom Metrics & Dashboard Analytics */}
        <section id="step-4-statistics">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">4</span>
            <h3 className="font-bold text-sm text-slate-800">
              {getTranslation("step4", lang)}
            </h3>
          </div>
          <ClassStats students={students} lang={lang} />
        </section>

        {/* Level 5: Detailed Printed Gradebook Summary (Taiwanese High School Print Format) */}
        {students.filter(s => s.status === "graded").length > 0 && (
          <section id="step-5-gradebook" className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="font-semibold text-sm text-slate-100">{getTranslation("step5", lang)}</h3>
                <p className="text-[10px] text-slate-400">{getTranslation("step5Sub", lang)}</p>
              </div>
            </div>

            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold uppercase bg-slate-50/50">
                    <th className="py-2.5 px-3">
                      {lang === "zh" ? "座號" : lang === "en" ? "Seat No." : "座號 (Seat)"}
                    </th>
                    <th className="py-2.5 px-3">
                      {lang === "zh" ? "辨識狀態" : lang === "en" ? "OCR Evaluation State" : "原卷辨識狀態 (OCR State)"}
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
                      {lang === "zh" ? "語法障礙及錯字摘要" : lang === "en" ? "Primary Errors Found" : "語法障礙重點 (Primary Defect Check)"}
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
                        <tr key={student.seatNumber} className="hover:bg-slate-50 text-slate-400">
                          <td className="py-2.5 px-3 font-mono font-bold">{student.seatNumber.toString().padStart(2, "0")}</td>
                          <td className="py-2.5 px-3" colSpan={5}>
                            <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded">
                              {lang === "zh" ? "未到/缺席" : lang === "en" ? "Absent" : "未到/缺席 (Absent)"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">-</td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={student.seatNumber} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {student.seatNumber.toString().padStart(2, "0")} {lang === "en" ? "" : "號"}
                        </td>
                        <td className="py-2.5 px-3">
                          {isGraded ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-sm">
                              {lang === "zh" ? "OCR 已完成評分" : lang === "en" ? "Graded & Analyzed" : "OCR 已辨識並批改"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              {lang === "zh" ? "（待評）" : lang === "en" ? "(Pending)" : "（待評）"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {isGraded ? `${student.score1?.toFixed(1)} Pts` : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {isGraded ? `${student.score2?.toFixed(1)} Pts` : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-600">
                          {isGraded ? `${student.totalScore?.toFixed(1)} Pts` : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[300px] truncate leading-normal" title={student.majorIssues || ""}>
                          {isGraded ? student.majorIssues : "無資訊"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleSelectSeat(student.seatNumber)}
                            className="bg-slate-900 text-white font-bold text-[10px] py-1 px-2.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {lang === "zh" ? "觀看學生卷" : lang === "en" ? "Review Script" : "調照檢視"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

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

    </div>
  );
}
