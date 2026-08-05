import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

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

async function withRetries<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000,
  backoffFactor = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const is429 = error.status === 429 || (error.message && (
        error.message.includes("429") ||
        error.message.toLowerCase().includes("too many requests") ||
        error.message.includes("RESOURCE_EXHAUSTED") ||
        error.message.includes("rate limit")
      ));
      
      console.warn(`[API Attempt ${attempt}/${retries} failed] Error: ${error.message || error}. is429: ${is429}`);
      
      if (attempt >= retries) {
        throw error;
      }
      
      const waitTime = is429 ? delayMs * Math.pow(backoffFactor, attempt - 1) : delayMs;
      console.log(`Waiting ${waitTime}ms before retry attempt ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function callOpenAI(systemInstruction: string, promptText: string): Promise<any> {
  return withRetries(async () => {
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
      const err = new Error(`OpenAI API responded with code ${response.status}: ${errText}`);
      (err as any).status = response.status;
      throw err;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty completion choice returned from OpenAI.");
    return JSON.parse(content.trim());
  });
}

async function callOpenAIMultimodal(systemInstruction: string, promptText: string, image?: string): Promise<any> {
  const contentParts: any[] = [{ type: "text", text: promptText }];
  if (image) {
    contentParts.push({ type: "image_url", image_url: { url: image } });
  }

  return withRetries(async () => {
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
      const err = new Error(`OpenAI Multimodal API responded with code ${response.status}: ${errText}`);
      (err as any).status = response.status;
      throw err;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty completion choice returned from OpenAI.");
    return JSON.parse(content.trim());
  });
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
  const isUnivPrompt = promptAnalysis?.sentence1Chinese && (promptAnalysis.sentence1Chinese.includes("大學") || promptAnalysis.sentence1Chinese.includes("學生"));

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
      improvedVersion: (promptAnalysis?.referenceTranslations1?.[0] || "") + " " + (promptAnalysis?.referenceTranslations2?.[0] || ""),
      majorIssues: "⚠️ 未偵測到作答文字。請輸入文字或提供清晰之考卷掃描圖像。"
    };
  }

  // Helper to normalize text for preset matching
  const isTextMatchingPreset = (inputText: string, presetText: string): boolean => {
    const normInput = inputText.replace(/[^a-zA-Z]/g, "").toLowerCase();
    const normPreset = presetText.replace(/[^a-zA-Z]/g, "").toLowerCase();
    return normInput === normPreset;
  };

  // Check if the submitted text exactly matches one of our predefined preset submissions
  let matchedSeatPreset: any = null;
  if (isUnivPrompt) {
    for (let s = 1; s <= 5; s++) {
      const preset = FALLBACK_STUDENT_GRADINGS_UNIV[s];
      if (preset) {
        const presetFullText = (preset.ocrSentence1 || "") + "\n" + (preset.ocrSentence2 || "");
        if (
          isTextMatchingPreset(cleanText, presetFullText) ||
          isTextMatchingPreset(cleanText, preset.ocrSentence1 || "") ||
          isTextMatchingPreset(cleanText, preset.ocrSentence2 || "") ||
          (cleanText.toLowerCase().replace(/\s+/g, "").includes((preset.ocrSentence1 || "").toLowerCase().replace(/\s+/g, "")) &&
           cleanText.toLowerCase().replace(/\s+/g, "").includes((preset.ocrSentence2 || "").toLowerCase().replace(/\s+/g, "")))
        ) {
          matchedSeatPreset = preset;
          break;
        }
      }
    }
  }

  if (matchedSeatPreset) {
    const parts = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
    const text1 = parts[0] || "No translation submitted for Sentence 1.";
    const text2 = parts[1] || "No translation submitted for Sentence 2.";
    const s1Score = parts[0] ? matchedSeatPreset.score1 : 0.0;
    const s2Score = parts[1] ? matchedSeatPreset.score2 : 0.0;

    return {
      ...matchedSeatPreset,
      detectedSeatNumber: parsedSeat,
      ocrSentence1: text1,
      ocrSentence2: text2,
      score1: s1Score,
      score2: s2Score,
      totalScore: s1Score + s2Score,
      errors1: parts[0] ? matchedSeatPreset.errors1 : [],
      errors2: parts[1] ? matchedSeatPreset.errors2 : [],
      feedback1: parts[0] ? matchedSeatPreset.feedback1 : "未填寫第一句翻譯。",
      feedback2: parts[1] ? matchedSeatPreset.feedback2 : "未填寫第二句翻譯。",
      majorIssues: (s1Score === 0 || s2Score === 0) ? "⚠️ 部份句子未偵測到作答內容。" : matchedSeatPreset.majorIssues
    };
  }

  // Sub-questions processing
  const subQuestions = promptAnalysis?.subQuestions || [
    { id: 1, chinese: promptAnalysis?.sentence1Chinese || "", referenceTranslations: promptAnalysis?.referenceTranslations1 || [] },
    { id: 2, chinese: promptAnalysis?.sentence2Chinese || "", referenceTranslations: promptAnalysis?.referenceTranslations2 || [] }
  ];

  const lines = cleanText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const subQuestionGradings: any[] = [];
  let totalScoreSum = 0;

  subQuestions.forEach((sq: any, idx: number) => {
    const sText = lines[idx] || "";
    const refAnswers = sq.referenceTranslations || (idx === 0 ? promptAnalysis?.referenceTranslations1 : promptAnalysis?.referenceTranslations2) || [];
    let score = sText ? 4.0 : 0.0;
    const errors: any[] = [];

    if (sText) {
      const isMatchRef = refAnswers.some((ref: string) => {
        const normInput = sText.replace(/[^a-zA-Z]/g, "").toLowerCase();
        const normRef = ref.replace(/[^a-zA-Z]/g, "").toLowerCase();
        return normInput === normRef;
      });

      if (!isMatchRef) {
        if (/\bi\b/.test(sText)) {
          errors.push({ originalSegment: "i", suggestedSegment: "I", errorType: "Grammar", explanation: "第一人稱代名詞 'I' 均必須強制大寫。", pointsDeducted: 0.5 });
        }
        if (/anxius/i.test(sText)) {
          errors.push({ originalSegment: "anxius", suggestedSegment: "anxious", errorType: "Spelling", explanation: "拼寫錯誤，少了一個 'o'。應為 anxious。", pointsDeducted: 0.5 });
        }
        if (/(many|lots of|numerous|most of)\s+student\b/i.test(sText)) {
          errors.push({ originalSegment: "student", suggestedSegment: "students", errorType: "Grammar", explanation: "複數修飾詞後的可數名詞「學生」應使用複數型 (students)。", pointsDeducted: 0.5 });
        }
        if (/feel\s+lose\b/i.test(sText) || /felt\s+lose\b/i.test(sText)) {
          errors.push({ originalSegment: "lose", suggestedSegment: "lost", errorType: "Word Choice", explanation: "感到迷惘，英文習慣使用形容詞 lost。lose 為動詞「失去」，在此屬詞性誤用。", pointsDeducted: 0.5 });
        }
        if (/in\s+select\s+/i.test(sText) || /in\s+select$/i.test(sText)) {
          errors.push({ originalSegment: "in select", suggestedSegment: "when selecting", errorType: "Structure", explanation: "介名詞 in 後不可接原形動詞 select。請使用動名詞 selecting 或時間子句 when selecting。", pointsDeducted: 0.5 });
        }
        if (/\bdepart\b/i.test(sText)) {
          errors.push({ originalSegment: "depart", suggestedSegment: "department", errorType: "Word Choice", explanation: "修飾大學學系，應使用名詞 department；depart 為動詞「出發/起飛」。", pointsDeducted: 0.5 });
        }
        if (/during\s+they\b/i.test(sText)) {
          errors.push({ originalSegment: "during they are choosing", suggestedSegment: "while they are choosing", errorType: "Grammar", explanation: "during 為介系詞，後面不可直接接主動賓子句。請改用連接詞 while 或是 when。", pointsDeducted: 0.5 });
        }
        if (/Never\s+the\s+less/i.test(sText)) {
          errors.push({ originalSegment: "Never the less", suggestedSegment: "Nevertheless", errorType: "Spelling", explanation: "副詞 Nevertheless 應為單一單字，不可拆分成三個單詞撰寫。", pointsDeducted: 0.5 });
        }
        if (/exports/i.test(sText)) {
          errors.push({ originalSegment: "exports", suggestedSegment: "experts", errorType: "Spelling", explanation: "諮詢專家拼寫混淆。exports 代表「出口貨品」，專家則為 experts。", pointsDeducted: 0.5 });
        }
        if (/make\s+(\w+\s+)?decide\b/i.test(sText)) {
          const match = sText.match(/make\s+(\w+\s+)?decide\b/i);
          errors.push({ originalSegment: match ? match[0] : "decide", suggestedSegment: "make decision", errorType: "Grammar", explanation: "make 後接形容詞修飾時，必須使用名詞型態 decision；decide 為動詞形式，詞性錯誤。", pointsDeducted: 0.5 });
        }
        if (/auto\s+exploration/i.test(sText)) {
          errors.push({ originalSegment: "auto exploration", suggestedSegment: "self-exploration", errorType: "Word Choice", explanation: "自我探索語境慣用 self-exploration。auto 通常指機械式自動化。", pointsDeducted: 0.5 });
        }
        if (/across\s+self/i.test(sText)) {
          errors.push({ originalSegment: "across", suggestedSegment: "through", errorType: "Word Choice", explanation: "表達『透過...手段』，應選用介系詞 through，而非空間上的 across。", pointsDeducted: 0.5 });
        }
        if (/consulting\s+advisor\b/i.test(sText) && !/advisors/i.test(sText)) {
          errors.push({ originalSegment: "advisor", suggestedSegment: "advisors", errorType: "Grammar", explanation: "advisor 為可數名詞，在無冠詞修飾時應採用複數 advisors 以符泛指文法常規。", pointsDeducted: 0.5 });
        }

        let totalDeduction = 0;
        const seen = new Set<string>();
        errors.forEach(err => {
          const seg = (err.originalSegment || "").trim().toLowerCase();
          if (seg && seen.has(seg)) {
            err.pointsDeducted = 0;
            err.explanation += "（註：因重複相同處之瑕疵，不重複扣分）";
          } else {
            if (seg) seen.add(seg);
            totalDeduction += err.pointsDeducted;
          }
        });

        score = Math.max(0.5, 4.0 - totalDeduction);
      }
    }

    const sFeedback = sText
      ? (score === 4.0
          ? `第 ${idx + 1} 題翻譯極佳，句型與搭配符合標準解答。`
          : `第 ${idx + 1} 題含有 ${errors.length} 處細節需調整 (得分: ${score.toFixed(1)}/4.0)。`)
      : `第 ${idx + 1} 題未填寫作答。`;

    subQuestionGradings.push({
      questionIndex: idx + 1,
      ocrSentence: sText || `未作答 (Question ${idx + 1})`,
      score,
      errors,
      feedback: sFeedback,
      referenceAnswer: refAnswers[0] || ""
    });

    totalScoreSum += score;
  });

  const q1 = subQuestionGradings[0] || { ocrSentence: "", score: 0, errors: [], feedback: "" };
  const q2 = subQuestionGradings[1] || { ocrSentence: "", score: 0, errors: [], feedback: "" };

  return {
    detectedSeatNumber: parsedSeat,
    subQuestionGradings,
    ocrSentence1: q1.ocrSentence,
    ocrSentence2: q2.ocrSentence,
    score1: q1.score,
    score2: q2.score,
    totalScore: totalScoreSum,
    errors1: q1.errors,
    errors2: q2.errors,
    feedback1: q1.feedback,
    feedback2: q2.feedback,
    improvedVersion: subQuestionGradings.map(sq => sq.referenceAnswer).filter(Boolean).join(" "),
    majorIssues: (lines.length < subQuestions.length)
      ? `⚠️ 全卷 ${subQuestions.length} 題中，發現有 ${subQuestions.length - lines.length} 題未填寫。`
      : totalScoreSum === subQuestions.length * 4.0
      ? "🎉 滿分作答！句型結構與詞性表現極其優異。"
      : `全卷完成校對，總獲得分數：${totalScoreSum.toFixed(1)} / ${(subQuestions.length * 4.0).toFixed(1)} 分。`
  };
}

function formatFriendlyError(error: any): string {
  const errMsg = (error?.message || String(error)).trim();
  const lowerMsg = errMsg.toLowerCase();

  // 1. HTTP Referer restriction block (commonly blocked on Google Cloud)
  if (
    lowerMsg.includes("api_key_http_referrer_blocked") ||
    lowerMsg.includes("requests from referer") ||
    lowerMsg.includes("referer <empty> are blocked") ||
    lowerMsg.includes("referer blocked") ||
    lowerMsg.includes("api_key_http_referer_blocked")
  ) {
    return "💡 金鑰安全限制異常：\n您的 Google Cloud API 金鑰目前設定了「HTTP 來源網站限制 (HTTP Referrer)」！\n\n【原因分析】：\n大考英文 Translation AI 批改系統採用了安全且不外洩 API 金鑰的「伺服器端安全連線 (Server-side)」運作模式。然而當伺服器向 Google 伺服器發送 API 請求時，Google Cloud 系統會判定為「Referer 來源為空」進而強制攔截。\n\n【解決方案】：\n1. 請登入您或學校的 Google Cloud Console 或是 Google AI Studio。\n2. 點擊金鑰設置，將此 API 金鑰的「來源網站 / 硬體應用程式限制」暫時調整為「無限制 (None)」。\n3. 若考慮絕對資安，請調整為啟用其下方的「API 限制」，並勾選「限制僅能發送 Generative Language API 請求」（而非設定 HTTP 來源 Referer 限制）。修改並儲存後即可立刻批改與分析！";
  }

  // 2. Permission Denied or Invalid API Key
  if (
    lowerMsg.includes("permission_denied") ||
    lowerMsg.includes("api key not valid") ||
    lowerMsg.includes("invalid api key") ||
    lowerMsg.includes("key blocked") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("403")
  ) {
    return `💡 金鑰無效或授權遭拒 (403 Permission Denied)：\n\n【常見排查原因】：\n1. 輸入的 API 金鑰不正確（複製時多選了前後空白，或未完整選取）。\n2. 該金鑰所屬的 Google Cloud 專案可能已被停用、過期或信用卡授權未開通。\n3. 您可能啟用了不相容的 API 安全限制（例如來源 IP 限制），而非上方的 Referrer 限制。\n\n【原本伺服器錯誤訊息】：${errMsg}`;
  }

  // 3. Rate Limit / Resource Exhausted (429)
  if (
    lowerMsg.includes("429") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("too many requests") ||
    lowerMsg.includes("rate limit")
  ) {
    return "💡 頻率限制 (429 Too Many Requests)：\n您的 API 金鑰目前超出了 Google Gemini 的最高呼叫頻率，或是每日免費配額限制已耗盡。\n\n【解決方案】：\n請稍等 30-60 秒後，再點選該學生的考卷重試！或考慮至 AI 系統設定更換備份金鑰。";
  }

  // 4. OpenAI key issue
  if (lowerMsg.includes("openai") && (lowerMsg.includes("api_key") || lowerMsg.includes("unauthorized") || lowerMsg.includes("401"))) {
    return "💡 OpenAI 金鑰無效：\n請確認您的 OPENAI_API_KEY 餘額充足且未過期，或檢查金鑰複製是否完整。";
  }

  // Generic fallback with refined wording
  return `💡 AI 連線或分析失敗：\n${errMsg}\n\n【排查方案】：請確認您的上傳格式，或直接點選學生的「個別手動修正」按鈕，即可繞過 AI 進行人工修正批改！`;
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
        const response = await withRetries(async () => {
          return await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Analyze these two Chinese sentences for a GSAT English translation exercise.
  Chinese Sentence 1: "${sentence1}"
  Chinese Sentence 2: "${sentence2}"
  Provide key structures, academic vocabulary, and at least 3-4 diverse, correct translation options for reference (which can use different structures, tenses, or vocabulary).`,
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
        });

        if (!response.text) throw new Error("No response content from Gemini.");
        return res.json(JSON.parse(response.text.trim()));
      }
    } catch (apiError: any) {
      console.warn("API Call for Analyze Prompt failed:", apiError.message);
      if (hasOpenAIKey() || hasGeminiKey()) {
        return res.status(500).json({
          error: formatFriendlyError(apiError)
        });
      }
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

// ── Score Post-Processor to enforce Deduct Once & Perfect calculations ──
function sanitizeAndRecalculateScores(gradingResult: any): any {
  if (!gradingResult || typeof gradingResult !== "object") return gradingResult;
  
  // Create a deep copy to prevent any mutation issues
  const res = JSON.parse(JSON.stringify(gradingResult));

  // Determine if sentence 1 or 2 is empty/unsubmitted
  const s1Text = res.ocrSentence1 || "";
  const s2Text = res.ocrSentence2 || "";
  
  const s1IsEmpty = !s1Text.trim() || 
                    s1Text.toLowerCase().includes("no translation submitted") || 
                    s1Text.toLowerCase().includes("no translation available") ||
                    s1Text.toLowerCase().includes("placeholder") ||
                    s1Text.includes("未作答") ||
                    s1Text === "(空白或無辨識結果)";
                    
  const s2IsEmpty = !s2Text.trim() || 
                    s2Text.toLowerCase().includes("no translation submitted") || 
                    s2Text.toLowerCase().includes("no translation available") ||
                    s2Text.toLowerCase().includes("placeholder") ||
                    s2Text.includes("未作答") ||
                    s2Text === "(空白或無辨識結果)";

  let baseS1 = s1IsEmpty ? 0.0 : 4.0;
  let baseS2 = s2IsEmpty ? 0.0 : 4.0;

  // Process Sentence 1 Errors
  const errors1 = res.errors1 || [];
  const s1SeenErrors = new Set<string>();
  let sumDeduction1 = 0;

  errors1.forEach((err: any) => {
    const rawSegment = (err.originalSegment || "").trim().toLowerCase();

    // If a student makes the exact same error, only deduct once!
    if (rawSegment && s1SeenErrors.has(rawSegment)) {
      err.pointsDeducted = 0;
      if (!err.explanation.includes("不重複扣分")) {
        err.explanation += "（註：因重複此相同處之瑕疵，此處依照大考中心規定不重複扣分）";
      }
    } else {
      if (rawSegment) {
        s1SeenErrors.add(rawSegment);
      }
      
      // Ensure pointsDeducted exists and is reasonable, default 0.5
      let points = Math.abs(Number(err.pointsDeducted));
      if (isNaN(points) || points < 0) {
        points = 0.5;
      }
      err.pointsDeducted = points;
      sumDeduction1 += points;
    }
  });

  // Process Sentence 2 Errors
  const errors2 = res.errors2 || [];
  const s2SeenErrors = new Set<string>();
  let sumDeduction2 = 0;

  errors2.forEach((err: any) => {
    const rawSegment = (err.originalSegment || "").trim().toLowerCase();

    if (rawSegment && s2SeenErrors.has(rawSegment)) {
      err.pointsDeducted = 0;
      if (!err.explanation.includes("不重複扣分")) {
        err.explanation += "（註：因重複此相同處之瑕疵，此處依照大考中心規定不重複扣分）";
      }
    } else {
      if (rawSegment) {
        s2SeenErrors.add(rawSegment);
      }
      
      let points = Math.abs(Number(err.pointsDeducted));
      if (isNaN(points) || points < 0) {
        points = 0.5;
      }
      err.pointsDeducted = points;
      sumDeduction2 += points;
    }
  });

  // Calculate scores
  let score1 = s1IsEmpty ? 0.0 : Math.max(0.0, baseS1 - sumDeduction1);
  let score2 = s2IsEmpty ? 0.0 : Math.max(0.0, baseS2 - sumDeduction2);

  // Apply round checks (deductions are in steps of 0.25 points)
  score1 = Math.round(score1 * 4) / 4;
  score2 = Math.round(score2 * 4) / 4;

  res.score1 = score1;
  res.score2 = score2;
  res.totalScore = score1 + score2;
  res.errors1 = errors1;
  res.errors2 = errors2;

  // Set friendly feedbacks if they're empty or placeholder
  if (!res.feedback1 || res.feedback1.includes("No feedback")) {
    res.feedback1 = s1IsEmpty ? "未作答" : (score1 === 4.0 ? "翻譯非常優秀，符合高標解答常模。" : "此句包含文法或字詞微疵。");
  }
  if (!res.feedback2 || res.feedback2.includes("No feedback")) {
    res.feedback2 = s2IsEmpty ? "未作答" : (score2 === 4.0 ? "結構完整、時態及轉折關係流暢清晰。" : "部分副詞、動詞主動被動關係可再琢磨。");
  }

  return res;
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

    // Direct mode: bypass AI token call and use local reference grading engine
    if (promptAnalysis?.answerMode === "direct") {
      return res.json(sanitizeAndRecalculateScores(getFallbackGrading(seatNumber, manualText, promptAnalysis)));
    }

    const gradingSystemPrompt = `
# Role
You are an expert English evaluator for the Taiwan GSAT (General Scholastic Ability Test) English Translation Section. Your grading must strictly follow the official College Entrance Examination Center (CEEC) guidelines while maintaining a realistic, professional, and encouraging grading standard.

# Grading Rules & Constraints
1. **Total Score**: 8.0 points maximum (2 sub-questions, 4.0 points each).
2. **Deduction Mechanism**: Deduct points based on error severity. Stop deducting once a sub-question reaches 0.0. Do not give negative scores.
3. **No Cumulative Penalties**: The exact same spelling, grammatical, or collocation error repeated within the same sub-question must only be penalized ONCE (mark subsequent occurrences as 0.0).
4. **Independence**: Grade Sentence 1 and Sentence 2 completely independently.

# Deduction Severity Guide (Crucial)
To strictly enforce details while maintaining fairness, use TWO tiers of deductions:

### 1. Major Errors (-0.5 points)
- **Severe Grammatical Errors**: Wrong verb tense that breaks logic, severe subject-verb disagreement, completely missing a verb or main clause structure.
- **Missing Key Vocabulary**: Completely failing to translate a key phrase or keyword from the Chinese prompt.
- **Blatant Spelling/Word Errors**: Misspelling a word into a completely different word, or choosing a vocabulary word that completely changes the meaning.
- **Punctuation & Capitalization**: Failing to capitalize the first letter of the sentence, or missing a final period/question mark.

### 2. Minor Flaws / Nuances (-0.25 points)
- **Minor Grammatical Flaws**: Missing an article (a/an/the) where it doesn't hurt comprehension, minor plural "s" omission on a secondary noun.
- **Imperfect Collocations**: Phrases that are grammatically legal and understandable but slightly unidiomatic or suboptimal (e.g., "dispute on" instead of "dispute over", "at first" with a misplaced trailing space, or using "large production" instead of "mass production").
- **Stylistic Inexactness**: Choosing a valid synonym that is slightly clumsy or less precise than the prompt's implied context, but still accurate in English.

# Acceptable Flexibility (Do NOT Deduct 0.5 for These)
- **Synonyms**: Do NOT penalize valid synonyms for keywords. 
  - "爭執" = dispute over, dispute on (-0.25 if you prefer 'over', but never -0.5), argue about, quarrel about.
  - "需求" = needs, demands, requirements.
  - "促進" = promote, boost, foster, improve, enhance.
- **Tense Consistency**: Do NOT strictly force the present tense. If a student translates the story in the past tense (e.g., "had a dispute... decided... surrendered"), it is acceptable AS LONG AS the tense is consistent throughout the sentence. Only penalize illogical tense jumps.

# Output JSON Schema & Layout Mapping
Return a raw JSON object with this exact shape:
{
  "detectedSeatNumber": number | null,
  "ocrSentence1": string,
  "ocrSentence2": string,
  "score1": number, // Sentence 1 Score: [X.XX]/4.0
  "score2": number, // Sentence 2 Score: [X.XX]/4.0
  "totalScore": number, // Total Score: [X.XX]/8.0
  "errors1": [ // Sentence 1 Breakdown Table Rows matching:
    {
      "originalSegment": string, // Student's Error
      "suggestedSegment": string, // Correction Guide / Corrected Version
      "errorType": string, // Category (Grammatical / Spelling / Word-choice / Missing)
      "explanation": string, // Taiwan Chinese Explanation, explicitly mentioning if it's -0.5 major error or -0.25 minor nuance
      "pointsDeducted": number // 0.5 or 0.25 (or 0.0 if repeated identical mistake)
    }
  ],
  "errors2": [ // Sentence 2 Breakdown Table Rows matching the same schema:
    {
      "originalSegment": string,
      "suggestedSegment": string,
      "errorType": string,
      "explanation": string,
      "pointsDeducted": number
    }
  ],
  "feedback1": string, // Teacher's Feedback (S1): A brief, constructive comment in Traditional Chinese (繁體中文)
  "feedback2": string, // Teacher's Feedback (S2): A brief, constructive comment in Traditional Chinese (繁體中文)
  "improvedVersion": string, // Model Essay: Provide a natural, high-level translation that matches student's chosen tense if reasonable, or use standard CEEC template
  "majorIssues": string // Diagnostic Summary (Traditional Chinese): Summarize the core areas of improvement for the student
}

Instructions:
- All explanations in table errors, feedbacks, and diagnostic summaries MUST use natural Traditional Chinese (Taiwan, 繁體中文).
- Be incredibly professional, objective, encouraging and clear.
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

    const hasKeys = hasOpenAIKey() || hasGeminiKey();

    try {
      if (hasOpenAIKey()) {
        try {
          const data = await callOpenAIMultimodal(
            gradingSystemPrompt,
            gradingPrompt,
            image
          );
          return res.json(sanitizeAndRecalculateScores(data));
        } catch (err: any) {
          console.error("OpenAI grading failed, trying Gemini:", err.message);
          if (!hasGeminiKey()) {
            throw err;
          }
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

        const response = await withRetries(async () => {
          return await ai.models.generateContent({
            model: "gemini-3.5-flash",
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
        });

        if (!response.text) throw new Error("Empty response from Gemini.");
        return res.json(sanitizeAndRecalculateScores(JSON.parse(response.text.trim())));
      }
    } catch (apiError: any) {
      console.error("AI grading true call failed after retries:", apiError.message || apiError);
      if (hasKeys) {
        return res.status(500).json({
          error: formatFriendlyError(apiError)
        });
      }
    }

    // Graceful fallback ONLY if AI keys are missing OR if manualText is provided enabling high-fidelity offline simulation
    return res.json(sanitizeAndRecalculateScores(getFallbackGrading(seatNumber, manualText, promptAnalysis)));
  } catch (error: any) {
    console.error("General error in /api/grade-student:", error);
    return res.json(sanitizeAndRecalculateScores(getFallbackGrading(seatNumber, manualText, promptAnalysis)));
  }
});

// Sends correction reports with attached red-ink PDFs directly to a student
app.post("/api/send-email", async (req, res) => {
  try {
    const { studentEmail, pdfBase64, htmlContent, subject, smtpConfig } = req.body;

    if (!studentEmail || !studentEmail.includes("@")) {
      return res.status(400).json({ error: "請輸入有效的學生電子郵件信箱 (Please provide a valid email)" });
    }

    const smtpHost = smtpConfig?.host;
    const smtpPort = Number(smtpConfig?.port) || 465;
    const smtpSecure = smtpConfig?.secure !== false;
    const smtpUser = smtpConfig?.auth?.user || smtpConfig?.user || "";
    const smtpPass = smtpConfig?.auth?.pass || smtpConfig?.pass || "";

    const hasCustomSmtp = 
      smtpConfig && 
      smtpHost && 
      smtpHost.trim() !== "" && 
      smtpHost !== "smtp.your-school.edu.tw" && 
      smtpUser && 
      smtpUser.trim() !== "" && 
      smtpPass && 
      smtpPass.trim() !== "";

    const attachmentBuffer = pdfBase64 ? Buffer.from(pdfBase64.split(",")[1] || pdfBase64, "base64") : null;

    if (hasCustomSmtp) {
      console.log(`[SMTP Mailer] Attempting real SMTP transmission via ${smtpHost}:${smtpPort} to ${studentEmail}...`);
      
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        timeout: 10000 // 10s connection timeout
      } as any);

      const mailOptions = {
        from: `大考英文作文校閱系統 <${smtpUser}>`,
        to: studentEmail,
        subject: subject || "學測英文翻譯糾錯：二句手寫紅筆批改回饋報告",
        html: htmlContent,
        attachments: attachmentBuffer ? [
          {
            filename: `GSAT_Translation_Feedback_SeatNo_${req.body.seatNumber || 'Student'}.pdf`,
            content: attachmentBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      };

      await transporter.sendMail(mailOptions);
      return res.json({ 
        success: true, 
        simulated: false, 
        msg: `電子郵件已成功發送！\n\n系統已連線至您的學校/個人 SMTP 伺服器 (${smtpHost})，並成功將紅墨水 PDF 糾錯報告寄發給學生：${studentEmail}。` 
      });
    } else {
      // Sandbox Mode: Simulate and output detailed trace
      console.log("================= SMTP SANDBOX SENDING ==================");
      console.log(`To: ${studentEmail}`);
      console.log(`Subject: ${subject || '學測二句紅筆批改回饋'}`);
      console.log(`Attached PDF: ${pdfBase64 ? "Yes (~" + Math.round(pdfBase64.length / 1024) + " KB)" : "No"}`);
      console.log("-----------------------------------------");
      console.log(`Body Fragment: ${htmlContent ? htmlContent.substring(0, 150) + "..." : "Empty"}`);
      console.log("=========================================================");

      return res.json({ 
        success: true, 
        simulated: true, 
        msg: `電子郵件模擬傳送成功！ (Sandbox Mode Output Success)`,
        detail: `【收件學生】：${studentEmail}\n\n【備註】：目前系統運行在「模擬测试沙盒」中（尚未設定 SMTP 伺服器配置）。\n\n系統已在前端由 A4 htmlCanvas + jsPDF 精準輸出大考紅墨水 PDF 糾錯附件，並模擬拼裝 HTML 郵件格式。如果老師您需要真正將電子郵件寄發到學生的信箱：\n1. 請點選系統畫面右上角的「✉️ 郵件 SMTP 設定」按鈕。\n2. 輸入您學校（如：chhs.hcc.edu.tw 學校伺服器）或個人的真实郵件伺服器帳密（若使用 Gmail，請使用應用程式密碼）。\n3. 修改完成後，點選「寄送」即可立刻向學生寄出攜帶紅筆校對報告 A4 PDF 附件的真實電子郵件！`
      });
    }
  } catch (error: any) {
    console.error("Error sending email:", error);
    return res.status(500).json({ error: `電子郵件傳送失敗：${error.message || error}` });
  }
});

// Setup Vite Dev Server / Static Asset Handler
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const viteKey = "vite";
    const { createServer: createViteServer } = await import(viteKey) as any;
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
