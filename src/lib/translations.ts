export type LangType = "zh" | "en" | "bilingual";

export interface TranslationDictionary {
  [key: string]: {
    zh: string;
    en: string;
    bi?: string; // custom bilingual override if needed
  };
}

export const TRANSLATIONS: TranslationDictionary = {
  // Common
  "seat": { zh: "座號", en: "Seat" },
  "absent": { zh: "缺席", en: "Absent" },
  "present": { zh: "出席", en: "Present" },
  "grading": { zh: "評分中", en: "Grading" },
  "graded": { zh: "已評分", en: "Graded" },
  "waitingGrade": { zh: "待評分", en: "Ungraded" },
  "score": { zh: "分數", en: "Score" },
  "points": { zh: "分", en: "Points" },
  "done": { zh: "完成", en: "Done" },
  "error": { zh: "錯誤", en: "Error" },
  "loading": { zh: "載入中", en: "Loading" },
  "back": { zh: "返回", en: "Back" },
  "clear": { zh: "清除", en: "Clear" },

  // Navigation Header
  "navTitle": {
    zh: "學測翻譯題班級批改器",
    en: "Class-based GSAT Translation AI Grader",
    bi: "Class-based GSAT Translation AI Grader 學測翻譯題班級批改器"
  },
  "navSubtitle": {
    zh: "Designed by Shirley Du",
    en: "Designed by Shirley Du"
  },
  "navEngine": {
    zh: "學術評分：4.0 分扣分制",
    en: "Evaluation: 4.0 Pts Deduction Rubric"
  },

  // Banner Intro Box Description
  "bannerBadge": {
    zh: "教師智慧協同系統",
    en: "TEACHER ASSISTANCE SYSTEM"
  },
  "bannerTitle": {
    zh: "學術大繁至簡：手寫拍照，一秒回饋",
    en: "Simplifying Diagnostics: Snap Handwritings, Get Instant Feedback"
  },
  "bannerDesc": {
    zh: "專為臺灣高中英文學力測驗（GSAT）翻譯題型研發。登錄考題，隨即生成關鍵句法與參考佳句；點選出席座號，透過高精準度 AI OCR 進行雷射剖析，依據國家大考 4.0 分扣分規則進行文法點評、手寫錯字紅線標記，並產出完美的學位範式修辭重組建議。",
    en: "Specifically designed for the Taiwan High School GSAT English translation sub-test. Input translation prompts to instantly generate syntax keys and premium sample solutions; map student seat numbers, then let the system automatically perform precise OCR scanning in compliance with the national 4.0-point grading standard to mark mistakes, generate redline fixes, analyze errors, and suggest alternative revisions."
  },

  // Steps
  "step1": { zh: "設定翻譯考題與 AI 滿分常模", en: "Configure Translation Prompts & AI Target Benchmarks" },
  "step1Sub": { zh: "定義大考中心題幹，Gemini AI 將立刻解析句型、學術片語與佳句常模", en: "Input prompts for Gemini AI to parse structures, core vocabulary, and standard answer ranges" },
  "step2": { zh: "登錄全班座次出席表", en: "Seat & Attendance Logistics Organizer" },
  "step2Sub": { zh: "登錄與排除缺席學生、點選座號檢視評分報表", en: "Log and exclude offline students; click seat numbers to evaluate or review feedback details" },
  "step3": { zh: "全班整批批改控制中心", en: "Class Batch Grading Workspace" },
  "step3Sub": { zh: "批次上傳影像、貼上文字或啟動模擬，全班一次高效評分", en: "Batch upload images, paste texts or run simulated papers to grade the entire class in parallel" },
  "step3Desk": { zh: "個別座位學生批改診斷桌", en: "Individual Seat Interactive Grading Desk" },
  "step3DeskSub": { zh: "個別看診：紅字修正、評閱評語與建議仿寫", en: "Individual diagnosis: word-by-word redlining, evaluation feedback, and upgrade suggestions" },
  "step4": { zh: "全班大會考統計看板與高頻錯題分析", en: "Classroom Performance Dashboard & High-Frequency Misconceptions" },
  "step4Sub": { zh: "班級平均度與常犯語法、單字阻礙之統計大數據", en: "Analyze classroom average, distribution scores, and standard grammar barriers" },
  "step5": { zh: "班級評分總覽總表", en: "Classroom Performance Transcript Records" },
  "step5Sub": { zh: "條列式彙總已受測座位分數，可作為導師匯出大考標準格式參考", en: "List student seat scores, OCR status, and feedback indicators in standard print format" },

  // SeatLayout specifics
  "seatTitle": { zh: "學生座號座次表", en: "Seat & Presence Organizer" },
  "seatDesc": { zh: "登錄與排除缺席學生、點選座號檢視評分報表", en: "Configure attendance; click seat number to review active evaluation" },
  "classSize": { zh: "班級人數:", en: "Class Size:" },
  "seatUnit": { zh: "座號", en: "Seats" },
  "shortcut": { zh: "快捷設定：", en: "Preset Attendance Tools:" },
  "presentAll": { zh: "全班出席", en: "All Present" },
  "absentAll": { zh: "全班請假/排除", en: "All Absent/Exclude" },

  // Batch grading specifics
  "batchGradingHub": { zh: "全班批改與自動分派中心", en: "Class Batch Grading Hub" },
  "batchAttendanceCount": { zh: "當前班級出席人數", en: "Current Attendance Count" },
  "batchLimit": { zh: "最大學生人數限制", en: "Maximum Capacity Limits" },
  "demoBatch": { zh: "一鍵模擬全班", en: "1-Click Class Simulator (Demo)" },
  "uploadedBatch": { zh: "整疊拍照上傳", en: "Batch Uplink (Images)" },
  "textBatch": { zh: "批次貼上打字", en: "Batch Type-In (Text)" },
  "batchImageTitle": { zh: "整疊拍照排序上傳", en: "Sequential Images Batching" },
  "batchImageDesc": { zh: "請在此上傳全班學生的答題拍照。系統將依檔名排序 (alphabetical file names) 依序自動分派至今日出席的學生座號中。", en: "Upload multiple handwritten response captures at once. The platform automatically sorts the files by name alphabetically and pairs them with present student seats sequentially." },
  "batchFolderSuccess": { zh: "已載入 {num} 份文件", en: "Successfully loaded {num} documents" },
  "batchFolderMap": { zh: "對應座位", en: "Maps to Seat" },
  "dragZoneText1": { zh: "選擇多張拍照影像、或將整疊檔案拖曳至此", en: "Select multiple handwriting images or drag entire folders directly here" },
  "dragZoneText2": { zh: "一次支援並批處理最多 60 名學生的手寫拍照影像 (PNG/JPG)", en: "Supports automated parallel layout analysis & processing for up to 60 students at once" },
  "runOcrPipeline": { zh: "排程並啟動 OCR 智能整批批改", en: "Schedule & Fire OCR Academic Grading Pipeline" },
  "pastedTitle": { zh: "班級打字整批登錄", en: "Classroom Text Batch Entry" },
  "pastedTemplateLoader": { zh: "載入出席生作文範本", en: "Load Present Student Essay Templates" },
  "pastedDesc": { zh: "請在下方輸入或貼上整批作答。使用 #座號 (例如 #01, #02) 的標示作為學籍錨定，系統會自行動態分割、登錄與解構學術回饋：", en: "Input or paste cumulative text below. Place # before the seat number (e.g. #01) as anchors. The pipeline parses, assigns, and evaluates each record dynamically:" },
  "runTextPipeline": { zh: "解析並啟動整批翻譯句子批改", en: "Parse & Begin Textual Translation Grading" },
  "simulatorTitle": { zh: "一鍵智能模擬批改全班 (Simulated Batch Evaluation)", en: "Interactive Whole-Class Simulator (Recommended)" },
  "simulatorDesc1": { zh: "平台最受歡迎的展示引擎！系統將為當前所有已勾選出席的座位配置具備寫作難度與真實拼字、文法謬誤的手寫學生卷影像，並同時運行高併發背景多線程評分。", en: "Our finest real-world testing sandbox! Instantly generate realistic student scripts with customized writing styles, mechanical errors, and syntax deficiencies for all present seats, then triggers parallel AI grading queues." },
  "simPending": { zh: "待執行人數", en: "Pending Pool Size" },
  "simVibe": { zh: "手寫筆跡影像等級", en: "Adaptive Script Varieties" },
  "simVibeVal": { zh: "4 種寫作水平隨機調配", en: "4 dynamic handwriting tiers" },
  "simMaxRule": { zh: "最大評分深度", en: "Fulfillment Resolution" },
  "simMaxRuleVal": { zh: "4.0 分扣分學術常模細項", en: "Comprehensive 4.0-point rule set" },
  "runSimButton": { zh: "啟動一鍵全班手寫模擬批改", en: "Activate Classroom Handwriting Simulator" },
  "pipelineMonitor": { zh: "即時評改串接佇列", en: "Real-time Processing Pipeline Queue" },
  "pipelineMonitorDesc": { zh: "顯示與學術 Google Gemini 服務與 OCR 轉換節點的傳輸遙測", en: "Monitors active connection telemetry, OCR extraction, and multi-threaded grading" },
  "progressCount": { zh: "評閱進度", en: "Grading Progress" },
  "pipelineLogs": { zh: "即時控制台管道日誌", en: "Cumulative Live Console Logs" },
  "pipelineWaiting": { zh: "等待大專批改佇列啟動...", en: "Awaiting incoming batch request schedules..." },

  // Grading desk individual specifics
  "assessmentBench": { zh: "學生個別學診回饋（雙語）", en: "Student Individual Academic Diagnostics Report" },
  "backButtonText": { zh: "🔙 返回全班整批批改與分派中心", en: "🔙 Return to Class Control Hub" },
  "backToClass": { zh: "返回全班整批批改", en: "Back to Batch Center" },
  "viewReportFor": { zh: "座號 #{seat} 學生卷智慧評核報告表格", en: "Handwriting Evaluation Report for Student Seat #{seat}" },
  "noPromptAlert": { zh: "請先在第一步設定翻譯考題與 AI 常模！", en: "Please configure translation prompt and norms in Step 1 first!" },
  "unsubmittedAlert": { zh: "此學生座號尚無登錄作答資料。請在下方輸入或上傳紙本影像！", en: "This student is present but hasn't submitted yet. Provide raw inputs below!" },
  "academicCardTitle": { zh: "大考中心兩句翻譯評分卡 (Integrated Grading Scorecard)", en: "GSAT Sentence-by-Sentence Score Breakdown" },
  "sentenceTextS1": { zh: "第一句翻譯評擬 (Sentence 1 Assessment)", en: "Sentence 1 Detailed Review" },
  "sentenceTextS2": { zh: "第二句翻譯評擬 (Sentence 2 Assessment)", en: "Sentence 2 Detailed Review" },
  "weightScoreS1": { zh: "第一句評分 (S1 Score)", en: "Sentence 1 Score" },
  "weightScoreS2": { zh: "第二句評分 (S2 Score)", en: "Sentence 2 Score" },
  "totalGrand": { zh: "學測非選擇大本總計分 (Grand Total)", en: "GSAT Grand Total Score" },
  "academicStandard": { zh: "評量基準：大考中心「分段扣分、每錯扣 0.5/0.25」", en: "Rubric standard: Deducts 0.5/0.25 points per grammatic or lexical flaw" },
  "wordRedline": { zh: "原卷高精細 OCR 與紅筆語法劃線劃錯", en: "OCR Extraction & Expert Classroom Redlining Feedback" },
  "correctionText": { zh: "高亮表示：紅字刪除錯詞 / 綠字建議補正單字片語", en: "Highlights: Red strikethroughs represent mistakes / Green elements represent correct replacements" },
  "sentenceTranslationTitle": { zh: "句子實體文字對照與拆解語意", en: "Original Script Contrast & Mechanical Breakdowns" },
  "grammarCorrectionDesc": { zh: "細部扣分剖析 (Grammar & Typography Deductions)", en: "Deduction breakdown items" },
  "noErrorsFound": { zh: "非常好！無可指摘的翻譯答卷，零錯誤扣分。", en: "Excellent! No grammatical or spelling errors identified." },
  "improvedRhetoric": { zh: "名師引進・句型升級與精湛修辭仿寫建議 (Premium Syntactic Refinement)", en: "Premium rhetoric & style enhancement advice" },
  "majorDefectTitle": { zh: "重大語病阻礙審查 (Critical Semantic Barriers)", en: "Critical Grammar & Semantic Obstacles" },
  "submitDeskTitle": { zh: "手寫考卷拍照/打字登錄輸入桌 (Interactive Input Dock)", en: "Interactive Raw Script Submission Terminal" },
  "manualTypeIn": { zh: "文字輸入 (Manuel TextInput)", en: "Manual Essay Entry" },
  "typeS1": { zh: "第一句作答輸入", en: "Input for Sentence 1" },
  "typeS2": { zh: "第二句作答輸入", en: "Input for Sentence 2" },
  "ocrUpload": { zh: "拍照卷智慧 OCR 匯入 (Handwriting Upload)", en: "Academic Script Uplink" },
  "runOcrGrader": { zh: "送出作答並調用 AI 評閱評估", en: "Submit Response & Initiate Academic Grader" },
  "systemGeneratedDemo": { zh: "載入模擬測試卷 (Load Demo Script)", en: "Insert Standard Level Mock Paper" },

  // Table summary
  "tableTitle": { zh: "班級評分總覽總表", en: "Bilingual Transcript Records" },
  "tableDesc": { zh: "條列式彙總已受測座位分數，可作為導師匯出大考標準格式參考", en: "A clean consolidated table for teacher review" },
  "seatCell": { zh: "座號", en: "Seat" },
  "stateCell": { zh: "辨識並批改狀態", en: "OCR Evaluation State" },
  "s1Cell": { zh: "第一句 S1 (4.0)", en: "Sentence S1 (4.0)" },
  "s2Cell": { zh: "第二句 S2 (4.0)", en: "Sentence S2 (4.0)" },
  "totalCell": { zh: "大考總分 (8.0)", en: "Grand Total (8.0)" },
  "issuesCell": { zh: "語法障礙重點", en: "Primary Errors Found" },
  "actionCell": { zh: "作業評分狀態", en: "Action" },
  "isGradedBtn": { zh: "調照檢視", en: "Review Script" },
  "isAbsentLabel": { zh: "未到/缺席", en: "Absent" }
};

export function getTranslation(key: string, lang: LangType, replacements?: Record<string, string>): string {
  const data = TRANSLATIONS[key];
  if (!data) return key;

  let text = "";
  if (lang === "zh") {
    text = data.zh;
  } else if (lang === "en") {
    text = data.en;
  } else {
    // Bilingual mode
    // If the data has a unique custom bilingual display model, use it. Otherwise, join them.
    text = data.bi || `${data.zh} (${data.en})`;
  }

  if (replacements) {
    Object.entries(replacements).forEach(([k, val]) => {
      text = text.replace(`{${k}}`, val);
    });
  }

  return text;
}
