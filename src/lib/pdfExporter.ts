import { jsPDF } from "jspdf";
import { StudentGrading, PromptAnalysis } from "../types";

// Helper to wrap text according to width
function wrapTextGeneral(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(text);
  if (hasCJK) {
    const chars = Array.from(text);
    const lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char === "\n") {
        lines.push(currentLine);
        currentLine = "";
        continue;
      }
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines.filter(l => l.length > 0 || l === "");
  } else {
    const paragraphs = text.split("\n");
    const lines: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(" ");
      let currentLine = "";
      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine + (currentLine ? " " : "") + words[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = words[n];
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);
    }
    return lines;
  }
}

// Draw a nice rounded box
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillColor?: string,
  strokeColor?: string,
  lineWidth?: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
  }
}

export async function exportAnnotatedReportsPdf(
  students: StudentGrading[],
  promptAnalysis: PromptAnalysis | null,
  lang: "zh" | "en" | "bilingual" = "bilingual"
): Promise<void> {
  const gradedStudents = students.filter(s => s.status === "graded");
  if (gradedStudents.length === 0) {
    alert(lang === "zh" ? "📌 目前尚無任何已完成批改的學生作答可進行紅筆批註匯出！" : "📌 No graded student records available to export!");
    return;
  }

  // Create a multi-page jsPDF document
  // standard A4 in pt: 595.28 x 841.89 pt. 
  // We'll create it portrait orientation.
  const pdf = new jsPDF("p", "mm", "a4");
  
  // Sort students by seat number
  gradedStudents.sort((a, b) => a.seatNumber - b.seatNumber);

  // We loop over students and generate a campus page for each
  for (let idx = 0; idx < gradedStudents.length; idx++) {
    const student = gradedStudents[idx];
    
    // Add page if not first
    if (idx > 0) {
      pdf.addPage();
    }

    // Set page index text or status
    pdf.setFillColor(250, 249, 245); // Background
    
    // We will build a high-resolution canvas layout
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1700;
    const ctx = canvas.getContext("2d")!;

    // 1. Fill light cream vintage theme background
    ctx.fillStyle = "#faf9f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw border frame
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 25, canvas.width - 50, canvas.height - 50);

    // 3. Header Title Block
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText("學科能力測驗 · 英文科翻譯批閱報告", 60, 75);
    
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#0d9488";
    ctx.fillText("GSAT ENGLISH TRANSLATION - RED INK CORRECTION SHEET", 60, 105);

    // Seat info block
    ctx.fillStyle = "#334155";
    ctx.font = "16px monospace";
    ctx.fillText(`學號/座號：第 ${student.seatNumber.toString().padStart(2, "0")} 號`, 60, 140);
    ctx.fillText(`課堂大考檢定：${promptAnalysis ? "已分析" : "模擬檢定"}`, 320, 140);
    ctx.fillText(`匯出日期：${new Date().toLocaleDateString()}`, 580, 140);

    // 4. CIRCLE GRADE STAMP (Teacher's handcrafted red pen score)
    ctx.save();
    ctx.translate(1040, 100);
    ctx.rotate(-8 * Math.PI / 180); // tilt it slightly like a real hand stamp

    // Outer circle
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    // Use slightly uneven radius to simulate real ink stamp
    ctx.arc(0, 0, 68, 0, 2 * Math.PI);
    ctx.stroke();

    // Inner dotted circle
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 61, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Red Score title
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#e11d48";
    ctx.textAlign = "center";
    ctx.fillText("GSAT GRADE", 0, -32);

    // Large Red Score digits
    ctx.font = "bold 44px Georgia, serif";
    ctx.fillStyle = "#be123c";
    ctx.fillText(student.totalScore?.toFixed(1) || "0.0", 0, 13);

    // Points label
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#e11d48";
    ctx.fillText("/ 8.0 PTS", 0, 36);

    ctx.restore();

    // Divider line
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 165);
    ctx.lineTo(1140, 165);
    ctx.stroke();

    // 5. STUDENT HANDWRITING PAPER PREVIEW BOX OR NOTEBOOK PAGE
    // Draw Box Wrapper
    drawRoundedRect(ctx, 60, 185, 1080, 280, 8, "#ffffff", "#e2e8f0", 1.5);
    
    // Label
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("學生手寫考卷原始圖像/作答文字 (STUDENT TRANSLATION CAPTURE)", 75, 210);

    let imageLoaded = false;
    
    // If the student has uploaded an image or has mock svg, let's load and draw it
    if (student.studentInputImage) {
      try {
        const img = new Image();
        img.src = student.studentInputImage;
        await new Promise((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, 75, 225, 1050, 225);
            imageLoaded = true;
            resolve(true);
          };
          img.onerror = () => {
            resolve(false);
          };
        });
      } catch (err) {
        console.warn("Could not render student handwriting image to Canvas: ", err);
      }
    }

    // Default or Fallback: Draw as lined paper notebook with student's texts if image load failed or wasn't there
    if (!imageLoaded) {
      // Draw notebook lines
      ctx.strokeStyle = "#93c5fd";
      ctx.lineWidth = 1;
      for (let y = 250; y <= 430; y += 45) {
        ctx.beginPath();
        ctx.moveTo(80, y);
        ctx.lineTo(1120, y);
        ctx.stroke();
      }
      
      // Draw left vertical margin border line
      ctx.strokeStyle = "#fca5a5";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(150, 225);
      ctx.lineTo(150, 445);
      ctx.stroke();

      // Write student text over notebook lines in ink blue
      ctx.fillStyle = "#1d4ed8"; // Ink blue
      ctx.font = "italic 16px Courier, monospace";
      
      const s1 = student.ocrSentence1 || "No translation submitted for Sentence 1.";
      const s2 = student.ocrSentence2 || "No translation submitted for Sentence 2.";

      const optS1Lines = wrapTextGeneral(ctx, s1, 940);
      let textY = 242;
      for (let i = 0; i < Math.min(2, optS1Lines.length); i++) {
        ctx.fillText(optS1Lines[i], 165, textY);
        textY += 45;
      }
      
      const optS2Lines = wrapTextGeneral(ctx, s2, 940);
      textY = 332;
      for (let i = 0; i < Math.min(2, optS2Lines.length); i++) {
        ctx.fillText(optS2Lines[i], 165, textY);
        textY += 45;
      }
    }

    // 6. SENTENCE 1 CORRECTIONS BOX
    // Frame & Title
    drawRoundedRect(ctx, 60, 485, 1080, 410, 8, "#fefaf0", "#fbd38d", 1.5);
    
    ctx.fillStyle = "#8a5b06";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("▼ 第一句點評與紅筆糾錯 (SENTENCE 1 CRITIQUE & ANNOTATIONS)", 80, 515);
    
    // Sentence Score
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = "#b7791f";
    ctx.fillText(`得分 (Score): ${student.score1?.toFixed(1)} / 4.0 分`, 920, 515);

    // Original transcribed sentence
    ctx.font = "italic 14px monospace";
    ctx.fillStyle = "#475569";
    ctx.fillText("學生原始作答：", 80, 550);
    ctx.font = "bold 15px Courier, monospace";
    ctx.fillStyle = "#1e293b";
    
    const s1Lines = wrapTextGeneral(ctx, student.ocrSentence1 || "No translation submitted.", 1000);
    let s1Y = 575;
    s1Lines.slice(0, 2).forEach((line, lIdx) => {
      ctx.fillText(line, 100, s1Y + (lIdx * 25));
    });

    // Draw Errors
    let errorsY1 = 635;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#e11d48";
    ctx.fillText("✍️ 紅筆糾錯與建議 (Red Corrections):", 80, errorsY1);
    
    errorsY1 += 25;
    if (student.errors1 && student.errors1.length > 0) {
      // Render up to 2 error cards
      student.errors1.slice(0, 2).forEach((err, errIdx) => {
        drawRoundedRect(ctx, 80, errorsY1, 1040, 70, 6, "#fff5f5", "#fecaca", 1);
        
        // Error Type Tag
        ctx.fillStyle = "#e11d48";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`型態: ${err.errorType}`, 95, errorsY1 + 25);

        // Score deduction tag
        ctx.fillStyle = "#be123c";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`-${err.pointsDeducted} Pts`, 1010, errorsY1 + 25);

        // Correction strike-through
        ctx.fillStyle = "#94a3b8";
        ctx.font = "line-through 13px Courier, monospace";
        ctx.fillText(err.originalSegment, 185, errorsY1 + 25);
        
        // Strike lines
        const origWidth = ctx.measureText(err.originalSegment).width;
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(185, errorsY1 + 21);
        ctx.lineTo(185 + origWidth, errorsY1 + 21);
        ctx.stroke();

        ctx.fillStyle = "#475569";
        ctx.font = "13px sans-serif";
        ctx.fillText(" ➔  修正:", 185 + origWidth + 5, errorsY1 + 25);

        ctx.fillStyle = "#047857";
        ctx.font = "bold 14px Courier, monospace";
        ctx.fillText(err.suggestedSegment, 185 + origWidth + 70, errorsY1 + 25);

        // Explanation text
        ctx.fillStyle = "#475569";
        ctx.font = "italic 11.5px sans-serif";
        ctx.fillText(err.explanation, 95, errorsY1 + 50);

        errorsY1 += 80;
      });
    } else {
      ctx.fillStyle = "#059669";
      ctx.font = "italic 13px sans-serif";
      ctx.fillText("🎉 卓越翻譯！未檢測到語法或拼寫錯誤 (No errors found).", 100, errorsY1 + 25);
      errorsY1 += 45;
    }

    // Teacher's comment S1
    ctx.fillStyle = "#334155";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("💡 第一句寫作點評 feedback:", 80, 835);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#475569";
    const commentLines1 = wrapTextGeneral(ctx, student.feedback1 || "無", 1000);
    ctx.fillText(commentLines1[0] || "", 105, 860);
    if (commentLines1[1]) ctx.fillText(commentLines1[1], 105, 882);


    // 7. SENTENCE 2 CORRECTIONS BOX
    // Frame & Title
    drawRoundedRect(ctx, 60, 915, 1080, 410, 8, "#faf5ff", "#d6bcfa", 1.5);
    
    ctx.fillStyle = "#5b21b6";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("▼ 第二句點評與紅筆糾錯 (SENTENCE 2 CRITIQUE & ANNOTATIONS)", 80, 945);
    
    // Sentence Score
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = "#6b21a8";
    ctx.fillText(`得分 (Score): ${student.score2?.toFixed(1)} / 4.0 分`, 920, 945);

    // Original transcribed sentence
    ctx.font = "italic 14px monospace";
    ctx.fillStyle = "#475569";
    ctx.fillText("學生原始作答：", 80, 980);
    ctx.font = "bold 15px Courier, monospace";
    ctx.fillStyle = "#1e293b";
    
    const s2Lines = wrapTextGeneral(ctx, student.ocrSentence2 || "No translation submitted.", 1000);
    let s2Y = 1005;
    s2Lines.slice(0, 2).forEach((line, lIdx) => {
      ctx.fillText(line, 100, s2Y + (lIdx * 25));
    });

    // Draw Errors
    let errorsY2 = 1065;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#e11d48";
    ctx.fillText("✍️ 紅筆糾錯與建議 (Red Corrections):", 80, errorsY2);
    
    errorsY2 += 25;
    if (student.errors2 && student.errors2.length > 0) {
      // Render up to 2 error cards
      student.errors2.slice(0, 2).forEach((err, errIdx) => {
        drawRoundedRect(ctx, 80, errorsY2, 1040, 70, 6, "#fff5f5", "#fecaca", 1);
        
        // Error Type Tag
        ctx.fillStyle = "#e11d48";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`型態: ${err.errorType}`, 95, errorsY2 + 25);

        // Score deduction tag
        ctx.fillStyle = "#be123c";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`-${err.pointsDeducted} Pts`, 1010, errorsY2 + 25);

        // Correction strike-through
        ctx.fillStyle = "#94a3b8";
        ctx.font = "line-through 13px Courier, monospace";
        ctx.fillText(err.originalSegment, 185, errorsY2 + 25);
        
        // Strike lines
        const origWidth = ctx.measureText(err.originalSegment).width;
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(185, errorsY2 + 21);
        ctx.lineTo(185 + origWidth, errorsY2 + 21);
        ctx.stroke();

        ctx.fillStyle = "#475569";
        ctx.font = "13px sans-serif";
        ctx.fillText(" ➔  修正:", 185 + origWidth + 5, errorsY2 + 25);

        ctx.fillStyle = "#047857";
        ctx.font = "bold 14px Courier, monospace";
        ctx.fillText(err.suggestedSegment, 185 + origWidth + 70, errorsY2 + 25);

        // Explanation text
        ctx.fillStyle = "#475569";
        ctx.font = "italic 11.5px sans-serif";
        ctx.fillText(err.explanation, 95, errorsY2 + 50);

        errorsY2 += 80;
      });
    } else {
      ctx.fillStyle = "#059669";
      ctx.font = "italic 13px sans-serif";
      ctx.fillText("🎉 卓越翻譯！未檢測到語法或拼寫錯誤 (No errors found).", 100, errorsY2 + 25);
      errorsY2 += 45;
    }

    // Teacher's comment S2
    ctx.fillStyle = "#334155";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("💡 第二句寫作點評 feedback:", 80, 1265);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#475569";
    const commentLines2 = wrapTextGeneral(ctx, student.feedback2 || "無", 1000);
    ctx.fillText(commentLines2[0] || "", 105, 1290);
    if (commentLines2[1]) ctx.fillText(commentLines2[1], 105, 1312);


    // 8. CRITIQUE AND BEST RECOMMENDATION 
    drawRoundedRect(ctx, 60, 1345, 1080, 290, 8, "#090d16", "#1e293b", 1.5);
    
    // Critique left side, best recommendation right side / split or stacked
    // Stacked looks best inside cards
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("📜 本卷大考題主體語病問題診斷 (DIAGNOSTIC CRITIQUE)", 80, 1380);
    
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    const critiqueLines = wrapTextGeneral(ctx, student.majorIssues || "無重大語病，文法掌握度高。", 1040);
    critiqueLines.slice(0, 3).forEach((line, clIdx) => {
      ctx.fillText(line, 80, 1410 + (clIdx * 24));
    });

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 1495);
    ctx.lineTo(1120, 1495);
    ctx.stroke();

    ctx.fillStyle = "#34d399";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("🌟 大考高分高標示範佳句推薦 (BEST RECOMMENDED WRITING & IMPROVEMENT)", 80, 1530);
    
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold italic 15.5px Courier, monospace";
    const improvedLines = wrapTextGeneral(ctx, student.improvedVersion || "", 1040);
    improvedLines.slice(0, 2).forEach((line, impIdx) => {
      ctx.fillText(line, 85, 1568 + (impIdx * 25));
    });


    // 9. Render high resolution canvas into A4 PDF
    const pageImgData = canvas.toDataURL("image/jpeg", 0.95);
    
    // Add image fit to whole A4 page (595 x 842 pt usually, but in standard mm it's 210 x 297)
    pdf.addImage(pageImgData, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  }

  // Save the file
  pdf.save(`GSAT_Class_Red_Ink_Annotations_${new Date().toISOString().split('T')[0]}.pdf`);
}
