export interface DemoPrompt {
  id: string;
  sentence1Chinese: string;
  sentence2Chinese: string;
  tag: string;
}

export interface DemoStudentSubmission {
  seatNumber: number;
  textInput: string;
  handwritingImage?: string; // Svg simulated text-card
  notes: string;
}

export const DEMO_PROMPTS: DemoPrompt[] = [
  {
    id: "univ",
    sentence1Chinese: "許多學生在選擇大學學系時會感到焦慮與迷惘。",
    sentence2Chinese: "然而，透過自我探索和諮詢專家，他們能做出更合適的決定。",
    tag: "大學選系 (University Selection)"
  },
  {
    id: "climate",
    sentence1Chinese: "近年來，極端氣候對全球農業造成了嚴重的衝擊。",
    sentence2Chinese: "我們必須採取具體行動，以確保糧食供應的穩定。",
    tag: "極端氣候 (Extreme Climate)"
  },
  {
    id: "privacy",
    sentence1Chinese: "在社群媒體時代，保護個人隱私變得比以往更加困難。",
    sentence2Chinese: "因此，使用者在網路上分享個人資訊時，應該保持高度警覺。",
    tag: "社群隱私 (Social Media & Privacy)"
  }
];

// Pre-defined student handwritten simulation responses for "univ" prompt
// This allows teachers to test the OCR + grading with live API without uploading real files
export const DEMO_STUDENT_SUBMISSIONS: DemoStudentSubmission[] = [
  {
    seatNumber: 1,
    textInput: "Many students feel anxious and lost when choosing a university department.\nHowever, through self-exploration and consulting experts, they can make a more appropriate decision.",
    notes: "High proficiency. Natural word choices and correct subject-verb agreements."
  },
  {
    seatNumber: 2,
    textInput: "Lots of student feel super anxious and lose in select college depart.\nBut through auto exploration and talking to exports, they can make a better decide.",
    notes: "Medium-low proficiency. Multiple grammatical errors: 'Lots of student' (plural mismatch), 'depart' (noun form), 'auto exploration', 'exports' (confused with experts), 'make a better decide'."
  },
  {
    seatNumber: 3,
    textInput: "Numerous students feel anxiety and confused when they chose university major.\nNever the less, and consult experts, they will make more appropriate decision.",
    notes: "Medium proficiency. Grammatical errors: 'feel anxiety' (confused with anxious/feeling anxious), tense mistake ('chose' instead of choose), spelling of 'nevertheless' split, double coordinating conjunction 'nevertheless and'."
  },
  {
    seatNumber: 4,
    textInput: "Many high schoolers feel anxius and confused while picking university subject.\nHowever, across self-discovery and consulting advisor, they will decide better things.",
    notes: "Medium proficiency. Spelling 'anxius' and preposition error 'across'."
  },
  {
    seatNumber: 5,
    textInput: "Most of the students feel worried and lost during they are choosing major of university.\nBut, with self explorer and counseling with expert, they could make fit decisions.",
    notes: "Medium proficiency. Grammatical slip in 'during they are choosing' and 'self explorer' (noun discrepancy)."
  }
];

// Helper to generate a realistic SVG handwriting mock to simulate visual scans
export function generateHandwritingSvg(seatNo: number, text: string): string {
  // We can return a visual SVG with tilted text lines, faint grid lines, and teacher marking areas
  const lines = text.split('\n');
  let textElements = '';
  lines.forEach((line, index) => {
    // Slight tilt and variation for handwriting look
    const angle = (seatNo * 7 + index * 3) % 4 - 2; // -2 to +1 deg
    const yOffset = 110 + index * 60;
    textElements += `
      <text x="60" y="${yOffset}" 
            font-family="'Playpen Sans', 'Kalam', 'Architects Daughter', 'Comic Sans MS', cursive, sans-serif" 
            font-size="18" 
            transform="rotate(${angle}, 200, ${yOffset})" 
            fill="#1e293b" 
            letter-spacing="0.5">
        ${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </text>
    `;
  });

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 350" width="100%" height="100%" style="border-radius: 8px; background: #fafaf5; border: 1px solid #e2e8f0;">
      <!-- Notebook background pattern -->
      <defs>
        <pattern id="lines" width="100" height="30" patternUnits="userSpaceOnUse">
          <line x1="0" y1="30" x2="100" y2="30" stroke="#e2e8f0" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#fafaf9" />
      <rect width="100%" height="100%" fill="url(#lines)" />
      
      <!-- Blue vertical margin rule -->
      <line x1="50" y1="0" x2="50" y2="350" stroke="#fecdd3" stroke-width="1.5" />
      
      <!-- Student seat banner -->
      <rect x="580" y="20" width="100" height="35" rx="4" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" />
      <text x="630" y="42" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#475569" text-anchor="middle">
        SEAT No. ${seatNo.toString().padStart(2, '0')}
      </text>
      
      <!-- Grading score placeholder -->
      <circle cx="50" cy="50" r="25" fill="none" stroke="#f43f5e" stroke-width="2" stroke-dasharray="2 3" opacity="0.6"/>
      <text x="50" y="55" font-family="'Playpen Sans', cursive, sans-serif" font-size="14" font-weight="bold" fill="#f43f5e" text-anchor="middle" opacity="0.5">
        GSAT
      </text>

      <!-- Handwriting Content -->
      ${textElements}
      
      <!-- Classroom Board Overlay -->
      <rect x="58" y="295" width="220" height="40" rx="3" fill="#f1f5f9" fill-opacity="0.8" stroke="#e2eafe" />
      <text x="68" y="318" font-family="sans-serif" font-size="11" fill="#64748b">
        📄 Student ${seatNo} - Translation Sheet
      </text>
    </svg>
  `;

  // Return as inline data URI
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
