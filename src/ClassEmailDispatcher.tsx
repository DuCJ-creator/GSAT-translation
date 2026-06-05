import React, { useState, useEffect } from "react";
import { StudentGrading, PromptAnalysis } from "../types";
import { sendStudentEmailReport } from "../lib/emailService";
import { 
  Mail, Settings, ChevronRight, CheckCircle, AlertCircle, 
  HelpCircle, ShieldCheck, Sparkles, RefreshCw, Send, Play, Pause, AlertTriangle 
} from "lucide-react";
import { LangType } from "../lib/translations";

interface ClassEmailDispatcherProps {
  students: StudentGrading[];
  onSetStudents: React.Dispatch<React.SetStateAction<StudentGrading[]>>;
  promptAnalysis: PromptAnalysis | null;
  smtpConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
    secure: boolean;
  };
  onSetSmtpConfig: React.Dispatch<React.SetStateAction<{
    host: string;
    port: number;
    user: string;
    pass: string;
    secure: boolean;
  }>>;
  emailDomain: string;
  onSetEmailDomain: (domain: string) => void;
  lang: LangType;
  currentProjectName?: string;
}

export default function ClassEmailDispatcher({
  students,
  onSetStudents,
  promptAnalysis,
  smtpConfig,
  onSetSmtpConfig,
  emailDomain,
  onSetEmailDomain,
  lang,
  currentProjectName = "目前班級",
}: ClassEmailDispatcherProps) {
  // SMTP Local forms
  const [host, setHost] = useState(smtpConfig.host);
  const [port, setPort] = useState(smtpConfig.port);
  const [user, setUser] = useState(smtpConfig.user);
  const [pass, setPass] = useState(smtpConfig.pass);
  const [secure, setSecure] = useState(smtpConfig.secure);

  const [saveSuccessToast, setSaveSuccessToast] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [bulkEmailText, setBulkEmailText] = useState("");
  const [bulkEmailImportStatus, setBulkEmailImportStatus] = useState<string | null>(null);

  // Batch dispatch states
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    current: number;
    activeSeat: number | null;
    status: "idle" | "running" | "paused" | "finished";
    log: string[];
    errorsCount: number;
  }>({
    total: 0,
    current: 0,
    activeSeat: null,
    status: "idle",
    log: [],
    errorsCount: 0,
  });

  // Track cancellation/pause using a react ref to break intermediate loops immediately
  const pauseRef = React.useRef(false);

  // Sync state if initial configurations change
  useEffect(() => {
    setHost(smtpConfig.host);
    setPort(smtpConfig.port);
    setUser(smtpConfig.user);
    setPass(smtpConfig.pass);
    setSecure(smtpConfig.secure);
  }, [smtpConfig]);

  const handleSaveSmtp = () => {
    const updated = { host, port: Number(port), user, pass, secure };
    onSetSmtpConfig(updated);
    localStorage.setItem("gsat_smtp_config", JSON.stringify(updated));
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 3000);
  };

  const handleApplyPreset = () => {
    const domain = emailDomain.trim();
    if (!domain) return;
    const formattedDomain = domain.startsWith("@") ? domain : "@" + domain;
    localStorage.setItem("gsat_email_domain", formattedDomain);
    onSetEmailDomain(formattedDomain);

    onSetStudents((prev) =>
      prev.map((student) => {
        const seatStr = String(student.seatNumber).padStart(2, "0");
        return {
          ...student,
          email: `student${seatStr}${formattedDomain}`,
        };
      })
    );
  };

  const extractEmailFromText = (text: string): string | null => {
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].trim() : null;
  };

  const extractSeatNumberBeforeEmail = (line: string, email: string): number | null => {
    const emailIndex = line.indexOf(email);
    const prefix = emailIndex >= 0 ? line.slice(0, emailIndex) : line;
    const seatMatch = prefix.match(/\b\d{1,3}\b/);
    if (!seatMatch) return null;
    const seatNumber = Number(seatMatch[0]);
    return Number.isFinite(seatNumber) && seatNumber > 0 ? seatNumber : null;
  };

  const handleBulkEmailImport = () => {
    const rows = bulkEmailText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      setBulkEmailImportStatus("請先貼上 Email 名單。每行一個 Email，或從 Excel 貼上『座號 + Email』兩欄資料。");
      return;
    }

    const parsedRows = rows.map((line) => {
      const email = extractEmailFromText(line);
      const seatNumber = email ? extractSeatNumberBeforeEmail(line, email) : null;
      return { line, email, seatNumber };
    });

    const validRows = parsedRows.filter((row): row is { line: string; email: string; seatNumber: number | null } => Boolean(row.email));
    const invalidRows = parsedRows.length - validRows.length;

    if (validRows.length === 0) {
      setBulkEmailImportStatus("沒有偵測到有效 Email。請確認格式，例如：amy@gmail.com 或 1,amy@gmail.com。");
      return;
    }

    const hasSeatMapping = validRows.some((row) => row.seatNumber !== null);
    let updatedCount = 0;
    let skippedSeatCount = 0;

    onSetStudents((prev) => {
      const orderedStudents = [...prev].sort((a, b) => a.seatNumber - b.seatNumber);
      const emailBySeat = new Map<number, string>();

      if (hasSeatMapping) {
        validRows.forEach((row) => {
          if (row.seatNumber !== null) {
            emailBySeat.set(row.seatNumber, row.email);
          }
        });
      } else {
        validRows.forEach((row, index) => {
          const targetStudent = orderedStudents[index];
          if (targetStudent) {
            emailBySeat.set(targetStudent.seatNumber, row.email);
          } else {
            skippedSeatCount += 1;
          }
        });
      }

      const nextStudents = prev.map((student) => {
        const email = emailBySeat.get(student.seatNumber);
        if (!email) return student;
        updatedCount += 1;
        return {
          ...student,
          email,
        };
      });

      if (hasSeatMapping) {
        skippedSeatCount += Array.from(emailBySeat.keys()).filter(
          (seatNumber) => !prev.some((student) => student.seatNumber === seatNumber)
        ).length;
      }

      return nextStudents;
    });

    const mappingModeText = hasSeatMapping
      ? "已使用『座號 + Email』模式匯入"
      : "已使用『每行依座號順序』模式匯入";

    setBulkEmailImportStatus(
      `${mappingModeText}：成功更新 ${updatedCount} 位學生信箱。${invalidRows > 0 ? `略過 ${invalidRows} 行無效資料。` : ""}${skippedSeatCount > 0 ? `另有 ${skippedSeatCount} 筆超出目前座號範圍。` : ""}`
    );
  };

  const handleClearBulkEmailText = () => {
    setBulkEmailText("");
    setBulkEmailImportStatus(null);
  };

  // Run a connection test email dispatching a mock GSAT template to the teacher account
  const handleTestSmtp = async () => {
    if (!user || !user.includes("@")) {
      setTestEmailStatus({ type: "error", msg: "請先在 SMTP 使用者欄位輸入真實的伺服器發信帳號/電子信箱。" });
      return;
    }

    setIsTestingSmtp(true);
    setTestEmailStatus({ type: "info", msg: "正在利用虛擬測試考卷繪製診斷 PDF，並嘗試向您的發送帳號寄送認證測試信..." });

    const dummyStudent: StudentGrading = {
      seatNumber: 99,
      status: "graded",
      ocrSentence1: "Traditional shopping districts are losing ground.",
      ocrSentence2: "Local city planners should take immediate action.",
      score1: 4.0,
      score2: 3.5,
      totalScore: 7.5,
      errors2: [
        {
          errorType: "Word Choice",
          originalSegment: "ground",
          suggestedSegment: "space",
          explanation: "模擬測試：該詞語符合標準 synonyms。",
          pointsDeducted: 0.5
        }
      ],
      feedback1: "模擬連線測試：這是一封用來確認您 SMTP 伺服器通訊正常的認證信件。",
      feedback2: "若您收到本信，代表 A4 PDF 生成與學校郵件網關發送流程已完全連線運作正常！",
      improvedVersion: "This is a successful SMTP validation report.",
      email: user,
    };

    try {
      const activeSmtp = { host, port: Number(port), user, pass, secure };
      const res = await sendStudentEmailReport(dummyStudent, promptAnalysis, activeSmtp, user);
      if (res.success) {
        setTestEmailStatus({
          type: "success",
          msg: `🎉 ${res.msg}！測試信件已成功飛躍網際網路送達 [${user}]。請至您的電子郵箱收件夾（或垃圾信件匣）查閱主體與 A4 糾錯附件PDF！`,
        });
      } else {
        throw new Error(res.msg);
      }
    } catch (err: any) {
      setTestEmailStatus({
        type: "error",
        msg: `❌ 認證信寄送失敗！出現網路或 SMTP 握手協定阻隔：\n${err.message || err}`,
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Classroom-wide sequential dispatch queue running strictly with concurrency of 1 to minimize connection drops
  const runBatchEmailQueue = async () => {
    const listToEmail = students.filter(
      (s) => s.status === "graded" && s.email && s.email.includes("@")
    );

    if (listToEmail.length === 0) {
      alert("全班目前沒有任何「已完成批改」且「已輸入有效電子郵件」的出席學生！請先完成批改或一鍵自動生成預設信箱。");
      return;
    }

    // Initialize/Reset progress state
    pauseRef.current = false;
    setBatchProgress({
      total: listToEmail.length,
      current: 0,
      activeSeat: null,
      status: "running",
      log: [`🚀 啟動【${currentProjectName}】全班 [${listToEmail.length} 名考生] 紅墨水 A4 PDF 報告自動配送發信流程...`],
      errorsCount: 0,
    });

    const activeSmtp = { host, port: Number(port), user, pass, secure };

    for (let i = 0; i < listToEmail.length; i++) {
      // Look up live reference from state (in case teacher paused or updated state during loop)
      if (pauseRef.current) {
        setBatchProgress((prev) => ({
          ...prev,
          status: "paused",
          log: ["⏸️ 全班寄件排程已被手動暫停。您可以在確認或修改完畢後點選「點此繼續發送」恢復寄發。", ...prev.log],
        }));
        return;
      }

      const currentStudent = listToEmail[i];
      const seatStr = currentStudent.seatNumber.toString().padStart(2, "0");

      setBatchProgress((prev) => ({
        ...prev,
        current: i,
        activeSeat: currentStudent.seatNumber,
        log: [`⏳ [${i + 1}/${listToEmail.length}] 正在生成第 ${seatStr} 號學生的紅筆 A4 實體 PDF 考卷附件...`, ...prev.log],
      }));

      try {
        const res = await sendStudentEmailReport(
          currentStudent,
          promptAnalysis,
          activeSmtp,
          currentStudent.email!
        );

        if (res.success) {
          setBatchProgress((prev) => ({
            ...prev,
            current: i + 1,
            log: [
              `✅ 第 ${seatStr} 號（收件人: ${currentStudent.email}）寄送成功！【${res.simulated ? "虛擬沙盒模擬" : "學校主機發送"}】`,
              ...prev.log,
            ],
          }));
        } else {
          throw new Error(res.msg || "未知錯誤異常");
        }
      } catch (err: any) {
        console.error(err);
        setBatchProgress((prev) => ({
          ...prev,
          errorsCount: prev.errorsCount + 1,
          log: [
            `❌ 第 ${seatStr} 號（信箱: ${currentStudent.email}）寄送慘遭失敗！原因: ${err.message || err}`,
            ...prev.log,
          ],
        }));
      }

      // Add a tiny 400ms sleep delay between sequential emails to avoid throttling rules on standard servers
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    setBatchProgress((prev) => ({
      ...prev,
      activeSeat: null,
      status: "finished",
      log: [
        `🏆 【${currentProjectName}】配送結束！全班 A4 PDF 報告派對成功。總寄發人數：${prev.total} 名，成功派發 ${(prev.total - prev.errorsCount)} 名，阻礙失敗數：${prev.errorsCount} 名。`,
        ...prev.log,
      ],
    }));
  };

  const handlePauseQueue = () => {
    pauseRef.current = true;
    setBatchProgress((prev) => ({
      ...prev,
      status: "paused",
    }));
  };

  const handleResumeQueue = () => {
    pauseRef.current = false;
    runBatchEmailQueue();
  };

  return (
    <div className="space-y-4">
      {/* Current class / project context */}
      <div className="bg-indigo-950 text-white rounded-xl border border-indigo-800 shadow-3xs p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-indigo-300 font-bold">
            Current Class / Project
          </div>
          <div className="text-sm font-black text-white">
            📂 目前寄送班級：{currentProjectName}
          </div>
        </div>
        <div className="text-[10px] text-indigo-200 leading-relaxed max-w-xl">
          下方 Email 名單、批次寄送與單人寄送都會以目前班級資料為準。若要寄送其他班級，請先回到上方班級管理區切換專案。
        </div>
      </div>

      {/* 1. SMTP Credentials setups */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
        <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="font-bold text-xs text-slate-100">學校 SMTP 專屬寄信伺服器設定</h3>
              <span className="text-[9px] text-slate-400 block -mt-0.5">Custom SMTP Credential Configuration</span>
            </div>
          </div>
          <span className="text-[9.5px] bg-emerald-950/80 text-emerald-400 font-mono py-0.5 px-2 rounded-sm border border-emerald-800 font-bold">
            SMTP Tunnel Security Enabled
          </span>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[11px] text-slate-500 leading-normal bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            ℹ️ <b>【校方通訊規範】</b>: 預設採用的模擬寄件將會輸出完整的 PDF 檔案。若要寄送至學生的真正外部電子信箱（如 Gmail、Outlook 或學校網域），請在下方填寫您學校英文組、教務處所提供的學術專任 SMTP 伺服器發信資訊。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">
                SMTP 伺服器主機 (Host Domain)
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.school.edu.tw"
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono bg-slate-50/20"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">
                通訊埠 Port (SSL 建議 465)
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                placeholder="465"
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono bg-slate-50/20"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">
                老師寄發電子郵箱 (User Email)
              </label>
              <input
                type="email"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="teacher@chhs.hcc.edu.tw"
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono bg-slate-50/20"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">
                發信密碼 / 應用程式授權金鑰 (Password)
              </label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••••••••"
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono bg-slate-50/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-600 font-semibold">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                className="rounded border-slate-250 text-teal-600 focus:ring-teal-555"
              />
              採用 SSL/TLS 安全通道 (Secure Tunnel)
            </label>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleSaveSmtp}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10.5px] rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-3xs"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>儲存設定</span>
              </button>

              <button
                type="button"
                disabled={isTestingSmtp}
                onClick={handleTestSmtp}
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10.5px] rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Send className="w-3 h-3 text-emerald-600" />
                <span>發送認證測試信</span>
              </button>
            </div>
          </div>

          {saveSuccessToast && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold text-left">
              ✅ SMTP 設定已成功持久、安全地保存至您的 Google 瀏覽器儲存槽！無須每次重複輸入。
            </div>
          )}

          {testEmailStatus && (
            <div className={`p-3 rounded-lg text-xs leading-normal font-normal text-left border ${
              testEmailStatus.type === "success" 
                ? "bg-teal-50 border-teal-200 text-teal-800" 
                : testEmailStatus.type === "error"
                ? "bg-rose-50 border-rose-100 text-rose-800"
                : "bg-slate-50 border-slate-100 text-slate-700 animate-pulse"
            }`}>
              {testEmailStatus.msg}
            </div>
          )}
        </div>
      </div>

      {/* 2. Bulk emails auto-populator generator */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-3xs p-4 space-y-3.5 text-left">
        <div>
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            快速設定全班常用信箱預設 Domain Preset
          </h4>
          <p className="text-[10px] text-slate-400 mt-0.5">
            適合學校已統一配發 student01、student02 這類帳號的情境；網域可自行改成任何學校或機構網域。
          </p>
        </div>

        <div className="flex gap-2.5 items-end max-w-md">
          <div className="flex-1">
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
              學校網域 (School Domain Extension)
            </label>
            <input
              type="text"
              value={emailDomain}
              onChange={(e) => onSetEmailDomain(e.target.value)}
              placeholder="@school.edu.tw"
              className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleApplyPreset}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer transition-colors"
            >
              ⚡ 自動生成全班預設信箱
            </button>
          </div>
        </div>
      </div>

      {/* 3. Automatic delivery control center for GSAT translation errors */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden text-left">
        <div className="bg-teal-900 text-white p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-cyan-300" />
            <div>
              <h3 className="font-bold text-xs text-white">大考中英翻譯 A4 紅筆對照：智慧全自動配送排隊中心</h3>
              <span className="text-[9px] text-teal-200 block -mt-0.5">GSAT Automated Red-Ink PDF Email Queue Runner</span>
            </div>
          </div>

          <div className="flex gap-2">
            {batchProgress.status === "idle" || batchProgress.status === "finished" ? (
              <button
                type="button"
                onClick={runBatchEmailQueue}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                啟動批次排程發送
              </button>
            ) : batchProgress.status === "running" ? (
              <button
                type="button"
                onClick={handlePauseQueue}
                className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold py-1 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Pause className="w-3.5 h-3.5" />
                暫停排程發送
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResumeQueue}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                點此繼續發送
              </button>
            )}
          </div>
        </div>

        {/* Batch Queue Progress Bar */}
        {(batchProgress.status !== "idle") && (
          <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-2">
                {batchProgress.status === "finished" ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold py-0.5 px-2 rounded-full">
                    🎉 傳送完畢 COMPLETE!
                  </span>
                ) : batchProgress.status === "paused" ? (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold py-0.5 px-2 rounded-full">
                    ⏸️ 當前暫停 PAUSED
                  </span>
                ) : (
                  <span className="bg-teal-100 text-teal-800 text-[10px] font-bold py-0.5 px-2 rounded-full flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    正在全自動包裝配送中...
                  </span>
                )}
                <span>全班進度: {batchProgress.current} / {batchProgress.total} 人</span>
              </span>

              <span className="font-mono text-slate-500 font-semibold">
                失敗數：<span className="text-rose-600">{batchProgress.errorsCount}</span> 封
              </span>
            </div>

            {/* Slider visual track */}
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  batchProgress.status === "finished" 
                    ? "bg-emerald-500" 
                    : batchProgress.status === "paused" 
                    ? "bg-amber-500" 
                    : "bg-teal-600"
                }`}
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              ></div>
            </div>

            {/* Micro Live Logs */}
            <div className="bg-slate-900 text-emerald-400 font-mono text-[9.5px] p-2.5 rounded-lg h-24 overflow-y-auto space-y-1 block border border-slate-950">
              {batchProgress.log.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-normal">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Email Import */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 space-y-3.5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-indigo-500" />
                整批貼上學生 Email 名單
              </h4>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                支援兩種格式：① 每行一個 Email，依座號順序填入；② 從 Excel 複製「座號 + Email」兩欄，系統會依座號精準對應。
              </p>
            </div>
            <div className="text-[9.5px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono">
              Gmail / Outlook / Yahoo / 學校網域皆可
            </div>
          </div>

          <textarea
            value={bulkEmailText}
            onChange={(e) => {
              setBulkEmailText(e.target.value);
              if (bulkEmailImportStatus) setBulkEmailImportStatus(null);
            }}
            rows={7}
            placeholder={`每行一個 Email：
amy@gmail.com
tom@outlook.com
student03@school.edu.tw

或從 Excel 直接貼上兩欄：
1	amy@gmail.com
2	tom@outlook.com
3	student03@school.edu.tw`}
            className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 resize-y"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] text-slate-500 leading-relaxed">
              提醒：若只貼 Email，第一行會填入 01 號、第二行填入 02 號；若貼「座號 + Email」，則不受排序或缺號影響。
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClearBulkEmailText}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-bold text-[10.5px] rounded-lg cursor-pointer transition-colors"
              >
                清空貼上內容
              </button>
              <button
                type="button"
                onClick={handleBulkEmailImport}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                📥 匯入並填入下方名單
              </button>
            </div>
          </div>

          {bulkEmailImportStatus && (
            <div className="p-2 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold text-left">
              {bulkEmailImportStatus}
            </div>
          )}
        </div>

        {/* Student Lists & customized emails inputs */}
        <div className="p-3">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 text-[9.5px] font-bold uppercase bg-slate-50/50">
                <th className="py-2.5 px-3">座號</th>
                <th className="py-2.5 px-3">批改狀態(OCR)</th>
                <th className="py-2.5 px-3">大考翻譯得分</th>
                <th className="py-2.5 px-3">學生電子信箱 (可直接點入隨時修改保存)</th>
                <th className="py-2.5 px-3 text-right">單人指引寄信</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const isAbsent = student.status === "absent";
                const isGraded = student.status === "graded";
                const isActiveInQueue = batchProgress.activeSeat === student.seatNumber;

                if (isAbsent) {
                  return (
                    <tr key={student.seatNumber} className="hover:bg-slate-50/50 text-slate-400/80">
                      <td className="py-2 px-3 font-mono font-bold">{student.seatNumber.toString().padStart(2, "0")} 號</td>
                      <td className="py-2 px-3" colSpan={3}>
                        <span className="bg-slate-100 text-slate-400 px-1.5 py-0.2 rounded font-semibold text-[9px]">
                          缺席 Absent (略過發送)
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">-</td>
                    </tr>
                  );
                }

                return (
                  <tr 
                    key={student.seatNumber} 
                    className={`hover:bg-slate-50 transition-colors ${
                      isActiveInQueue ? "bg-teal-50/70 font-semibold" : ""
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">
                      {student.seatNumber.toString().padStart(2, "0")} 號
                    </td>
                    <td className="py-2 px-3">
                      {isGraded ? (
                        <span className="text-[9.5px] bg-emerald-50 border border-emerald-250 text-emerald-800 font-semibold px-2 py-0.2 rounded">
                          已評卷
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-slate-400 italic">
                          仍待答
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-slate-700">
                      {isGraded ? `${(student.score1 || 0) + (student.score2 || 0)} / 8.0 Pts` : "-"}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="email"
                        value={student.email || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onSetStudents((prev) =>
                            prev.map((s) =>
                              s.seatNumber === student.seatNumber
                                ? { ...s, email: val }
                                : s
                            )
                          );
                        }}
                        placeholder={`例如: student${student.seatNumber.toString().padStart(2, "0")}@school.edu.tw 或 gmail/outlook 信箱`}
                        className="w-full text-xs p-1 px-2 border border-slate-250 rounded bg-white focus:ring-1 focus:ring-indigo-500 font-mono outline-hidden"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isGraded ? (
                        <button
                          type="button"
                          disabled={batchProgress.status === "running" || !student.email || !student.email.includes("@")}
                          onClick={async () => {
                            if (!student.email) return;
                            alert(`正在寄送第 ${student.seatNumber} 號學生的紅墨水 PDF 報告至【${student.email}】。這需要數秒鐘進行 Canvas 渲染，請點選確定並稍候。`);
                            try {
                              const activeSmtp = { host, port: Number(port), user, pass, secure };
                              const res = await sendStudentEmailReport(student, promptAnalysis, activeSmtp, student.email);
                              alert(res.msg);
                            } catch (e: any) {
                              alert(`寄信意外失敗原因：\n${e.message || e}`);
                            }
                          }}
                          className={`font-semibold text-[9.5px] py-1 px-2 rounded-md transition-all cursor-pointer ${
                            !student.email || !student.email.includes("@")
                              ? "bg-slate-150 text-slate-400 cursor-not-allowed"
                              : "bg-slate-800 hover:bg-slate-700 text-white"
                          }`}
                        >
                          ✉️ 傳發紅字信
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="bg-slate-50 text-slate-300 font-semibold text-[9.5px] py-1 px-2 rounded-md cursor-not-allowed border border-slate-100"
                        >
                          無評分
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
