import React from "react";
import { StudentGrading } from "../types";
import { LangType, getTranslation } from "../lib/translations";
import { 
  TrendingUp, Users, Award, ShieldAlert, 
  Percent, FileSpreadsheet, CheckCircle 
} from "lucide-react";

interface ClassStatsProps {
  students: StudentGrading[];
  lang?: LangType;
}

export default function ClassStats({ students, lang = "bilingual" }: ClassStatsProps) {
  // Filter present and graded students
  const activeStudents = students.filter(s => s.status !== "absent");
  const gradedStudents = students.filter(s => s.status === "graded");

  const attendanceCount = activeStudents.length;
  const absentCount = students.filter(s => s.status === "absent").length;
  const gradedCount = gradedStudents.length;

  // Calculate scores
  const scoreList = gradedStudents
    .map(s => s.totalScore || 0)
    .sort((a, b) => a - b);

  const averageScore = scoreList.length > 0 
    ? scoreList.reduce((sum, val) => sum + val, 0) / scoreList.length 
    : 0;

  // Median
  let medianScore = 0;
  if (scoreList.length > 0) {
    const half = Math.floor(scoreList.length / 2);
    if (scoreList.length % 2 === 1) {
      medianScore = scoreList[half];
    } else {
      medianScore = (scoreList[half - 1] + scoreList[half]) / 2.0;
    }
  }

  const highestScore = scoreList.length > 0 ? scoreList[scoreList.length - 1] : 0;
  const lowestScore = scoreList.length > 0 ? scoreList[0] : 0;

  // Distribute score ranges (8.0 limit)
  // Ranges: Excellent: 7.0-8.0, Good: 5.5-6.5, Average: 4.0-5.0, Action needed: 0-3.5
  const ranges = [
    { name: lang === "zh" ? "頂標 (7.0 - 8.0)" : lang === "en" ? "Top Score (7.0 - 8.0)" : "頂標 Top Score (7.0 - 8.0)", count: scoreList.filter(s => s >= 7.0).length, color: "bg-emerald-500" },
    { name: lang === "zh" ? "前標 (5.5 - 6.5)" : lang === "en" ? "High Score (5.5 - 6.5)" : "前標 High Score (5.5 - 6.5)", count: scoreList.filter(s => s >= 5.5 && s < 7.0).length, color: "bg-cyan-500" },
    { name: lang === "zh" ? "均標 (4.0 - 5.0)" : lang === "en" ? "Average (4.0 - 5.0)" : "均標 Average (4.0 - 5.0)", count: scoreList.filter(s => s >= 4.0 && s < 5.5).length, color: "bg-amber-500" },
    { name: lang === "zh" ? "待加強 (0.0 - 3.5)" : lang === "en" ? "Needs Study (0.0 - 3.5)" : "待加強 Needs Study (0.0 - 3.5)", count: scoreList.filter(s => s < 4.0).length, color: "bg-rose-500" },
  ];

  // Derive common errors/common issues across the graded cohort
  const allSubErrors: Array<{ originalSegment?: string; suggestedSegment?: string; errorType?: string; explanation?: string }> = [];
  gradedStudents.forEach(student => {
    if (student.errors1) allSubErrors.push(...student.errors1);
    if (student.errors2) allSubErrors.push(...student.errors2);
  });

  // Unique common types count
  const errorTypeFrequency: { [key: string]: number } = {};
  allSubErrors.forEach(err => {
    if (err.errorType) {
      errorTypeFrequency[err.errorType] = (errorTypeFrequency[err.errorType] || 0) + 1;
    }
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-400" />
          <div>
            <h3 className="font-semibold text-sm text-slate-100">
              {lang === "zh" ? "全班總體表現統計分析" : lang === "en" ? "Class Performance Metrics & Analytics" : "全班總體表現統計分析 (Classroom Analytics Dashboard)"}
            </h3>
            <p className="text-[10px] text-slate-400">
              {lang === "zh" ? "系統即時計算全班出席、平均分、落差分佈及易錯語法百分比" : lang === "en" ? "Real-time automated parameters tracking average score, median and distribution" : "系統即時計算全班平均分、落差及出席 (Real-time averages, median, and attendance details)"}
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase bg-teal-900 border border-teal-700 py-0.5 px-2.5 rounded font-mono font-bold text-teal-300">
          Graded: {gradedCount} / {attendanceCount}
        </span>
      </div>

      {gradedCount === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <FileSpreadsheet className="w-10 h-10 mx-auto stroke-1 text-slate-300 mb-2" />
          <p className="text-xs font-semibold">
            {lang === "zh" ? "尚無全班分析報告" : lang === "en" ? "No Classroom Report Available Yet" : "尚無全班分析報告 (No Classroom Report Available)"}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto">
            {lang === "zh" ? "在登錄完成至少 1 位出席學生的作答後，此處將自動呈現平均分、級級落點與高頻筆誤分佈。" : lang === "en" ? "Log responses for at least one student first. The metrics will populate automatically." : "登錄出席生作答後即呈現平均分與落點 (Metrics populates when homework is graded)"}
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Bento Stats Metric Card Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            
            <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold block">
                {lang === "zh" ? "平均分" : lang === "en" ? "AVERAGE SCORE" : "平均分 (AVERAGE)"}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold text-slate-800 font-mono">{averageScore.toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">/ 8.0</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1.5">
                {lang === "zh" ? "當前全班已批改高中的加權平均" : lang === "en" ? "Weighted mean of all graded student sheets" : "已批改學生的加權平均 (Graded student mean value)"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold block">
                {lang === "zh" ? "中位數" : lang === "en" ? "MEDIAN SCORE" : "中位數 (MEDIAN)"}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold text-slate-800 font-mono">{medianScore.toFixed(1)}</span>
                <span className="text-[10px] text-slate-400">/ 8.0</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1.5">
                {lang === "zh" ? "中位點表現，排除極端分數之拉高或過低" : lang === "en" ? "Midpoint value to exclude extreme scoring skewing" : "排除極端表現影響之中位點 (Middle-most score)"}
              </p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-lg">
              <span className="text-[10px] text-emerald-600 font-bold block">
                {lang === "zh" ? "最高分 / 最低分" : lang === "en" ? "HIGHEST / LOWEST SCORES" : "最高分 / 最低分 (HIGHEST/LOWEST)"}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold text-emerald-800 font-mono">{highestScore.toFixed(1)}</span>
                <span className="text-xs text-slate-400">/</span>
                <span className="text-lg font-bold text-slate-600 font-mono">{lowestScore.toFixed(1)}</span>
              </div>
              <p className="text-[9px] text-emerald-700 mt-1.5">
                {lang === "zh" ? `班級考量落差：${(highestScore - lowestScore).toFixed(1)} 分` : lang === "en" ? `Cohort delta range is ${(highestScore - lowestScore).toFixed(1)} Pts` : `受測全班落差差值： ${(highestScore - lowestScore).toFixed(1)} 分`}
              </p>
            </div>

            <div className="bg-sky-50/50 border border-sky-100 p-3.5 rounded-lg">
              <span className="text-[10px] text-sky-600 font-bold block">
                {lang === "zh" ? "實到應到人數" : lang === "en" ? "ATTENDANCE METRIC" : "實到應到人數 (ATTENDANCE)"}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-extrabold text-sky-800 font-mono">{attendanceCount}</span>
                <span className="text-xs text-slate-400">{lang === "en" ? " Present" : " 出席"}</span>
                <span className="text-sm font-semibold text-slate-500 font-mono ml-1">/ {students.length} {lang === "en" ? "Tot" : "總"}</span>
              </div>
              <p className="text-[9px] text-rose-500 mt-1.5">
                {lang === "zh" ? `排除未到、缺席 ${absentCount} 名` : lang === "en" ? `Excluded ${absentCount} absent students` : `缺席與排除限制生計 ${absentCount} 名 (Excluded)`}
              </p>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            {/* Visual breakdown of standard tiers */}
            <div className="md:col-span-7 bg-slate-50/50 border border-slate-100 p-3.5 rounded-lg space-y-3">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-indigo-500 inline-block rounded-xs"></span>
                {lang === "zh" ? "GSAT 考點分數級距常模分佈" : lang === "en" ? "GSAT Grade Boundary Tier Distribution" : "GSAT 考點成績常模層次落點分佈 (Grade Boundary Tiers)"}
              </span>

              <div className="space-y-2">
                {ranges.map((range, idx) => {
                  const percentage = gradedCount > 0 ? (range.count / gradedCount) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-600 font-medium">{range.name}</span>
                        <span className="font-semibold text-slate-800 font-mono">
                          {range.count} {lang === "en" ? "scripts" : "份考卷"} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-sm h-3 overflow-hidden flex">
                        <div
                          className={`h-full rounded-sm transition-all duration-500 ${range.color}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Common syntax mistakes detected */}
            <div className="md:col-span-5 bg-slate-50/50 border border-slate-100 p-3.5 rounded-lg space-y-3">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                <span>
                  {lang === "zh" ? "全班常見語法障礙類型統計" : lang === "en" ? "Highest-Frequency Class Grammatical Obstacles" : "全班常見語法障礙類型統計 (Common Syntax Impediments)"}
                </span>
              </span>

              {allSubErrors.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] text-slate-500">
                    {lang === "zh" ? `已評改錯題庫中自動識別出 ${allSubErrors.length} 處錯誤筆誤：` : lang === "en" ? `Parsed and generated ${allSubErrors.length} error points from active dataset:` : `自批閱資料中提取出 ${allSubErrors.length} 處筆誤頻繁值 (Extracted errors dataset)`}
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(errorTypeFrequency)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([type, freq], idx) => {
                        const errorPct = (freq / allSubErrors.length) * 100;
                        return (
                          <div key={idx} className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-md text-[10.5px]">
                            <span className="bg-rose-50 border border-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-mono font-bold text-[9px]">
                              {type}
                            </span>
                            <div className="text-right">
                              <span className="font-bold text-slate-700 font-mono">
                                {freq} {lang === "en" ? "times" : "處"} 
                              </span>
                              <span className="text-slate-400 font-mono">({errorPct.toFixed(0)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center py-6">
                  {lang === "zh" ? "受評學生中出現文法或拼字謬誤時，系統將即時分析成圖表。" : lang === "en" ? "Syntax barrier diagnostics telemetry populates immediately when errors are graded." : "學生有筆誤被扣分時，此板即時呈現錯題分析 (Awaiting syntax barriers)"}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
