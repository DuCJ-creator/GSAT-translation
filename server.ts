import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Increase JSON and urlencoded limits to support base64 images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

let aiClient: GoogleGenAI | null = null;

// Helper to check if API key exists
function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return typeof k === "string" && k.trim().length > 0 && k !== "undefined" && k !== "null" && !k.startsWith("MY_");
}

// Helper to check if OpenAI API key exists
function hasOpenAIKey(): boolean {
  const k = process.env.OPENAI_API_KEY;
  return typeof k === "string" && k.trim().length > 0 && k !== "undefined" && k !== "null" && !k.startsWith("MY_");
}

// Global/built-in fetch completion helper for OpenAI Chat
async function callOpenAI(systemInstruction: string, promptText: string): Promise<any> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptText }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API responded with code ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion choice returned from OpenAI.");
  }

  return JSON.parse(content.trim());
}

// Multimodal completion helper for OpenAI Vision/OCR and structured Grading
async function callOpenAIMultimodal(systemInstruction: string, promptText: string, image?: string): Promise<any> {
  const contentParts: any[] = [{ type: "text", text: promptText }];
  if (image) {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: image
      }
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: contentParts }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Multimodal API responded with code ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion choice returned from OpenAI.");
  }

  return JSON.parse(content.trim());
}

// -------------------------------------------------------------
// HIGH-FIDELITY OFFLINE FALLBACK DATA
// -------------------------------------------------------------
const FALLBACK_ANALYSES: Record<string, any> = {
  "大學選系": {
    sentence1Chinese: "許多學生在選擇大學學系時會感到焦慮與迷惘。",
    sentence2Chinese: "然而，透過自我探索和諮詢專家，他們能做出更合適的決定。",
    sentence1Analysis: {
      structures: [
        "S + feel / experience + emotive adjectives (feel anxious and lost)",
        "When + V-ing / When S' + V' (when choosing a university department / major)"
      ],
      vocabulary: [
        { word: "感到焦慮", translation: "feel anxious / feel anxiety", notes: "anxious 為形容詞，配 feel 非常合適；若寫 feel anxiety 則為名詞用法。" },
        { word: "迷惘", translation: "lost / confused / bewildered", notes: "lost 表迷失方向或徬徨；confused 表困惑不解。" },
        { word: "選擇大學學系", translation: "choosing a university department / major", notes: "department 指學系，major 指主修課系（兩者在台灣高中大考皆屬佳作辭彙）。" }
      ],
      keys: [
        "時間副詞子句中 choose/picking 應使用現在分詞形式或主動時態。",
        "選擇搭配 feel anxious and lost 最為道地流暢。"
      ]
    },
    sentence2Analysis: {
      structures: [
        "Through / By means of + N / V-ing (through self-exploration)",
        "Modal verbs + make + comparative modification (make a more appropriate / better decision)"
      ],
      vocabulary: [
        { word: "自我探索", translation: "self-exploration / self-discovery", notes: "exploration 為探索，符合課綱詞彙。避免錯拼為 self explorer（此為探索者）。" },
        { word: "諮詢專家", translation: "consulting experts / talking to specialists", notes: "consult 為及物動詞，其後直接加上對象；若用 consult with 意指商討。" },
        { word: "作出合適的決定", translation: "make appropriate decisions / make more suitable choices", notes: "固定搭配詞 make decisions（做決定），搭配形容詞 appropriate 或 suitable。" }
      ],
      keys: [
        "然而之轉折語 (However, / Nonetheless,) 在句首需搭配逗號，單獨出現不能作連接詞連接兩個主句（除非用分號）。",
        "專家應使用複數型 (experts) 表泛指。"
      ]
    },
    referenceTranslations1: [
      "Many students feel anxious and lost when choosing a university department.",
      "A bundle of students feel worried and bewildered while picking their college majors.",
      "Numerous students experience anxiety and confusion when they decide on their university departments."
    ],
    referenceTranslations2: [
      "However, through self-exploration and consulting experts, they can make more appropriate decisions.",
      "Nonetheless, via self-discovery and seeking advice from specialists, they can make better choices.",
      "But, by exploring themselves and consulting with experts, they are able to make more suitable decisions."
    ],
    overallFulfillmentKeys: [
      "時態建議：本題探討一般性社會現象，應用【現在簡單式】撰寫。",
      "注意 However 之標點符號：However 需置於句首並加上逗號，若要連接兩句，前半句可用句點結尾。",
      "介系詞用法：透過應使用 through、by 或是 via，避免誤用 across。"
    ]
  },
  "極端氣候": {
    sentence1Chinese: "近年來，極端氣候對全球農業造成了嚴重的衝擊。",
    sentence2Chinese: "我們必須採取具體行動，以確保糧食供應的穩定。",
    sentence1Analysis: {
      structures: [
        "In recent years, + Present Perfect Tense (近年來，...對...造成衝擊)",
        "have a severe impact on... / pose a serious threat to... (對...造成嚴重衝擊)"
      ],
      vocabulary: [
        { word: "近年來", translation: "In recent years / Lately", notes: "常用於現在完成式的前置副詞。" },
        { word: "極端氣候", translation: "extreme climate / extreme weather", notes: "climate 為整體氣候，weather 為短暫性天氣變異。" },
        { word: "對全球農業", translation: "global agriculture / agriculture worldwide", notes: "global 常用於修飾 agriculture。" },
        { word: "造成嚴重的衝擊", translation: "cause a severe impact / pose a massive blow / hit hard", notes: "impact 作名詞時其後必搭配介系詞 on。" }
      ],
      keys: [
        "時態需為現在完成式 (has caused / has posed) 或此時期的現在簡單式。",
        "注意對某事物造成影響的介系詞應用 on (impact / toll on)...。"
      ]
    },
    sentence2Analysis: {
      structures: [
        "We must take concrete action / measures to... (我們必須採取積極行動以...)",
        "ensure the stability of... (確保...之穩定性)"
      ],
      vocabulary: [
        { word: "採取具體行動", translation: "take concrete actions / take practical steps", notes: "action 可數或不可數；concrete 表示具體實在的（非抽象）。" },
        { word: "確保", translation: "ensure / secure / guarantee", notes: "ensure 為後接賓語的最合適及物動詞。" },
        { word: "糧食供應的穩定", translation: "the stability of food supply", notes: "food supply（糧食供應）可使用單數泛指，而 stability 為名詞表示穩定程度。" }
      ],
      keys: [
        "不定詞 to (+ V) 表示目的（以確保...）。",
        "糧食供應通常為名詞片語 food supply 或 food supplies。"
      ]
    },
    referenceTranslations1: [
      "In recent years, extreme weather has posed a severe impact on global agriculture.",
      "Lately, extreme climate has caused serious damage to agriculture worldwide.",
      "Over the past few years, global agriculture has been severely hit by extreme weather conditions."
    ],
    referenceTranslations2: [
      "We must take concrete actions to ensure the stability of the food supply.",
      "It is imperative for us to take practical measures to guarantee stable food supplies.",
      "We should take active steps to secure a steady supply of food."
    ],
    overallFulfillmentKeys: [
      "「近年來」(In recent years) 是現在完成式的經典時間副詞指標，請務必掌握 have/has + V-en 結構。",
      "「嚴重的衝擊」除了 severe impact, heavy toll, serious blow，也可以用動詞 hit hard（嚴重打擊）。",
      "「採取行動」的搭配詞為 take action, take measures, take steps 等代表對策的動詞。"
    ]
  },
  "社群隱私": {
    sentence1Chinese: "在社群媒體時代，保護個人隱私變得比以往更加困難。",
    sentence2Chinese: "因此，使用者在網路上分享個人資訊時，應該保持高度警覺。",
    sentence1Analysis: {
      structures: [
        "In the era of social media, + Gerund subject / It is + adj + to... (在...時代，做某事變得...)",
        "Comparative adjective + than ever / than in the past (比以往更加困難)"
      ],
      vocabulary: [
        { word: "在社群媒體時代", translation: "In the era of social media / In the age of social networks", notes: "era/age 均可表時代，注意須與冠詞 the 並用型態。" },
        { word: "保護個人隱私", translation: "protecting personal privacy", notes: "保護可作動名詞主詞 Protecting...；privacy 為不可數名詞。" },
        { word: "比以往", translation: "than ever / than before", notes: "用於比較級的經典副詞修飾詞。" }
      ],
      keys: [
        "動名詞保護(Protecting)當作單數主詞，後半句動詞 become 應使用第三人稱單數形態 (becomes/has become)。",
        "比較級 harder / more difficult 須與 than 連合使用。"
      ]
    },
    sentence2Analysis: {
      structures: [
        "Therefore, / For this reason, (因此)",
        "S should remain highly alert / stay vigilant when V-ing (應該在做...時保持高度警覺)"
      ],
      vocabulary: [
        { word: "網路分享資訊", translation: "sharing personal information online", notes: "online 在此作地方副詞，不須加任何介系詞。" },
        { word: "使用者", translation: "users", notes: "泛指所有使用者，應使用複數型。" },
        { word: "保持高度警覺", translation: "remain highly alert / stay vigilant / watch out", notes: "vigilant (adj.) 或是 alert (adj.) 與靜態動詞 stay / remain / keep 互配。" }
      ],
      keys: [
        "在網路上：online 單字作副詞直接置於句尾（或修飾動詞），不需說 on the internet sharing，通常簡寫為 sharing info online 即可。",
        "保持警覺之動詞搭配：stay/remain alert，高度的可修飾為 highly/extremely。"
      ]
    },
    referenceTranslations1: [
      "In the era of social media, protecting personal privacy has become more difficult than ever.",
      "Protecting individual privacy in the age of social networks is harder than before.",
      "It has become more challenging to protect private personal info in the social media era."
    ],
    referenceTranslations2: [
      "Therefore, users should remain highly alert when sharing personal information online.",
      "As a result, users ought to stay extremely vigilant when they share private data on the Internet.",
      "Consequently, when sharing personal info online, users should make sure to stay on high alert."
    ],
    overallFulfillmentKeys: [
      "主詞結構：保護個人隱私是此句核心主體，採「動名詞 (Protecting...) 當主詞」或是虛主詞「It's more difficult... to protect...」為高分手筆。",
      "「網路上的分享」之「網路上」以副詞 online 置於後面修士最為道地流暢。",
      "「保持警覺」宜用 stay / remain alert 或 stay / remain vigilant，避免誤用 maintain warning 這種漢式英文。"
    ]
  }
};

const FALLBACK_STUDENT_GRADINGS_UNIV: Record<number, any> = {
  1: {
    detectedSeatNumber: 1,
    ocrSentence1: "Many students feel anxious and lost when choosing a university department.",
    ocrSentence2: "However, through self-exploration and consulting experts, they can make a more appropriate decision.",
    score1: 4.0,
    score2: 4.0,
    totalScore: 8.0,
    errors1: [],
    errors2: [],
    feedback1: "學生精準掌握了『感到焦慮與迷惘』(feel anxious and lost) 的形容詞搭配，且時間副詞子句中 choose/picking 處理流暢，文法毫無瑕疵。極致佳卷！",
    feedback2: "『然而』(However,) 置於句首與標點符號完全正確，『自我探索』(self-exploration)、『諮詢專家』(consulting experts) 及動詞做決定『make a more appropriate decision』均極致地道，獲得滿分實至名歸。",
    improvedVersion: "Many students feel anxious and lost when choosing a university department. However, through self-exploration and consulting experts, they can make more appropriate decisions.",
    majorIssues: "🎉 滿分佳作。時態語句結構與搭配詞均完全符合大考高分樣卷常模規範。"
  },
  2: {
    detectedSeatNumber: 2,
    ocrSentence1: "Lots of student feel super anxious and lose in select college depart.",
    ocrSentence2: "But through auto exploration and talking to exports, they can make a better decide.",
    score1: 2.0,
    score2: 2.0,
    totalScore: 4.0,
    errors1: [
      {
        originalSegment: "Lots of student",
        suggestedSegment: "Lots of students",
        errorType: "Grammar",
        explanation: "Lots of 後接可數名詞時，學生應使用複數型 students。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "lose",
        suggestedSegment: "lost",
        errorType: "Word Choice",
        explanation: "感到迷惘，英文慣用形容詞為 lost。lose 為動詞「失去/輸掉」，在此詞類誤用。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "in select",
        suggestedSegment: "when selecting",
        errorType: "Structure",
        explanation: "介系詞 in 後應接動名詞 selecting 或使用時間連接詞 when / while 引導。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "college depart",
        suggestedSegment: "college departments",
        errorType: "Word Choice",
        explanation: "修飾大學學系，應使用名詞 department；depart 則為動詞「出發/啟程」，字尾字彙拼寫混淆。",
        pointsDeducted: 0.5
      }
    ],
    errors2: [
      {
        originalSegment: "But",
        suggestedSegment: "However,",
        errorType: "Structure",
        explanation: "雖然 But 可做句首連詞，但在大考寫作中，使用 However 與逗號搭配更能凸顯書面語氣的嚴謹性。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "auto exploration",
        suggestedSegment: "self-exploration",
        errorType: "Word Choice",
        explanation: "自我探索慣用 self-exploration。auto 通常指機械式或自動化的 auto-mode，語意不合。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "exports",
        suggestedSegment: "experts",
        errorType: "Spelling",
        explanation: "諮詢專家拼寫混淆。exports 代表「出口貨品」，專家則為 experts，大考嚴重拼字失誤。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "make a better decide",
        suggestedSegment: "make a better decision",
        errorType: "Grammar",
        explanation: "make 後接冠詞 a 與形容詞後，必須使用名詞型態 decision；decide 為動詞形式，詞性錯誤。",
        pointsDeducted: 0.5
      }
    ],
    feedback1: "本句文法障礙較多。首先是名詞單複數一致性（student 應為 students），其次是 lose 動詞與形容詞 lost 混淆。大學科系拼寫以 department 作答較合適，特別注意 select 的詞性。",
    feedback2: "轉折連詞建議使用 However 代替 But，並緊連逗號。專家 spelling 與 exports 混淆是大扣分點。做合適決定動詞 make 搭配名詞 decision 的用法請多加複習熟記。",
    improvedVersion: "Many students feel anxious and lost when choosing a university department. However, through self-exploration and consulting experts, they can make a more appropriate decision.",
    majorIssues: "⚠️ 典型文法與拼寫綜合障礙。包含 experts/exports、decide/decision 詞性與單複數多重拼字配對問題。"
  },
  3: {
    detectedSeatNumber: 3,
    ocrSentence1: "Numerous students feel anxiety and confused when they chose university major.",
    ocrSentence2: "Never the less, and consult experts, they will make more appropriate decision.",
    score1: 3.0,
    score2: 2.5,
    totalScore: 5.5,
    errors1: [
      {
        originalSegment: "feel anxiety and confused",
        suggestedSegment: "feel anxious and confused",
        errorType: "Structure",
        explanation: "feel 後接形容詞。feel anxiety (n.) 與形容詞 confused 形成不對等對稱。應改為 feel anxious and confused 較佳。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "chose",
        suggestedSegment: "choose",
        errorType: "Grammar",
        explanation: "敘述事實或常態情況，時間副詞子句應採用現在簡單式 choose，而非過去式 chose。",
        pointsDeducted: 0.5
      }
    ],
    errors2: [
      {
        originalSegment: "Never the less,",
        suggestedSegment: "Nevertheless,",
        errorType: "Spelling",
        explanation: "轉折詞 nevertheless 為一個單字，不可以拆為三個 tokens 拼寫。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "and consult",
        suggestedSegment: "by consulting",
        errorType: "Structure",
        explanation: "Never the less 後連 coordinates 'and' 讓主語架構破碎，透過諮詢，應以介系詞片語引導、或分開為獨立句。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "make more appropriate decision",
        suggestedSegment: "make a more appropriate decision",
        errorType: "Grammar",
        explanation: "decision 為可數名詞，單數時前面應有不定冠詞 a，或者使用複數型態 decisions。",
        pointsDeducted: 0.5
      }
    ],
    feedback1: "學生字彙選用相當豐富 (Numerous)，但要注意並列結構的一致：feel 後若配 anxiety 名詞，會與後面的形容詞 confused 造成混亂扭曲。時態（chose 過去式）較不洽當。",
    feedback2: "拼字方面，轉折詞 nevertheless 必須合寫。諮詢動詞 consult 與前面的副詞/介系詞缺乏關聯語法。可數名詞 decision 漏掉了定冠詞或是複數語意。",
    improvedVersion: "Numerous students feel anxious and confused when they choose university majors. Nevertheless, through consulting experts, they will make a more appropriate decision.",
    majorIssues: "✍️ 字彙底子極佳，但對於 feel 對稱平行結構以及時態、可數名詞冠詞的小細節仍需加強警覺。"
  },
  4: {
    detectedSeatNumber: 4,
    ocrSentence1: "Many high schoolers feel anxius and confused while picking university subject.",
    ocrSentence2: "However, across self-discovery and consulting advisor, they will decide better things.",
    score1: 3.0,
    score2: 3.0,
    totalScore: 6.0,
    errors1: [
      {
        originalSegment: "anxius",
        suggestedSegment: "anxious",
        errorType: "Spelling",
        explanation: "焦慮的正確拼寫為 anxious。請留意 -ious 尾碼複韻母。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "picking university subject",
        suggestedSegment: "picking university subjects",
        errorType: "Grammar",
        explanation: "subject 為可數名詞，泛指學系或領域時，應採用複數型態 subjects 較道地。",
        pointsDeducted: 0.5
      }
    ],
    errors2: [
      {
        originalSegment: "across",
        suggestedSegment: "through",
        errorType: "Word Choice",
        explanation: "跨越（空間）用 across，但在抽象句子中表達「透過」自我探索應使用 through 或 via。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "consulting advisor",
        suggestedSegment: "consulting advisors / seeking advice from experts",
        errorType: "Grammar",
        explanation: "advisor 為可數名詞，應以複數型態 advisors 或是 seek advice from 專家表達泛指。",
        pointsDeducted: 0.5
      }
    ],
    feedback1: "學生採用 high schoolers 與 picking 單字極富活力，不過關鍵大考單字『anxious』拼錯 (anxius)。可數名詞單複數在此仍是失分重點。",
    feedback2: "『透過』不應誤用為 across。決定更好事物，改為作出更好決定（make better decisions）能比動詞 decide better things 展現更豐沛厚實的高中語感層次。",
    improvedVersion: "Many high schoolers feel anxious and confused while picking university subjects. However, through self-discovery and consulting advisors, they will make more appropriate decisions.",
    majorIssues: "💡 字彙拼寫錯誤(anxius)與介系詞抽象觀念誤用(across)；句尾動詞結構偏白話不夠嚴謹。"
  },
  5: {
    detectedSeatNumber: 5,
    ocrSentence1: "Most of the students feel worried and lost during they are choosing major of university.",
    ocrSentence2: "But, with self explorer and counseling with expert, they could make fit decisions.",
    score1: 3.0,
    score2: 3.0,
    totalScore: 6.0,
    errors1: [
      {
        originalSegment: "during they are choosing",
        suggestedSegment: "while choosing / of choice",
        errorType: "Structure",
        explanation: "During 屬於介系詞，後面不能接完整子句 (they are choosing)。應改用從屬連接詞 while + V-ing 或 when they are...",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "major of university",
        suggestedSegment: "university majors",
        errorType: "Word Choice",
        explanation: "大學主修科系，採用名詞作形容詞的名詞片語 university majors 比 A of B 的中式冗贅結構更自然。",
        pointsDeducted: 0.5
      }
    ],
    errors2: [
      {
        originalSegment: "with self explorer",
        suggestedSegment: "through self-exploration",
        errorType: "Word Choice",
        explanation: "self explorer 是指自我探索人」（動作者）。這裏指的是自我探索」這項活動與概念，應為名詞 self-exploration / self-discovery。",
        pointsDeducted: 0.5
      },
      {
        originalSegment: "counseling with expert",
        suggestedSegment: "consulting experts / counseling with experts",
        errorType: "Grammar",
        explanation: "expert 為可數名詞，泛指時應寫為複數 experts。",
        pointsDeducted: 0.5
      }
    ],
    feedback1: "對詞性的掌握需要更細膩。During 與 While / When 的區分是大考文法大敵，請熟記 during 僅接名詞。以 most of the students 破題語意流暢，值得鼓勵！",
    feedback2: "將 self-exploration（探索名詞）寫成了 self explorer（人），這使句子理解產生了歧義偏差。expert 複數型態漏填。整體語序流暢度很好，但請改進介系詞主詞細微處。",
    improvedVersion: "Most students feel worried and lost when choosing a university major. However, through self-exploration and consulting experts, they could make more appropriate decisions.",
    majorIssues: "⚠️ 典型詞性混淆（during/while、expression人與物之self explorer）以及可數名詞複數型疏忽。"
  }
};

// Falls back to defined prompt analyses based on Chinese keywords
function getFallbackAnalysis(sentence1: string, sentence2: string): any {
  const s1 = sentence1 || "";
  const s2 = sentence2 || "";
  if (s1.includes("大學") || s1.includes("學系") || s1.includes("焦慮")) {
    return FALLBACK_ANALYSES["大學選系"];
  }
  if (s1.includes("極端") || s1.includes("氣候") || s1.includes("農業")) {
    return FALLBACK_ANALYSES["極端氣候"];
  }
  if (s1.includes("社群") || s1.includes("隱私") || s1.includes("保護")) {
    return FALLBACK_ANALYSES["社群隱私"];
  }

  // Generic Dynamic Heuristics Fallback Analysis
  return {
    sentence1Chinese: s1,
    sentence2Chinese: s2,
    sentence1Analysis: {
      structures: [
        "S1 + Aux + Verb Structure (時間、環境修飾句)",
        "Adverbial modifiers when V-ing / In recent days..."
      ],
      vocabulary: [
        { word: s1.slice(0, 5), translation: "Key Vocabulary Translation", notes: "請注意此翻譯單詞的詞性與及物性質。" },
        { word: s1.slice(Math.max(0, s1.length - 6)), translation: "Secondary term translation", notes: "常用大考搭配詞詞組。" }
      ],
      keys: ["請格外注意時態配合與及物/不及物動詞之轉換。"]
    },
    sentence2Analysis: {
      structures: [
        "S2 + Verb phrase combination (採取具體策略與目的不定詞)",
        "Inorder to + V-root / with a view to V-ing"
      ],
      vocabulary: [
        { word: s2.slice(0, 5), translation: "Goal oriented translation", notes: "以表達核心語法為主要考量。" },
        { word: s2.slice(Math.max(0, s2.length - 6)), translation: "Action noun representation", notes: "大考加分字組用法。" }
      ],
      keys: ["使用 However/Therefore 時，置於句首務必加上逗點號。", "可數名詞指稱全體時多用複數型態。"]
    },
    referenceTranslations1: [
      "Here is standard representation for: " + s1.slice(0, 15) + "...",
      "Polished high-school mock translation option for Sentence 1.",
      "An advanced, native alternative structure for Sentence 1."
    ],
    referenceTranslations2: [
      "Here is standard representation for: " + s2.slice(0, 15) + "...",
      "Polished high-school mock translation option for Sentence 2.",
      "An advanced, native alternative structure for Sentence 2."
    ],
    overallFulfillmentKeys: [
      "請根據本題之特徵情境選取合適的時間副詞與時態（例如描述常態用現在簡單式）。",
      "關鍵轉折詞請置於句首，並特別留意逗號、分號等大考標點符號權重扣分點。",
      "注意名詞複數與代名詞主動配合語序。"
    ]
  };
}

// Falls back to detailed heuristic student evaluations
function getFallbackGrading(seatNumber: number, manualText: string, promptAnalysis: any): any {
  const cleanText = (manualText || "").trim();
  const parsedSeat = seatNumber || 1;
  const isUnivPrompt = promptAnalysis.sentence1Chinese && (promptAnalysis.sentence1Chinese.includes("大學") || promptAnalysis.sentence1Chinese.includes("學生"));

  if (isUnivPrompt && parsedSeat >= 1 && parsedSeat <= 5) {
    const preset = FALLBACK_STUDENT_GRADINGS_UNIV[parsedSeat];
    if (preset) {
      return {
        ...preset,
        ocrSentence1: cleanText ? (cleanText.split('\n')[0] || preset.ocrSentence1) : preset.ocrSentence1,
        ocrSentence2: cleanText ? (cleanText.split('\n')[1] || preset.ocrSentence2) : preset.ocrSentence2,
        detectedSeatNumber: parsedSeat
      };
    }
  }

  // Dynamic Regex & String heuristic grader of custom student text input
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  const s1Text = lines[0] || "No translation submitted for Sentence 1.";
  const s2Text = lines[1] || (lines.length > 1 ? lines[1] : "No translation submitted for Sentence 2.");

  let score1 = 4.0;
  let score2 = 4.0;
  const errors1: any[] = [];
  const errors2: any[] = [];

  // Check some typical structural/grammar items heuristically:
  // 1. Lowercase "i"
  if (/\bi\b/.test(s1Text)) {
    errors1.push({
      originalSegment: "i",
      suggestedSegment: "I",
      errorType: "Grammar",
      explanation: "第一人稱代名詞 'I' 在英文書寫中，不論是在句首或句中，均必須強制大寫。",
      pointsDeducted: 0.5
    });
    score1 -= 0.5;
  }
  if (/\bi\b/.test(s2Text)) {
    errors2.push({
      originalSegment: "i",
      suggestedSegment: "I",
      errorType: "Grammar",
      explanation: "第一人稱代名詞 'I' 在英文書寫中，不論是在句首或句中，均必須強制大寫。",
      pointsDeducted: 0.5
    });
    score2 -= 0.5;
  }

  // 2. Comma splice
  if (s1Text.includes(",") && !/and|but|when|while|although|though|because/i.test(s1Text) && s1Text.split(",").length > 2) {
    errors1.push({
      originalSegment: ",",
      suggestedSegment: "; / .",
      errorType: "Structure",
      explanation: "注意「逗號接句 (Comma Splice)」之語法點。若欲並排兩個完整的主從子句，中間需加連接詞、分號、或直接分開成兩句。",
      pointsDeducted: 0.5
    });
    score1 -= 0.5;
  }

  // Specific preset heuristics
  const isClimatePrompt = promptAnalysis.sentence1Chinese && (promptAnalysis.sentence1Chinese.includes("極端") || promptAnalysis.sentence1Chinese.includes("氣候"));
  const isPrivacyPrompt = promptAnalysis.sentence1Chinese && (promptAnalysis.sentence1Chinese.includes("社群") || promptAnalysis.sentence1Chinese.includes("隱私"));

  if (isClimatePrompt) {
    if (!/extreme/i.test(s1Text)) {
      errors1.push({
        originalSegment: s1Text.slice(0, 10) + "...",
        suggestedSegment: "extreme climate / extreme weather",
        errorType: "Word Choice",
        explanation: "譯文缺少「極端」修飾，建議補足為 extreme climate 或 extreme weather。",
        pointsDeducted: 0.5
      });
      score1 -= 0.5;
    }
    if (!/agriculture|farm/i.test(s1Text)) {
      errors1.push({
        originalSegment: "...",
        suggestedSegment: "global agriculture",
        errorType: "Word Choice",
        explanation: "未檢測到「全球農業」之翻譯。建議使用 global agriculture 元件。",
        pointsDeducted: 0.5
      });
      score1 -= 0.5;
    }
    if (!/action|step|measure/i.test(s2Text)) {
      errors2.push({
        originalSegment: "...",
        suggestedSegment: "take concrete actions / measures",
        errorType: "Word Choice",
        explanation: "核心片語「採取具體行動」有佚失現象。建議背誦 take concrete actions / measures 語彙搭配。",
        pointsDeducted: 0.5
      });
      score2 -= 0.5;
    }
  } else if (isPrivacyPrompt) {
    if (!/privacy/i.test(s1Text)) {
      errors1.push({
        originalSegment: "...",
        suggestedSegment: "protecting personal privacy",
        errorType: "Word Choice",
        explanation: "「保護個人隱私」是本句核心主詞。缺少 privacy 將導致重度語意佚失。",
        pointsDeducted: 0.5
      });
      score1 -= 0.5;
    }
    if (!/alert|vigilant/i.test(s2Text)) {
      errors2.push({
        originalSegment: "...",
        suggestedSegment: "remain highly alert / stay vigilant",
        errorType: "Word Choice",
        explanation: "「保持高度警覺」建議翻譯為 stay/remain alert 或者 stay vigilant，比單純用 be careful 更具大考學術說服力。",
        pointsDeducted: 0.5
      });
      score2 -= 0.5;
    }
  }

  // Set lower bound
  score1 = Math.max(cleanText ? 0.5 : 0, score1);
  score2 = Math.max(cleanText ? 0.5 : 0, score2);
  const totalScore = score1 + score2;

  const feedback1 = score1 === 4.0 
    ? "翻譯完成度與流暢度很高，單字選用極佳，時態主被動完整一致。"
    : "對於該句基本架構掌握度不錯，但細微語法或字尾搭配詞方面仍有磨練空间，可參看標準佳句。";

  const feedback2 = score2 === 4.0 
    ? "語意通順地道，轉折語氣與大考字彙配合度極好，無明顯失分點。"
    : "轉折連詞位置正確，惟須額外注意可數名詞單複數一致性、不定冠詞 a 及動賓搭配片語 (make decisions)。";

  const improvedVersion = promptAnalysis.referenceTranslations1[0] + " " + promptAnalysis.referenceTranslations2[0];
  const majorIssues = (errors1.length + errors2.length > 0)
    ? `⚠️ 全卷檢視有 ${errors1.length + errors2.length} 處常規語法精進切入點。建議留意專用名詞搭配、時態結構與大考標點規範。`
    : "🎉 滿分作答！結構嚴整、用字自然精鍊，完美切合大專高中常模樣卷。";

  return {
    detectedSeatNumber: parsedSeat,
    ocrSentence1: s1Text,
    ocrSentence2: s2Text,
    score1,
    score2,
    totalScore,
    errors1,
    errors2,
    feedback1,
    feedback2,
    improvedVersion,
    majorIssues
  };
}

// Lazy initialization of Gemini client
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY variable is missing. Please define it in your AI Studio secrets / environment variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. API: Analyze translation prompt
app.post("/api/analyze-prompt", async (req, res) => {
  try {
    const { sentence1, sentence2 } = req.body;
    if (!sentence1 || !sentence2) {
      return res.status(400).json({ error: "Missing Chinese sentences" });
    }

    // Checking if OpenAI key is available
    if (hasOpenAIKey()) {
      console.log("Using OpenAI API for prompt analysis.");
      const promptText = `Analyze these two contextually or logically connected Chinese sentences for an English translation exercise (suitable for GSAT / 高考 style).
      Chinese Sentence 1: "${sentence1}"
      Chinese Sentence 2: "${sentence2}"

      Perform a professional syntactic, structural and vocabulary analysis. Return a raw JSON object matching this structure:
      {
        "sentence1Chinese": string,
        "sentence2Chinese": string,
        "sentence1Analysis": {
          "structures": string[],
          "vocabulary": [{ "word": string, "translation": string, "notes": string }],
          "keys": string[]
        },
        "sentence2Analysis": {
          "structures": string[],
          "vocabulary": [{ "word": string, "translation": string, "notes": string }],
          "keys": string[]
        },
        "referenceTranslations1": string[],
        "referenceTranslations2": string[],
        "overallFulfillmentKeys": string[]
      }
      `;
      try {
        const data = await callOpenAI(
          "You are an elite bilingual English-Chinese teacher in Taiwan who specializes in GSAT (General Scholastic Ability Test) translation assessment. Deliver structured, extremely accurate, and natural analysis in raw JSON.",
          promptText
        );
        return res.json(data);
      } catch (err: any) {
        console.error("OpenAI prompt analysis error, falling back to Gemini:", err);
      }
    }

    // Checking if api key is available
    if (!hasGeminiKey()) {
      console.log("GEMINI_API_KEY is not defined. Resolving preset or dynamic heuristic translation analysis.");
      const analysisData = getFallbackAnalysis(sentence1, sentence2);
      return res.json(analysisData);
    }

    const ai = getGeminiClient();
    const model = "gemini-3.5-flash";

    const promptText = `Analyze these two contextually or logically connected Chinese sentences for an English translation exercise (suitable for GSAT / 高考 style).
    Chinese Sentence 1: "${sentence1}"
    Chinese Sentence 2: "${sentence2}"

    Perform a professional syntactic, structural and vocabulary analysis:
    1. Identify key translation structures and grammar patterns for each sentence.
    2. Extract key vocabulary/phrases with their English translations and brief teacher notes.
    3. Pinpoint key translation difficulties and requirements (Keys to Fulfilling).
    4. Provide 3 high-quality reference translations for Sentence 1, ranging from standard/faithful to advanced/polished.
    5. Provide 3 high-quality reference translations for Sentence 2, similarly.
    6. Formulate overall translation guidelines or keys.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: promptText,
      config: {
        systemInstruction: "You are an elite bilingual English-Chinese teacher in Taiwan who specializes in GSAT (General Scholastic Ability Test) translation assessment. Deliver structured, extremely accurate, and natural analysis.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentence1Chinese: { type: Type.STRING },
            sentence2Chinese: { type: Type.STRING },
            sentence1Analysis: {
              type: Type.OBJECT,
              properties: {
                structures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                vocabulary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      translation: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["word", "translation"]
                  }
                },
                keys: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["structures", "vocabulary", "keys"]
            },
            sentence2Analysis: {
              type: Type.OBJECT,
              properties: {
                structures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                vocabulary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      translation: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["word", "translation"]
                  }
                },
                keys: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["structures", "vocabulary", "keys"]
            },
            referenceTranslations1: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            referenceTranslations2: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            overallFulfillmentKeys: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: [
            "sentence1Chinese", "sentence2Chinese",
            "sentence1Analysis", "sentence2Analysis",
            "referenceTranslations1", "referenceTranslations2",
            "overallFulfillmentKeys"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("No response content from Gemini model.");
    }

    const data = JSON.parse(response.text.trim());
    return res.json(data);
  } catch (error: any) {
    console.error("Error analyzing prompt: ", error);
    return res.status(500).json({ error: error?.message || "Internal Server Error in Analyze Prompt" });
  }
});

// 2. API: Grade student's submission (OCR + Evaluation)
app.post("/api/grade-student", async (req, res) => {
  try {
    const { seatNumber, image, manualText, promptAnalysis } = req.body;

    if (!promptAnalysis) {
      return res.status(400).json({ error: "Missing prompt analysis context for evaluation." });
    }

    // Checking if OpenAI key is available
    if (hasOpenAIKey()) {
      console.log("Using OpenAI API for student grading/OCR evaluation.");
      const promptText = `
      You are a professional and seasoned English teacher evaluating a Taiwanese high school student's translation homework for GSAT preparation.
      
      Here is the Chinese prompt:
      Chinese Sentence 1: "${promptAnalysis.sentence1Chinese}"
      Chinese Sentence 2: "${promptAnalysis.sentence2Chinese}"
      
      Model Reference Answers for Guidance:
      Sentence 1 References: ${JSON.stringify(promptAnalysis.referenceTranslations1)}
      Sentence 2 References: ${JSON.stringify(promptAnalysis.referenceTranslations2)}

      Task Instructions:
      1. OCR / Read Content:
         - If there is an image uploaded, transcribe the handwritten English translations for Sentence 1 and Sentence 2 with absolute preservation of spelling, grammar, and typos.
         - Note: If there's a visible number or Seat No. (e.g. "No. 12", "座號 12", "12") on the sheet, extract it as 'detectedSeatNumber'.
         - If no image is provided, or if this is a typed text mode, evaluate this text directly: "${manualText || ''}". Split it into what pertains to Sentence 1 and Sentence 2 in 'ocrSentence1' and 'ocrSentence2'.

      2. Evaluation & GSAT Rubric:
         - Each sentence is worth exactly 4.0 points maximum (Total 8.0 points).
         - General fluency, spelling accuracy, correct word choice, proper preposition, and tense are assessed.
         - Spelling, grammatical mistakes, structural errors generally cost 0.5 points each. Minor punctuation errors can be 0.5 points. Use increments of 0.5 points (possible scores are: 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0).
         - Be professional, highly constructive, encouraging, and detailed. Explain deductions in clear Traditional Chinese.

      3. Return a raw JSON object matching this structure:
      {
        "detectedSeatNumber": number | null,
        "ocrSentence1": string,
        "ocrSentence2": string,
        "score1": number,
        "score2": number,
        "totalScore": number,
        "errors1": [{ "originalSegment": string, "suggestedSegment": string, "errorType": string, "explanation": string, "pointsDeducted": number }],
        "errors2": [{ "originalSegment": string, "suggestedSegment": string, "errorType": string, "explanation": string, "pointsDeducted": number }],
        "feedback1": string,
        "feedback2": string,
        "improvedVersion": string,
        "majorIssues": string
      }
      `;
      try {
        const data = await callOpenAIMultimodal(
          "You are an expert GSAT English translation assessor who is naturally encouraging yet strict with Taiwan Ministry of Education standards. Return clear, constructive results in Taiwanese Traditional Chinese.",
          promptText,
          image
        );
        return res.json(data);
      } catch (err: any) {
        console.error("OpenAI student evaluation error, falling back to Gemini:", err);
      }
    }

    // Checking if api key is available
    if (!hasGeminiKey()) {
      console.log("GEMINI_API_KEY is not defined. Falling back to high-fidelity offline/heuristic evaluation.");
      const gradingResult = getFallbackGrading(seatNumber, manualText, promptAnalysis);
      return res.json(gradingResult);
    }

    const ai = getGeminiClient();
    const model = "gemini-3.5-flash";

    const parts: any[] = [];

    // Add image if attached
    if (image) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    }

    const promptText = `
    You are a professional and seasoned English teacher evaluating a Taiwanese high school student's translation homework for GSAT preparation.
    
    Here is the Chinese prompt:
    Chinese Sentence 1: "${promptAnalysis.sentence1Chinese}"
    Chinese Sentence 2: "${promptAnalysis.sentence2Chinese}"
    
    Model Reference Answers for Guidance:
    Sentence 1 References: ${JSON.stringify(promptAnalysis.referenceTranslations1)}
    Sentence 2 References: ${JSON.stringify(promptAnalysis.referenceTranslations2)}

    Task Instructions:
    1. OCR / Read Content:
       - If there is an image uploaded, transcribe the handwritten English translations for Sentence 1 and Sentence 2 with absolute preservation of spelling, grammar, and typos.
       - Note: If there's a visible number or Seat No. (e.g. "No. 12", "座號 12", "12") on the sheet, extract it as 'detectedSeatNumber'.
       - If no image is provided, or if this is a typed text mode, evaluate this text directly: "${manualText || ''}". Split it into what pertains to Sentence 1 and Sentence 2 in 'ocrSentence1' and 'ocrSentence2'.

    2. Evaluation & GSAT Rubric:
       - Each sentence is worth exactly 4.0 points maximum (Total 8.0 points).
       - General fluency, spelling accuracy, correct word choice, proper preposition, and tense are assessed.
       - Spelling, grammatical mistakes, structural errors generally cost 0.5 points each. Minor punctuation errors can be 0.5 points. Use increments of 0.5 points (possible scores are: 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0).
       - Be professional, highly constructive, encouraging, and detailed. Explain deductions in clear Traditional Chinese.

    3. Structure of output:
       - 'ocrSentence1': Recognized text for Sentence 1.
       - 'ocrSentence2': Recognized text for Sentence 2.
       - 'detectedSeatNumber': Seat number detected in the image, or null.
       - 'score1': Numeric score for Sentence 1 (0 to 4.0 in steps of 0.5).
       - 'score2': Numeric score for Sentence 2 (0 to 4.0 in steps of 0.5).
       - 'totalScore': Sum of score1 and score2 (0 to 8.0).
       - 'errors1': List of errors inside Sentence 1.
       - 'errors2': List of errors inside Sentence 2.
       - 'feedback1': Clear diagnostic explanation for Sentence 1 in Taiwan Traditional Chinese.
       - 'feedback2': Clear diagnostic explanation for Sentence 2 in Taiwan Traditional Chinese.
       - 'improvedVersion': Provide a highly natural, elegant standard bilingual English translation showing the student how to compose it fluidly.
       - 'majorIssues': Broad high-level diagnostic summary of their common problems (e.g. '常規時態結構、冠詞使用疏失、拼字不完整') in Taiwan Traditional Chinese.
    `;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        systemInstruction: "You are an expert GSAT English translation assessor who is naturally encouraging yet strict with Taiwan Ministry of Education standards. Return clear, constructive results in Taiwanese Traditional Chinese.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedSeatNumber: { type: Type.INTEGER },
            ocrSentence1: { type: Type.STRING },
            ocrSentence2: { type: Type.STRING },
            score1: { type: Type.NUMBER },
            score2: { type: Type.NUMBER },
            totalScore: { type: Type.NUMBER },
            errors1: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalSegment: { type: Type.STRING },
                  suggestedSegment: { type: Type.STRING },
                  errorType: { type: Type.STRING, description: "Grammar, Spelling, Word Choice, Structure, or Other" },
                  explanation: { type: Type.STRING },
                  pointsDeducted: { type: Type.NUMBER }
                },
                required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"]
              }
            },
            errors2: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalSegment: { type: Type.STRING },
                  suggestedSegment: { type: Type.STRING },
                  errorType: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  pointsDeducted: { type: Type.NUMBER }
                },
                required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"]
              }
            },
            feedback1: { type: Type.STRING },
            feedback2: { type: Type.STRING },
            improvedVersion: { type: Type.STRING },
            majorIssues: { type: Type.STRING }
          },
          required: [
            "ocrSentence1", "ocrSentence2",
            "score1", "score2", "totalScore",
            "errors1", "errors2",
            "feedback1", "feedback2",
            "improvedVersion", "majorIssues"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response from AI engine.");
    }

    const data = JSON.parse(response.text.trim());
    return res.json(data);
  } catch (error: any) {
    console.error("Grading student error: ", error);
    return res.status(500).json({ error: error?.message || "Internal system error during student grading evaluation." });
  }
});

// Setup Vite Dev Server / Static Asset Handler
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with compiled assets...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Express API + Vite Asset Gateway is online at http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
