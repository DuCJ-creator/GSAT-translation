import React from "react";
import { StudentGrading } from "../types";
import { LangType, getTranslation } from "../lib/translations";
import { Users, CheckSquare, Square, Eye, EyeOff, Award, TrendingUp } from "lucide-react";

interface SeatLayoutProps {
  students: StudentGrading[];
  activeSeat: number | null;
  onSelectSeat: (seatNo: number) => void;
  onTogglePresence: (seatNo: number) => void;
  onSetAllPresence: (present: boolean) => void;
  maxSeats: number;
  onSetMaxSeats: (num: number) => void;
  lang?: LangType;
}

export default function SeatLayout({
  students,
  activeSeat,
  onSelectSeat,
  onTogglePresence,
  onSetAllPresence,
  maxSeats,
  onSetMaxSeats,
  lang = "bilingual",
}: SeatLayoutProps) {
  // Generate list of seats based on current maxSeats configuration (e.g., 20 or 40)
  const seatNumbers = Array.from({ length: maxSeats }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Panel */}
      <div className="bg-slate-900 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-teal-400" />
          <div>
            <h3 className="font-semibold text-sm text-slate-100">
              {getTranslation("seatTitle", lang)}
            </h3>
            <p className="text-[10px] text-slate-400">
              {getTranslation("seatDesc", lang)}
            </p>
          </div>
        </div>

        {/* Configure Size: Elegant interactive range slider/control bar with all numbers from 1 to 60 */}
        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-semibold uppercase whitespace-nowrap">
              {getTranslation("classSize", lang)}
            </span>
            <span className="text-xs bg-teal-500/20 text-teal-300 font-mono font-bold px-2 py-0.5 rounded border border-teal-500/30 whitespace-nowrap">
              {maxSeats} {lang === "en" ? "Seats" : "座號"}
            </span>
          </div>
          <div className="flex items-center gap-2 select-none bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 shrink-0 w-44 sm:w-48">
            <span className="text-[9px] text-slate-400 font-mono font-bold">1</span>
            <input
              type="range"
              min="1"
              max="60"
              value={maxSeats}
              onChange={(e) => onSetMaxSeats(Number(e.target.value))}
              className="grow h-1.5 bg-slate-600 rounded-lg cursor-pointer accent-teal-400 focus:outline-hidden"
            />
            <span className="text-[9px] text-slate-400 font-mono font-bold">60</span>
          </div>
        </div>
      </div>

      {/* Grid Controller Controls */}
      <div className="bg-slate-50 border-b border-slate-100 p-3 flex flex-wrap gap-2 items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">{getTranslation("shortcut", lang)}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onSetAllPresence(true)}
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-500" /> {getTranslation("presentAll", lang)}
          </button>
          <button
            onClick={() => onSetAllPresence(false)}
            className="bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 text-rose-400" /> {getTranslation("absentAll", lang)}
          </button>
        </div>
      </div>

      {/* Grid of Student Card Buttons */}
      <div className="p-4">
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {seatNumbers.map((seatNo) => {
            const student = students.find((s) => s.seatNumber === seatNo);
            const isAbsent = student?.status === "absent";
            const isGraded = student?.status === "graded";
            const isGrading = student?.status === "grading";
            const isSelected = activeSeat === seatNo;
            const hasScore = student?.totalScore !== undefined;

            let statusBg = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";
            let scoreColor = "text-slate-500";
            
            if (isAbsent) {
              statusBg = "bg-rose-50/50 border-rose-100 text-rose-400 opacity-60 hover:bg-rose-50";
            } else if (isGraded) {
              statusBg = "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-semibold ring-1 ring-emerald-100 hover:bg-emerald-50";
              scoreColor = "text-emerald-700 font-mono font-bold";
            } else if (isGrading) {
              statusBg = "bg-amber-50 border-amber-300 text-amber-800 animate-pulse";
            } else if (isSelected) {
              statusBg = "bg-sky-50 border-sky-400 text-sky-950 font-bold ring-2 ring-sky-200";
            }

            return (
              <div
                key={seatNo}
                id={`seat-card-${seatNo}`}
                className={`relative rounded-lg border p-1.5 flex flex-col justify-between items-center transition-all cursor-pointer ${statusBg} text-center min-h-[58px] ${
                  isSelected ? "scale-105 shadow-xs" : "hover:shadow-xs"
                }`}
                onClick={() => !isAbsent && onSelectSeat(seatNo)}
              >
                {/* Checkbox button corner */}
                <div
                  title={isAbsent ? "點選設為出席 (Checked)" : "點選設為缺席 (Unchecked)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePresence(seatNo);
                  }}
                  className="absolute top-1 right-1 flex items-center justify-center p-0.5 rounded hover:bg-slate-200/50 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!isAbsent}
                    readOnly
                    className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300 accent-teal-600 cursor-pointer"
                  />
                </div>

                {/* Seat label */}
                <div className="w-full text-left pl-1">
                  <span className="text-[10px] font-mono text-slate-400 font-semibold block"># {seatNo.toString().padStart(2, "0")}</span>
                </div>

                {/* Info and state details */}
                <div className="my-1">
                  {isAbsent ? (
                    <span className="text-[9px] px-1 py-0.2 select-none bg-rose-100 text-rose-600 rounded">
                      {lang === "zh" ? "缺席" : lang === "en" ? "Absent" : "缺席 (Abs)"}
                    </span>
                  ) : isGrading ? (
                    <span className="text-[9px] px-1 py-0.2 select-none bg-amber-100 text-amber-600 rounded animate-bounce">
                      {lang === "zh" ? "評分中" : lang === "en" ? "Grading..." : "評分中 (Grading)"}
                    </span>
                  ) : isGraded && hasScore ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-emerald-600 font-semibold">
                        {lang === "zh" ? "得分" : lang === "en" ? "Score" : "得分 (Pts)"}
                      </span>
                      <span className="text-xs font-bold font-mono tracking-tight text-emerald-800">
                        {student.totalScore?.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">
                      {lang === "zh" ? "待評分" : lang === "en" ? "Pending" : "待評分 (Pending)"}
                    </span>
                  )}
                </div>

                {/* Progress bar line at card bottom */}
                {!isAbsent && (
                  <div className="w-full bg-slate-100 rounded-sm h-1 mt-0.5 overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all duration-300 ${isGraded ? "bg-emerald-500 w-full" : "bg-slate-300 w-0"}`}
                    ></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
