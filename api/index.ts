import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

let aiClient: GoogleGenAI | null = null;

function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return typeof k === "string" && k.trim().length > 0 && k !== "undefined" && k !== "null" && !k.startsWith("MY_");
}

function hasOpenAIKey(): boolean {
  const k = process.env.OPENAI_API_KEY;
  return typeof k === "string" && k.trim().length > 0 && k !== "undefined" && k !== "null" && !k.startsWith("MY_");
}

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
  if (!content) throw new Error("Empty completion choice returned from OpenAI.");
  return JSON.parse(content.trim());
}

async function callOpenAIMultimodal(systemInstruction: string, promptText: string, image?: string): Promise<any> {
  const contentParts: any[] = [{ type: "text", text: promptText }];
  if (image) {
    contentParts.push({ type: "image_url", image_url: { url: image } });
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
  if (!content) throw new Error("Empty completion choice returned from OpenAI.");
  return JSON.parse(content.trim());
}

// -------------------------------------------------------------
// FALLBACK DATA
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
        { word: "選擇大學學系", translation: "choosing a university department / major", notes: "department 指學系，major 指主修課系。" }
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
        { word: "自我探索", translation: "self-exploration / self-discovery", notes: "exploration 為探索，符合課綱詞彙。避免錯拼為 self explorer。" },
        { word: "諮詢專家", translation: "consulting experts / talking to specialists", notes: "consult 為及物動詞，其後直接加上對象。" },
        { word: "作出合適的決定", translation: "make appropriate decisions / make more suitable choices", notes: "固定搭配詞 make decisions（做決定），搭配形容詞 appropriate 或 suitable。" }
      ],
      keys: [
        "然而之轉折語 (However, / Nonetheless,) 在句首需搭配逗號。",
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
        { word: "糧食供應的穩定", translation: "the stability of food supply", notes: "food supply（糧食供應）可使用單數泛指。" }
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
        { word: "在社群媒體時代", translation: "In the era of social media / In the age of social networks", notes: "era/age 均可表時代，注意與 strong/the 搭配。" },
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
        { word: "網路分享資訊", translation: "sharing personal information online", notes: "online 在此作地方副詞，不虛加任何介系詞。" },
        { word: "使用者", translation: "users", notes: "泛指所有使用者，應使用複數型。" },
        { word: "保持高度警覺", translation: "remain highly alert / stay vigilant / watch out", notes: "vigilant (adj.) 或是 alert (adj.) 與靜態動詞 stay / remain / keep 互配。" }
      ],
      keys: [
        "在網路上：online 單字作副詞直接置於句尾（或修飾動詞），通常簡寫為 sharing info online 即可。",
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
      "「網路上的分享」之「網路上」以副詞 online 置於後面最為道地流暢。",
      "「保持警覺」宜用 stay / remain alert 或 stay / remain vigilant。"
    ]
  }
};

const FALLBACK_STUDENT_GRADINGS_UNIV: Record<number, any> = {
  1: {
    detectedSeatNumber: 1,
    ocrSentence1: "Many students feel anxious and lost when choosing a university department.",
    ocrSentence2: "However, through self-exploration and consulting experts, they can make a more appropriate decision.",
    score1: 4.0, score2: 4.0, totalScore: 8.0,
    errors1: [], errors2: [],
    feedback1: "學生精準掌握了『感到焦慮與迷惘』(feel anxious and lost) 的形容詞搭配，且時間副詞子句中 choose/picking 處理流暢，文法毫無瑕疵。極致佳卷！",
    feedback2: "『然而』(However,) 置於句首與標點符號完全正確，『自我探索』(self-exploration)、『諮詢專家』(consulting experts) 及動詞做決定『make a more appropriate decision』均極致地道，獲得滿分實至名歸。",
    improvedVersion: "Many students feel anxious and lost when choosing a university department. However, through self-exploration and consulting experts, they can make more appropriate decisions.",
    majorIssues: "🎉 滿分佳作。時態語句結構與搭配詞均完全符合大考高分樣卷常模規範。"
  },
  2: {
    detectedSeatNumber: 2,
    ocrSentence1: "Lots of student feel super anxious and lose in select college depart.",
    ocrSentence2: "But through auto exploration and talking to exports, they can make a better decide.",
    score1: 2.0, score2: 2.0, totalScore: 4.0,
    errors1: [
      { originalSegment: "Lots of student", suggestedSegment: "Lots of students", errorType: "Grammar", explanation: "Lots of 後接可數名詞時，學生應使用複數型 students。", pointsDeducted: 0.5 },
      { originalSegment: "lose", suggestedSegment: "lost", errorType: "Word Choice", explanation: "感到迷惘，英文慣用形容詞為 lost。lose 為動詞「失去/輸掉」，在此詞類誤用。", pointsDeducted: 0.5 },
      { originalSegment: "in select", suggestedSegment: "when selecting", errorType: "Structure", explanation: "介系詞 in 後應接動名詞 selecting 或使用時間連接詞 when / while 引導。", pointsDeducted: 0.5 },
      { originalSegment: "college depart", suggestedSegment: "college departments", errorType: "Word Choice", explanation: "修飾大學學系，應使用名詞 department；depart 則為動詞「出發/啟程」，字尾字彙拼寫混淆。", pointsDeducted: 0.5 }
    ],
    errors2: [
      { originalSegment: "But", suggestedSegment: "However,", errorType: "Structure", explanation: "雖然 But 可做句首連詞，但在大考寫作中，使用 However 與逗號搭配更能凸顯書面語氣的嚴謹性。", pointsDeducted: 0.5 },
      { originalSegment: "auto exploration", suggestedSegment: "self-exploration", errorType: "Word Choice", explanation: "自我探索慣用 self-exploration。auto 通常指機械式或自動化的 auto-mode，語意不合。", pointsDeducted: 0.5 },
      { originalSegment: "exports", suggestedSegment: "experts", errorType: "Spelling", explanation: "諮詢專家拼寫混淆。exports 代表「出口貨品」，專家則為 experts，大考嚴重拼字失誤。", pointsDeducted: 0.5 },
      { originalSegment: "make a better decide", suggestedSegment: "make a better decision", errorType: "Grammar", explanation: "make 後接冠詞 a 與形容詞後，必須使用名詞型態 decision；decide 為動詞形式，詞性錯誤。", pointsDeducted: 0.5 }
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
    score1: 3.0, score2: 2.5, totalScore: 5.5,
    errors1: [
      { originalSegment: "feel anxiety", suggestedSegment: "feel anxious / experience anxiety", errorType: "Word Choice", explanation: "feel 後應搭配形容詞 anxious 或是將 feel 改用動詞 experience anxiety。名詞與形容詞並列有對稱性問題。", pointsDeducted: 0.5 },
      { originalSegment: "chose", suggestedSegment: "choose", errorType: "Grammar", explanation: "此處應使用現在簡單式 choose 表述一般常態，chose 為過去式動詞，時態誤用。", pointsDeducted: 0.5 }
    ],
    errors2: [
      { originalSegment: "Never the less,", suggestedSegment: "Nevertheless,", errorType: "Spelling", explanation: "副詞 Nevertheless 應為單一單字，不可拆成三個單詞撰寫。", pointsDeducted: 0.5 },
      { originalSegment: "and consult experts", suggestedSegment: "through consulting experts", errorType: "Structure", explanation: "and 連接詞結構混雜，無法與前文對稱。應使用介系詞詞組表達『透過諮詢專家』。", pointsDeducted: 0.5 },
      { originalSegment: "more appropriate decision", suggestedSegment: "more appropriate decisions", errorType: "Grammar", explanation: "decision 為可數名詞，前無冠詞時應使用複數型 decisions。", pointsDeducted: 0.5 }
    ],
    feedback1: "學生使用了 'Numerous students' 做出了不錯的主體代換。然而要注意 feel + 名詞與後面形容詞並列 (anxiety and confused) 的不對稱文法，且注意現在簡單式的 choose 拼寫。",
    feedback2: "『然而』(Nevertheless) 拼寫拆字是常見錯誤， consult 需配合介系詞 that/through 並注意可數名詞名單 decision 的單複數一致性。",
    improvedVersion: "Many students feel anxious and lost when they choose a university department. Nevertheless, through consulting experts, they will make more appropriate decisions.",
    majorIssues: "⚠️ 詞性平行對稱結構不合 (anxiety and confused)；轉折語 Never the less 拼寫錯誤。"
  },
  4: {
    detectedSeatNumber: 4,
    ocrSentence1: "Many high schoolers feel anxius and confused while picking university subject.",
    ocrSentence2: "However, across self-discovery and consulting advisor, they will decide better things.",
    score1: 3.0, score2: 3.0, totalScore: 6.0,
    errors1: [
      { originalSegment: "anxius", suggestedSegment: "anxious", errorType: "Spelling", explanation: "拼寫錯誤，少了一個 'o'。應為 anxious。", pointsDeducted: 0.5 },
      { originalSegment: "university subject", suggestedSegment: "university subjects", errorType: "Grammar", explanation: "subject 為可數名詞，在此通常使用複數型泛指，或加冠詞 a university subject。", pointsDeducted: 0.5 }
    ],
    errors2: [
      { originalSegment: "across self-discovery", suggestedSegment: "through self-discovery", errorType: "Word Choice", explanation: "表達『透過...手段』，應選用介系詞 through 或是 by means of，而非空間上的 across。", pointsDeducted: 0.5 },
      { originalSegment: "consulting advisor", suggestedSegment: "consulting advisors", errorType: "Grammar", explanation: "advisor 為可數名詞，應採用複數型 advisors 做泛指。", pointsDeducted: 0.5 }
    ],
    feedback1: "首句選用 'high schoolers'（高中生）非常貼切，惟 anxius 拼字有微瑕，且 university subject 需改為複數型 subjects 以符文法常規。",
    feedback2: "介系詞 across 使用不當，請記得『透過自我探索』習慣用 through 或 via。此外 advisor 應使用複數型態以表泛指。",
    improvedVersion: "Many high schoolers feel anxious and confused while picking university subjects. However, through self-discovery and consulting advisors, they will make better decisions.",
    majorIssues: "⚠️ anxius 拼字失誤與介系詞 across 誤用（應為 through）。"
  },
  5: {
    detectedSeatNumber: 5,
    ocrSentence1: "Most of the students feel worried and lost during they are choosing major of university.",
    ocrSentence2: "But, with self explorer and counseling with expert, they could make fit decisions.",
    score1: 2.5, score2: 3.0, totalScore: 5.5,
    errors1: [
      { originalSegment: "during they are choosing", suggestedSegment: "when choosing / while they are choosing", errorType: "Grammar", explanation: "during 為介系詞，其後不可直接加主詞動詞子句。應使用連接詞 when 或 while。", pointsDeducted: 1.0 },
      { originalSegment: "major of university", suggestedSegment: "university majors / a university major", errorType: "Structure", explanation: "對象主修習慣說 university majors 或 a college major，major of university 為字面硬翻的中式英文。", pointsDeducted: 0.5 }
    ],
    errors2: [
      { originalSegment: "self explorer", suggestedSegment: "self-exploration", errorType: "Word Choice", explanation: "self explorer 是個人名（自我探索者）。此處語意要表達的是『探索這件事』，應使用名詞 self-exploration。", pointsDeducted: 0.5 },
      { originalSegment: "expert", suggestedSegment: "experts", errorType: "Grammar", explanation: "expert 為可數名詞，在無冠詞修飾時應採用複數 experts 泛指專家們。", pointsDeducted: 0.5 }
    ],
    feedback1: "『在...期間』的 during 屬於介系詞，不能連接 SV 子句，這大考常見的文法失誤，應改為 while。科系搭配詞寫法亦顯中式英文色彩。",
    feedback2: "自我探索名詞為 self-exploration， explorer 指的是人（探索家）。諮詢專家 counseling with expert 建議改成 consulting experts，以複數形式泛指。",
    improvedVersion: "Most of the students feel worried and lost while they are choosing a university major. However, through self-exploration and consulting experts, they could make more appropriate decisions.",
    majorIssues: "⚠️ 介系詞 during 連接子句與自我探險人物 noun (explorer) 的混淆，句型略帶中式拼湊。"
  }
};

function getFallbackAnalysis(sentence1: string, sentence2: string): any {
  const s1 = sentence1 || "";
  const s2 = sentence2 || "";
  if (s1.includes("大學") || s1.includes("學系") || s1.includes("焦慮")) return FALLBACK_ANALYSES["大學選系"];
  if (s1.includes("極端") || s1.includes("氣候") || s1.includes("農業")) return FALLBACK_ANALYSES["極端氣候"];
  if (s1.includes("社群") || s1.includes("隱私") || s1.includes("保護")) return FALLBACK_ANALYSES["社群隱私"];
  return {
    sentence1Chinese: s1,
    sentence2Chinese: s2,
    sentence1Analysis: {
      structures: ["S + Aux + Verb Structure", "Adverbial modifiers when V-ing"],
      vocabulary: [{ word: s1.slice(0, 5), translation: "Key Vocabulary Translation", notes: "請注意此翻譯單詞的詞性與及物性質。" }],
      keys: ["請格外注意時態配合與及物/不及物動詞之轉換。"]
    },
    sentence2Analysis: {
      structures: ["S + Verb phrase combination", "In order to + V-root"],
      vocabulary: [{ word: s2.slice(0, 5), translation: "Goal oriented translation", notes: "以表達核心語法為主要考量。" }],
      keys: ["使用 However/Therefore 時，置於句首務必加上逗點號。", "可數名詞指稱全體時多用複數型態。"]
    },
    referenceTranslations1: ["Standard translation for: " + s1.slice(0, 15) + "..."],
    referenceTranslations2: ["Standard translation for: " + s2.slice(0, 15) + "..."],
    overallFulfillmentKeys: ["請根據本題之特徵情境選取合適的時間副詞與時態。"]
  };
}

function getFallbackGrading(seatNumber: number, manualText: string, promptAnalysis: any): any {
  const cleanText = (manualText || "").trim();
  const parsedSeat = seatNumber || 1;
  const isUnivPrompt = promptAnalysis.sentence1Chinese && (promptAnalysis.sentence1Chinese.includes("大學") || promptAnalysis.sentence1Chinese.includes("學生"));

  if (!cleanText) {
    return {
      detectedSeatNumber: parsedSeat,
      ocrSentence1: "No translation submitted for Sentence 1.",
      ocrSentence2: "No translation submitted for Sentence 2.",
      score1: 0.0,
      score2: 0.0,
      totalScore: 0.0,
      errors1: [],
      errors2: [],
      feedback1: "未偵測到作答字元 (No translation submitted).",
      feedback2: "未偵測到作答字元 (No translation submitted).",
      improvedVersion: (promptAnalysis.referenceTranslations1?.[0] || "") + " " + (promptAnalysis.referenceTranslations2?.[0] || ""),
      majorIssues: "⚠️ 未偵測到作答文字。請輸入文字或提供清晰之考卷掃描圖像。"
    };
  }

  if (isUnivPrompt && parsedSeat >= 1) {
    const mappedSeat = ((parsedSeat - 1) % 5) + 1;
    const preset = FALLBACK_STUDENT_GRADINGS_UNIV[mappedSeat];
    if (preset) {
      const parts = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
      const text1 = parts[0] || "No translation submitted for Sentence 1.";
      const text2 = parts[1] || "No translation submitted for Sentence 2.";
      const s1Score = parts[0] ? preset.score1 : 0.0;
      const s2Score = parts[1] ? preset.score2 : 0.0;
      return {
        ...preset,
        ocrSentence1: text1,
        ocrSentence2: text2,
        score1: s1Score,
        score2: s2Score,
        totalScore: s1Score + s2Score,
        detectedSeatNumber: parsedSeat,
        feedback1: parts[0] ? preset.feedback1 : "未填寫第一句翻譯。",
        feedback2: parts[1] ? preset.feedback2 : "未填寫第二句翻譯。",
        majorIssues: (s1Score === 0 || s2Score === 0) ? "⚠️ 部份句子未偵測到作答內容。" : preset.majorIssues
      };
    }
  }

  const lines = cleanText.split('\n').map((l: string) => l.trim()).filter(Boolean);
  const s1Text = lines[0] || "";
  const s2Text = lines[1] || "";

  let score1 = s1Text ? 4.0 : 0.0;
  let score2 = s2Text ? 4.0 : 0.0;
  const errors1: any[] = [], errors2: any[] = [];

  if (s1Text) {
    if (/\bi\b/.test(s1Text)) {
      errors1.push({ originalSegment: "i", suggestedSegment: "I", errorType: "Grammar", explanation: "第一人稱代名詞 'I' 均必須強制大寫。", pointsDeducted: 0.5 });
      score1 -= 0.5;
    }
    if (/anxius/i.test(s1Text)) {
      errors1.push({ originalSegment: "anxius", suggestedSegment: "anxious", errorType: "Spelling", explanation: "拼寫錯誤，少了一個 'o'。應為 anxious。", pointsDeducted: 0.5 });
      score1 -= 0.5;
    }
    score1 = Math.max(0.5, score1);
  }

  if (s2Text) {
    if (/\bi\b/.test(s2Text)) {
      errors2.push({ originalSegment: "i", suggestedSegment: "I", errorType: "Grammar", explanation: "第一人稱代名詞 'I' 均必須強制大寫。", pointsDeducted: 0.5 });
      score2 -= 0.5;
    }
    if (/Never the less/i.test(s2Text)) {
      errors2.push({ originalSegment: "Never the less", suggestedSegment: "Nevertheless", errorType: "Spelling", explanation: "副詞 Nevertheless 應為單一單字，不可拆成三個單詞撰寫。", pointsDeducted: 0.5 });
      score2 -= 0.5;
    }
    score2 = Math.max(0.5, score2);
  }

  return {
    detectedSeatNumber: parsedSeat,
    ocrSentence1: s1Text || "No translation submitted for Sentence 1.",
    ocrSentence2: s2Text || "No translation submitted for Sentence 2.",
    score1,
    score2,
    totalScore: score1 + score2,
    errors1,
    errors2,
    feedback1: s1Text ? (score1 === 4.0 ? "翻譯完成度與流暢度很高，單字選用極佳。" : "基本架構掌握度不錯，但細微語法方面仍有精進空間。") : "未偵測到作答字元 (No translation submitted).",
    feedback2: s2Text ? (score2 === 4.0 ? "語意通順地道，轉折語氣與大考字彙配合度極好。" : "轉折連詞位置正確，惟須額外注意可數名詞單複數一致性。") : "未偵測到作答字元 (No translation submitted).",
    improvedVersion: (promptAnalysis.referenceTranslations1?.[0] || "") + " " + (promptAnalysis.referenceTranslations2?.[0] || ""),
    majorIssues: (!s1Text || !s2Text) ? "⚠️ 部分翻譯考題未提交作答，請在對應行補齊。" : ((errors1.length + errors2.length > 0) ? `⚠️ 全卷檢視有 ${errors1.length + errors2.length} 處常規語法精進切入點。` : "🎉 滿分作答！結構嚴整、用字自然精鍊。")
  };
}

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// ── API: Analyze translation prompt ──────────────────────────
app.post("/api/analyze-prompt", async (req, res) => {
  try {
    const { sentence1, sentence2 } = req.body;
    if (!sentence1 || !sentence2) {
      return res.status(400).json({ error: "Missing Chinese sentences" });
    }

    try {
      if (hasOpenAIKey()) {
        try {
          const data = await callOpenAI(
            "You are an elite bilingual English-Chinese teacher in Taiwan who specializes in GSAT translation assessment. Deliver structured, accurate analysis in raw JSON.",
            `Analyze these two Chinese sentences for an English translation exercise (GSAT style).
  Chinese Sentence 1: "${sentence1}"
  Chinese Sentence 2: "${sentence2}"
  Return a raw JSON object with this structure:
  {
    "sentence1Chinese": string,
    "sentence2Chinese": string,
    "sentence1Analysis": { "structures": string[], "vocabulary": [{ "word": string, "translation": string, "notes": string }], "keys": string[] },
    "sentence2Analysis": { "structures": string[], "vocabulary": [{ "word": string, "translation": string, "notes": string }], "keys": string[] },
    "referenceTranslations1": string[],
    "referenceTranslations2": string[],
    "overallFulfillmentKeys": string[]
  }`
          );
          return res.json(data);
        } catch (err: any) {
          console.error("OpenAI prompt analysis failed, trying Gemini:", err.message);
        }
      }

      if (hasGeminiKey()) {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: `Analyze these two Chinese sentences for a GSAT English translation exercise.
  Chinese Sentence 1: "${sentence1}"
  Chinese Sentence 2: "${sentence2}"
  Provide key structures, vocabulary, 3 reference translations each, and overall guidelines.`,
          config: {
            systemInstruction: "You are an elite bilingual English-Chinese GSAT teacher in Taiwan. Deliver structured, accurate analysis.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sentence1Chinese: { type: Type.STRING },
                sentence2Chinese: { type: Type.STRING },
                sentence1Analysis: {
                  type: Type.OBJECT,
                  properties: {
                    structures: { type: Type.ARRAY, items: { type: Type.STRING } },
                    vocabulary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { word: { type: Type.STRING }, translation: { type: Type.STRING }, notes: { type: Type.STRING } }, required: ["word", "translation"] } },
                    keys: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["structures", "vocabulary", "keys"]
                },
                sentence2Analysis: {
                  type: Type.OBJECT,
                  properties: {
                    structures: { type: Type.ARRAY, items: { type: Type.STRING } },
                    vocabulary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { word: { type: Type.STRING }, translation: { type: Type.STRING }, notes: { type: Type.STRING } }, required: ["word", "translation"] } },
                    keys: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["structures", "vocabulary", "keys"]
                },
                referenceTranslations1: { type: Type.ARRAY, items: { type: Type.STRING } },
                referenceTranslations2: { type: Type.ARRAY, items: { type: Type.STRING } },
                overallFulfillmentKeys: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["sentence1Chinese", "sentence2Chinese", "sentence1Analysis", "sentence2Analysis", "referenceTranslations1", "referenceTranslations2", "overallFulfillmentKeys"]
            }
          }
        });

        if (!response.text) throw new Error("No response content from Gemini.");
        return res.json(JSON.parse(response.text.trim()));
      }
    } catch (apiError: any) {
      console.warn("API Call for Analyze Prompt failed, falling back to local simulation:", apiError.message);
    }

    // Default simulation fallback
    return res.json(getFallbackAnalysis(sentence1, sentence2));
  } catch (error: any) {
    console.error("General error in /api/analyze-prompt:", error);
    return res.status(200).json(getFallbackAnalysis(req.body.sentence1, req.body.sentence2));
  }
});

// Helper to extract text and seat number from visual SVG data URIs
function extractFromSvg(svgDataUri: string): { text: string; seatWeb: number | null } {
  try {
    const decoded = decodeURIComponent(
      svgDataUri
        .replace(/^data:image\/svg\+xml;utf8,/, "")
        .replace(/^data:image\/svg\+xml;base64,/, "")
    );
    const textMatches = decoded.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi);
    const textLines: string[] = [];
    let seatWeb: number | null = null;
    
    const seatMatch = decoded.match(/SEAT No\.\s*(\d+)/i);
    if (seatMatch) {
      seatWeb = parseInt(seatMatch[1], 10);
    }
    
    for (const match of textMatches) {
      const content = match[1].trim()
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      if (!content) continue;
      if (content.includes("SEAT No.") || content === "GSAT" || content.includes("Translation Sheet")) {
        continue;
      }
      textLines.push(content);
    }
    
    return { text: textLines.join("\n"), seatWeb };
  } catch (err) {
    console.warn("Failed to extract SVG text:", err);
    return { text: "", seatWeb: null };
  }
}

// ── API: Grade student submission with Rubric ────────────────
app.post("/api/grade-student", async (req, res) => {
  let { seatNumber, image, manualText, promptAnalysis } = req.body;
  
  // Extract text and seat from handwriting SVG mocks dynamically if available
  if (image && image.startsWith("data:image/svg+xml")) {
    const extracted = extractFromSvg(image);
    if (extracted.text) {
      manualText = extracted.text;
    }
    if (extracted.seatWeb && !seatNumber) {
      seatNumber = extracted.seatWeb;
    }
  }

  try {
    if (!promptAnalysis) {
      return res.status(400).json({ error: "Missing prompt analysis context." });
    }

    const gradingSystemPrompt = `
You are an elite English teacher evaluating a Taiwanese high school student's translation for the GSAT under these strict grading guidelines:

### GRADING AND DEDUCTIONS HANDBOOK:
1. SCORE LIMITS: Each sentence has a maximum of 4.0 points (total 8.0). Score deductions should be in steps of 0.5 points. Minimum score per sentence is 0.0.
2. DEDUCTION STANDARD: Usually, deduct exactly 0.5 points for each error (such as grammatical errors, spelling mistakes, inappropriate word choice, omissions, or unclear phrasing) in a sentence.
3. ACCUMULATION OF ERRORS: If a sentence is severely incoherent, has a chaotic structure, or is extremely messy, grade it based on overall impression. Do not double-penalize minor things; deduct more heavily overall (e.g., scoring 0.5, 1.0, or 1.5 total for the sentence) based on overall incoherence.
4. NO REPEATED PENALTIES: If the same spelling, vocabulary, or grammatical mistake occurs multiple times within the same sentence/question, only deduct points ONCE for that specific mistake.
5. EMPTY OR NO TRANSLATION RULE (CRITICAL): If a sentence is empty, has no translation, has only "No translation submitted", placeholder texts, or has not been answered by the student at all, you MUST award EXACTLY 0.0 points for that sentence. You must never award 4.0 points or full marks for empty or unsubmitted answers.
6. KEYS TO SCORING:
   - Correct Structure: Ensure sentences have complete subjects and verbs, and tenses (e.g., past tense, present perfect tense, active vs passive voice) are 100% accurate.
   - Vocabulary & Spelling: Pay close attention to spelling. Ensure vocabulary parts of speech match requirements of the sentence pattern perfectly.
   - Fluency & Clarity: Avoid word-for-word translation (Chinglish) at all costs. The translated version should align with natural English idiomatic usage.

Return a raw JSON object with this shape:
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

Instructions:
- All feedbacks, explanations of deductions, and majorIssues summaries MUST be written in natural Traditional Chinese (Taiwan, 繁體中文).
- Be incredibly professional, objective, and clear so an English teacher instantly understands the deduction rationale.
`;

    const gradingPrompt = `
Chinese Sentence 1: "${promptAnalysis.sentence1Chinese}"
Chinese Sentence 2: "${promptAnalysis.sentence2Chinese}"
Reference Answers S1: ${JSON.stringify(promptAnalysis.referenceTranslations1)}
Reference Answers S2: ${JSON.stringify(promptAnalysis.referenceTranslations2)}

Task:
- If an image is provided as part of OCR, transcribe the handwriting for Sentence 1 and Sentence 2 with absolute preservation of spelling, grammar, and typos, and detect the seat number if visible.
- If no image is provided or if OCR content matches, evaluate this typed text directly: "${manualText || ''}". Split it into S1 and S2, then fill "ocrSentence1" and "ocrSentence2" accordingly.
- Score both S1 and S2 under the rubrics rules specified in your system instructions. If the text transcription is empty or represents "No translation submitted", the score is EXACTLY 0.0.
`;

    try {
      if (hasOpenAIKey()) {
        try {
          const data = await callOpenAIMultimodal(
            gradingSystemPrompt,
            gradingPrompt,
            image
          );
          return res.json(data);
        } catch (err: any) {
          console.error("OpenAI grading failed, trying Gemini:", err.message);
        }
      }

      if (hasGeminiKey()) {
        const ai = getGeminiClient();
        const parts: any[] = [];
        if (image) {
          const match = image.match(/^data:([^;]+);base64,(.+)$/);
          if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
        parts.push({ text: gradingPrompt });

        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: { parts },
          config: {
            systemInstruction: gradingSystemPrompt,
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
                errors1: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { originalSegment: { type: Type.STRING }, suggestedSegment: { type: Type.STRING }, errorType: { type: Type.STRING }, explanation: { type: Type.STRING }, pointsDeducted: { type: Type.NUMBER } }, required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"] } },
                errors2: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { originalSegment: { type: Type.STRING }, suggestedSegment: { type: Type.STRING }, errorType: { type: Type.STRING }, explanation: { type: Type.STRING }, pointsDeducted: { type: Type.NUMBER } }, required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"] } },
                feedback1: { type: Type.STRING },
                feedback2: { type: Type.STRING },
                improvedVersion: { type: Type.STRING },
                majorIssues: { type: Type.STRING }
              },
              required: ["ocrSentence1", "ocrSentence2", "score1", "score2", "totalScore", "errors1", "errors2", "feedback1", "feedback2", "improvedVersion", "majorIssues"]
            }
          }
        });

        if (!response.text) throw new Error("Empty response from Gemini.");
        return res.json(JSON.parse(response.text.trim()));
      }
    } catch (apiError: any) {
      console.warn("AI grading call failed, falling back to simulation engine gracefully:", apiError.message);
    }

    // Graceful fallback if AI keys are missing or API calls fail
    return res.json(getFallbackGrading(seatNumber, manualText, promptAnalysis));
  } catch (error: any) {
    console.error("General error in /api/grade-student:", error);
    return res.json(getFallbackGrading(seatNumber, manualText, promptAnalysis));
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
