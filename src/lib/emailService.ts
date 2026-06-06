import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { StudentGrading, PromptAnalysis } from "../types";

export interface SmtpConfiguration {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

// Generate Taiwanese GSAT red-ink marked correction sheet in A4 print proportions using html2canvas + jsPDF
export async function generateStudentReportPdf(
  student: StudentGrading,
  prompt: PromptAnalysis | null
): Promise<string> {
  const errors1 = student.errors1 || [];
  const errors2 = student.errors2 || [];
  const totalScore = (student.score1 || 0) + (student.score2 || 0);

  // Setup virtual element for crisp A4 layout render
  const container = document.createElement("div");
  container.setAttribute("id", `temp-pdf-render-seat-${student.seatNumber}`);
  container.style.position = "fixed";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "820px";
  container.style.backgroundColor = "#ffffff";
  container.style.fontFamily = "system-ui, -apple-system, sans-serif";
  container.style.color = "#0f172a";
  container.style.padding = "40px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "22px";

  container.innerHTML = `
    <!-- Top Brand Header -->
    <div style="border-bottom: 3.5px solid #0d9488; padding-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 20px; height: 20px; background-color: #0d9488; border-radius: 4px;"></div>
          <span style="font-size: 13px; font-weight: 800; color: #0d9488; letter-spacing: 1px; text-transform: uppercase;">GSAT English Translation Report</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 6px 0 0 0; letter-spacing: -0.5px;">學測英文翻譯手寫卡：紅筆糾錯回饋與診斷報告</h1>
      </div>
      <div style="text-align: right;">
        <span style="background-color: #0d9488; color: #ffffff; font-size: 12px; font-weight: 800; padding: 5px 10px; border-radius: 6px; font-family: monospace;">
          學號座號：#${student.seatNumber.toString().padStart(2, "0")} 號
        </span>
      </div>
    </div>

    <!-- Scores Widget & Official Grade Stamp -->
    <div style="display: grid; grid-template-columns: 2.2fr 1fr; gap: 20px; align-items: center; margin-top: 5px;">
      <div style="background-color: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="border-right: 1.5px solid #e2e8f0; padding-right: 8px;">
          <h3 style="font-size: 11px; font-weight: 700; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">第一句 score (Sentence 1)</h3>
          <p style="font-size: 22px; font-weight: 900; color: #0d9488; margin: 6px 0 0 0;">
            ${student.score1 !== undefined ? student.score1.toFixed(2) : "0.0"} 
            <span style="font-size: 12px; color: #64748b; font-weight: 500;">/ 4.0 分</span>
          </p>
        </div>
        <div style="padding-left: 8px;">
          <h3 style="font-size: 11px; font-weight: 700; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">第二句 score (Sentence 2)</h3>
          <p style="font-size: 22px; font-weight: 900; color: #0d9488; margin: 6px 0 0 0;">
            ${student.score2 !== undefined ? student.score2.toFixed(2) : "0.0"} 
            <span style="font-size: 12px; color: #64748b; font-weight: 500;">/ 4.0 分</span>
          </p>
        </div>
      </div>

      <!-- Professional Red Round Grading Stamp -->
      <div style="border: 3px dashed #f43f5e; border-radius: 50%; width: 95px; height: 95px; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; transform: rotate(-5deg); box-shadow: 0 0 0 4px #fff, 0 1px 3px rgba(0,0,0,0.05);">
        <div style="text-align: center; color: #f43f5e; font-family: sans-serif;">
          <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.5px; opacity: 0.85;">大考複核</div>
          <div style="font-size: 24px; font-weight: 1000; line-height: 1; margin: 3px 0;">${totalScore.toFixed(2)}</div>
          <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.5px;">級分 8.0 滿分</div>
        </div>
      </div>
    </div>

    <!-- Translations & OCR Answers comparison -->
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <!-- Sentence 1 Section -->
      <div style="background-color: #fafaf9; border-left: 4.5px solid #0d9488; padding: 12px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
        <p style="font-size: 12px; font-weight: bold; color: #0d9488; margin: 0 0 6px 0;">【第一句原題】(Prompt S1): ${prompt?.sentence1Chinese || "尚未匯入原題"}</p>
        <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 0 0 6px 0;">學生考卷抄錄 (Student Answer):</p>
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 12.5px; line-height: 1.5; color: #334155; font-style: italic;">
          "${student.ocrSentence1 || "（未作答 / Blank Submission）"}"
        </div>
      </div>

      <!-- Sentence 2 Section -->
      <div style="background-color: #fafaf9; border-left: 4.5px solid #3b82f6; padding: 12px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
        <p style="font-size: 12px; font-weight: bold; color: #3b82f6; margin: 0 0 6px 0;">【第二句原題】(Prompt S2): ${prompt?.sentence2Chinese || "尚未匯入原題"}</p>
        <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 0 0 6px 0;">學生考卷抄錄 (Student Answer):</p>
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 12.5px; line-height: 1.5; color: #334155; font-style: italic;">
          "${student.ocrSentence2 || "（未作答 / Blank Submission）"}"
        </div>
      </div>
    </div>

    <!-- Red-Ink Marking Board and Explanations -->
    <div>
      <h3 style="font-size: 14px; font-weight: 800; color: #ef4444; border-bottom: 2.5px solid #fecdd3; padding-bottom: 6px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
        🖍️ A4 電腦網頁紅筆修正紀錄 (RED-INK DIAGNOSIS DETAILS)
      </h3>

      ${[...errors1, ...errors2].length === 0 ? `
        <div style="background-color: #f0fdf4; border: 1.5px solid #bbf7d0; color: #15803d; padding: 16px; border-radius: 10px; font-size: 13px; text-align: center; font-weight: bold; font-style: italic;">
          🎉 Excellent Translation Construction! No grammatical, spelling, or vocabulary errors detected!
        </div>
      ` : `
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px 8px; font-weight: bold; color: #334155; width: 110px;">類別 (Type)</th>
              <th style="padding: 10px 8px; font-weight: bold; color: #b91c1c; width: 140px; text-decoration: line-through;">寫法瑕疵 (Error)</th>
              <th style="padding: 10px 8px; font-weight: bold; color: #15803d; width: 140px;">更正引指 (Correction)</th>
              <th style="padding: 10px 8px; font-weight: bold; color: #b91c1c; text-align: center; width: 50px;">扣分</th>
              <th style="padding: 10px 8px; font-weight: bold; color: #475569;">糾錯解析與學習建議 (Taiwanese Chinese Notes)</th>
            </tr>
          </thead>
          <tbody>
            ${[...errors1.map(e => ({ ...e, s: 1 })), ...errors2.map(e => ({ ...e, s: 2 }))].map((err, idx) => `
              <tr style="border-bottom: 1.5px solid #e2e8f0; background-color: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                <td style="padding: 10px 8px; font-weight: 800; color: #ef4444;">
                  [S${err.s}] ${err.errorType}
                </td>
                <td style="padding: 10px 8px; text-decoration: line-through; color: #b91c1c; font-family: monospace; font-weight: bold; word-break: break-all;">
                  ${err.originalSegment}
                </td>
                <td style="padding: 10px 8px; color: #15803d; font-family: monospace; font-weight: bold; word-break: break-all;">
                  ${err.suggestedSegment}
                </td>
                <td style="padding: 10px 8px; text-align: center; color: #b91c1c; font-weight: 800;">
                  -${err.pointsDeducted.toFixed(2)}
                </td>
                <td style="padding: 10px 8px; color: #334155; line-height: 1.4;">
                  ${err.explanation}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>

    <!-- Teacher Comprehensive Counseling Comments -->
    <div style="background-color: #f0fdfa; border: 1.5px solid #ccfbf1; border-radius: 10px; padding: 14px;">
      <h4 style="font-size: 12px; font-weight: 800; color: #0f766e; margin: 0 0 8px 0; border-bottom: 1.5px solid #99f6e4; padding-bottom: 4px;">
        🎯 名師綜合評點與考點預防指引 (Teacher's Professional Feedback)
      </h4>
      <div style="font-size: 11.5px; line-height: 1.5; color: #334155; display: flex; flex-direction: column; gap: 8px;">
        ${student.feedback1 ? `<div><strong style="color: #0d9488;">Sentence 1 回饋：</strong>${student.feedback1}</div>` : ""}
        ${student.feedback2 ? `<div><strong style="color: #2563eb;">Sentence 2 回饋：</strong>${student.feedback2}</div>` : ""}
        ${student.improvedVersion ? `
          <div style="margin-top: 5px; background-color: #ffffff; padding: 8px 12px; border: 1.5px dashed #99f6e4; border-radius: 6px;">
            <strong style="color: #0d9488;">高分推薦寫法 (Re-draft Recommendation)：</strong><br/>
            <span style="font-family: monospace; font-size: 12.5px; font-weight: bold; color: #0f766e; display: inline-block; margin-top: 4px;">
              ${student.improvedVersion}
            </span>
          </div>
        ` : ""}
      </div>
    </div>

    <!-- Print Footer Metadata -->
    <div style="text-align: center; font-size: 9.5px; color: #94a3b8; margin-top: auto; border-top: 1.5px solid #f1f5f9; padding-top: 10px; line-height: 1.5;">
      🏫 本二句翻譯模擬考卷符合大考中心高級中學學科能力測驗 (GSAT) 英文評閱規章。<br/>
      其紅墨水分頁圖檔由 Chrome Canvas 引擎渲染輸出，可作為學生大考複習之關鍵資產。
    </div>
  `;

  document.body.appendChild(container);

  let dataUri = "";
  try {
    // Turn HTML page into base64 image (x2 pixel ratio ensures text sharpness remains pristine)
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    document.body.removeChild(container);

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    dataUri = pdf.output("datauristring");
  } catch (error) {
    // Cleanup if something goes wrong
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    throw error;
  }

  return dataUri;
}

// Generate the beautiful responsive HTML email body delivered to students' mailbox
export function generateStudentEmailHtmlBody(
  student: StudentGrading,
  prompt: PromptAnalysis | null
): string {
  const totalScore = (student.score1 || 0) + (student.score2 || 0);
  const errorsCount = (student.errors1?.length || 0) + (student.errors2?.length || 0);

  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <!-- Email Header banner -->
      <div style="background-color: #0f172a; padding: 25px; text-align: center; border-bottom: 4px solid #0d9488;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">學測英文翻譯模擬測試：紅墨水報告</h2>
        <span style="color: #2dd4bf; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1.5px; display: block; margin-top: 5px;">GSAT Red-Ink Diagnostic Grade Release</span>
      </div>

      <!-- Main Contents -->
      <div style="padding: 24px; color: #334155; line-height: 1.6;">
        <p style="margin-top: 0; font-size: 15px;">同學您好：</p>
        <p>您的 <strong>大考手寫學科翻譯考卷</strong> 已經由大考 AI 標準輔助系統評定完畢！系統已經為您繪製了紅墨水批改 A4 實體考卷 PDF，並已夾帶在本信件附件中，歡迎下載印出複習。</p>
        
        <!-- Score Board card -->
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
          <span style="font-size: 13px; font-weight: bold; color: #166534; text-transform: uppercase;">大考英文翻譯總體得分</span>
          <strong style="font-size: 30px; color: #ef4444; display: block; margin-top: 5px; font-weight: 900;">
            ${totalScore.toFixed(2)} <span style="font-size: 16px; color: #475569; font-weight: normal;">/ 8.0 滿分</span>
          </strong>
          <span style="font-size: 11.5px; color: #15803d; display: block; margin-top: 8px; font-weight: bold;">
            小計：第一句 ${student.score1 !== undefined ? student.score1.toFixed(2) : "0.0"} | 第二句 ${student.score2 !== undefined ? student.score2.toFixed(2) : "0.0"} (共計偵測到 ${errorsCount} 處紅筆扣分點)
          </span>
        </div>

        <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 25px; font-size: 14px;">📝 學生作文作答回顧</h3>
        <blockquote style="margin: 10px 0; padding-left: 12px; border-left: 4px solid #0d9488; font-style: italic; color: #475569; font-size: 13px;">
          <strong>第一句：</strong>"${student.ocrSentence1 || "（未作答）"}"<br/>
          <strong>第二句：</strong>"${student.ocrSentence2 || "（未作答）"}"
        </blockquote>

        <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 25px; font-size: 14px;">🌟 老師專業大考建議</h3>
        <p style="font-size: 13px; color: #475569; background-color: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          ${student.feedback1 ? `<strong>第一句回饋：</strong>${student.feedback1}<br/><br/>` : ""}
          ${student.feedback2 ? `<strong>第二句回饋：</strong>${student.feedback2}` : ""}
        </p>

        ${student.improvedVersion ? `
          <div style="background-color: #ecfdf5; border: 1px dashed #6ee7b7; border-radius: 8px; padding: 12px; margin-top: 15px;">
            <strong style="color: #065f46; font-size: 13px; display: block;">🏆 大考滿級分最推薦写法：</strong>
            <span style="font-family: monospace; font-size: 13px; color: #047857; font-weight: bold; display: block; margin-top: 5px; line-height: 1.4;">
              ${student.improvedVersion}
            </span>
          </div>
        ` : ""}

        <div style="margin-top: 25px; font-size: 12.5px; border-top: 1px solid #e2e8f0; padding-top: 15px; color: #64748b;">
          <strong>【重要指示】</strong>：詳細的句型結構分析、扣分理由詳細解釋以及手寫紅筆圈選卷，已完全收錄在信件之 A4 PDF 附件中，強烈建議您下載附件並列印成紙本檔案，以便進行第二次的手寫複習演練！
        </div>
      </div>

      <!-- Email Footer -->
      <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        大考英文 AI 翻譯校閱工作站 · 本發送程序經由老師主動審核授權。<br/>
        如有任何評分疑問，請直接向您的英文課授課老師提出諮詢。
      </div>
    </div>
  `;
}

// Post student grading, computed HTML email elements, and compiled A4 PDF report to backend /api/send-email endpoint
export async function sendStudentEmailReport(
  student: StudentGrading,
  prompt: PromptAnalysis | null,
  smtpConfig: SmtpConfiguration | null,
  recipientEmail: string
): Promise<{ success: boolean; simulated: boolean; msg: string; detail?: string }> {
  
  // 1. Generate beautiful high-resolution A4 red-ink PDF base64 contents
  const pdfBase64 = await generateStudentReportPdf(student, prompt);

  // 2. Generate stylized HTML email package
  const emailHtml = generateStudentEmailHtmlBody(student, prompt);

  // 3. Dispatch to HTTP Server gateway
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      studentEmail: recipientEmail,
      seatNumber: student.seatNumber,
      pdfBase64,
      htmlContent: emailHtml,
      subject: `【大考英文回饋】座號 #${student.seatNumber.toString().padStart(2, "0")}：學測英語二句紅筆糾錯 PDF 診斷分析表`,
      smtpConfig,
    }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || `HTTP 郵件傳送網關錯誤 狀態碼為 ${res.status}`);
  }

  return await res.json();
}
