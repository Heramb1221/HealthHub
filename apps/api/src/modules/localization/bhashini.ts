import type { Env } from "../../config/env.js";

export type SupportedLanguage = "en" | "hi" | "ta" | "te" | "mr" | "bn";

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇮🇳" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇮🇳" },
];

/**
 * Curated high-confidence medical and navigation dictionary.
 * Ensures zero-latency, 100% offline-resilient translation across
 * core patient journeys, emergency triage, and digital health cards.
 */
export const CORE_DICTIONARY: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    prescriptions: "Prescriptions",
    medications: "Medications",
    history: "History",
    vaccinations: "Vaccinations",
    family_tree: "Family Health Tree",
    insurance: "Insurance",
    health_card: "Digital Health Card",
    hospitals: "Hospitals",
    appointments: "Appointments",
    payments: "Payments",
    profile: "Profile",
    symptom_checker: "AI Symptom Checker",
    sign_out: "Sign out",
    emergency_call: "Emergency Call 112 / 108",
    needs_review: "Needs Review",
    verified: "Verified",
    unverified: "Unverified",
    take_dose: "Mark as Taken",
    skip_dose: "Skip Dose",
    before_food: "Before Food",
    after_food: "After Food",
    twice_daily: "Twice a day",
    once_daily: "Once a day",
    hospital_directory: "Find Hospitals & Clinics",
    book_appointment: "Book Appointment",
    cashless_insurance: "Cashless Network Status",
    share_whatsapp: "Share on WhatsApp",
    telegram_alerts: "Telegram Bot Alerts",
    device_alarms: "Local Device Alarms",
    clinical_disclaimer: "Advisory only. Always consult a licensed doctor for diagnosis and prescription changes.",
  },
  hi: {
    dashboard: "डैशबोर्ड",
    prescriptions: "दवा पर्ची (प्रिस्क्रिप्शन)",
    medications: "दवाइयां और खुराक",
    history: "चिकित्सा इतिहास",
    vaccinations: "टीकाकरण (वैक्सीनेशन)",
    family_tree: "पारिवारिक स्वास्थ्य वृक्ष",
    insurance: "स्वास्थ्य बीमा",
    health_card: "डिजिटल स्वास्थ्य कार्ड",
    hospitals: "अस्पताल और क्लीनिक",
    appointments: "अपॉइंटमेंट",
    payments: "भुगतान और रसीदें",
    profile: "मेरी प्रोफ़ाइल",
    symptom_checker: "लक्षण जांच (सिम्टम चेकर)",
    sign_out: "लॉग आउट करें",
    emergency_call: "आपातकालीन कॉल 112 / 108",
    needs_review: "समीक्षा आवश्यक",
    verified: "सत्यापित",
    unverified: "असत्यापित",
    take_dose: "दवा ले ली (Taken)",
    skip_dose: "खुराक छोड़ी (Skip)",
    before_food: "भोजन से पहले",
    after_food: "भोजन के बाद",
    twice_daily: "दिन में दो बार",
    once_daily: "दिन में एक बार",
    hospital_directory: "अस्पताल और क्लीनिक खोजें",
    book_appointment: "अपॉइंटमेंट बुक करें",
    cashless_insurance: "कैशलेस नेटवर्क स्थिति",
    share_whatsapp: "व्हाट्सएप पर भेजें",
    telegram_alerts: "टेलीग्राम बॉट अलर्ट",
    device_alarms: "डिवाइस अलार्म",
    clinical_disclaimer: "केवल सलाहकारी। निदान और दवा में बदलाव के लिए हमेशा प्रमाणित डॉक्टर से परामर्श लें।",
  },
  ta: {
    dashboard: "முகப்பு பலகை",
    prescriptions: "மருந்து சீட்டு",
    medications: "மருந்துகள் & அட்டவணை",
    history: "மருத்துவ வரலாறு",
    vaccinations: "தடுப்பூசி விவரம்",
    family_tree: "குடும்ப சுகாதார வரைபடம்",
    insurance: "மருத்துவ காப்பீடு",
    health_card: "டிஜிட்டல் ஹெல்த் கார்டு",
    hospitals: "மருத்துவமனைகள்",
    appointments: "முன்பதிவுகள்",
    payments: "கட்டணங்கள்",
    profile: "சுயவிவரம்",
    symptom_checker: "அறிகுறி சரிபார்ப்பு",
    sign_out: "வெளியேறு",
    emergency_call: "அவசர அழைப்பு 112 / 108",
    needs_review: "மறுஆய்வு தேவை",
    verified: "சரிபார்க்கப்பட்டது",
    unverified: "சரிபார்க்கப்படாதது",
    take_dose: "மருந்து எடுத்தாயிற்று",
    skip_dose: "தவிர்க்கவும்",
    before_food: "உணவுக்கு முன்",
    after_food: "உணவுக்குப் பின்",
    twice_daily: "நாளைக்கு இருமுறை",
    once_daily: "நாளைக்கு ஒருமுறை",
    hospital_directory: "மருத்துவமனைகளைத் தேடுங்கள்",
    book_appointment: "நேரத்தை முன்பதிவு செய்க",
    cashless_insurance: "பணமில்லா வசதி நிலை",
    share_whatsapp: "வாட்ஸ்அப்பில் பகிரவும்",
    telegram_alerts: "டெலிகிராம் எச்சரிக்கைகள்",
    device_alarms: "சாதன அலாரங்கள்",
    clinical_disclaimer: "ஆலோசனை மட்டுமே. நோயறிதல் மற்றும் மருந்து மாற்றங்களுக்கு எப்போதும் மருத்துவரை அணுகவும்.",
  },
  te: {
    dashboard: "డాష్‌బోర్డ్",
    prescriptions: "వైద్య చీటీలు (ప్రిస్క్రిప్షన్లు)",
    medications: "మందులు & వేళలు",
    history: "వైద్య చరిత్ర",
    vaccinations: "టీకాలు",
    family_tree: "కుటుంబ ఆరోగ్య వృక్షం",
    insurance: "ఆరోగ్య బీమా",
    health_card: "డిజిటల్ హెల్త్ కార్డు",
    hospitals: "ఆసుపత్రులు",
    appointments: "అపాయింట్‌మెంట్లు",
    payments: "చెల్లింపులు & బిల్లులు",
    profile: "ప్రొఫైల్",
    symptom_checker: "లక్షణాల తనిఖీ",
    sign_out: "లాగ్ అవుట్",
    emergency_call: "అత్యవసర కాల్ 112 / 108",
    needs_review: "సమీక్ష అవసరం",
    verified: "ధృవీకరించబడింది",
    unverified: "ధృవీకరించబడలేదు",
    take_dose: "మందు తీసుకున్నాను",
    skip_dose: "దాటవేయి",
    before_food: "భోజనానికి ముందు",
    after_food: "భోజనం తర్వాత",
    twice_daily: "రోజుకు రెండుసార్లు",
    once_daily: "రోజుకు ఒకసారి",
    hospital_directory: "ఆసుపత్రులను కనుగొనండి",
    book_appointment: "అపాయింట్‌మెంట్ బుక్ చేయండి",
    cashless_insurance: "క్యాష్‌లెస్ నెట్‌వర్క్ స్థితి",
    share_whatsapp: "వాట్సాప్‌లో పంపండి",
    telegram_alerts: "టెలిగ్రామ్ అలర్ట్స్",
    device_alarms: "డివైస్ అలారాలు",
    clinical_disclaimer: "సలహా కొరకు మాత్రమే. చికిత్స మరియు మందుల మార్పుల కోసం ఎల్లప్పుడూ వైద్యుడిని సంప్రదించండి.",
  },
  mr: {
    dashboard: "डॅशबोर्ड",
    prescriptions: "औषध चिठ्ठी (प्रिस्क्रिप्शन)",
    medications: "औषधे आणि वेळापत्रक",
    history: "वैद्यकीय इतिहास",
    vaccinations: "लसीकरण",
    family_tree: "कौटुंबिक आरोग्य वृक्ष",
    insurance: "आरोग्य विमा",
    health_card: "डिजिटल हेल्थ कार्ड",
    hospitals: "रुग्णालये आणि दवाखाने",
    appointments: "अपॉइंटमेंट्स",
    payments: "देयके आणि पावत्या",
    profile: "माझी प्रोफाइल",
    symptom_checker: "लक्षण तपासणी",
    sign_out: "लॉग आउट",
    emergency_call: "आपत्कालीन कॉल 112 / 108",
    needs_review: "पुनरावलोकन आवश्यक",
    verified: "सत्यापित",
    unverified: "असत्यापित",
    take_dose: "औषध घेतले",
    skip_dose: "डोस वगळा",
    before_food: "जेवणापूर्वी",
    after_food: "जेवणानंतर",
    twice_daily: "दिवसातून दोनदा",
    once_daily: "दिवसातून एकदा",
    hospital_directory: "रुग्णालये शोधा",
    book_appointment: "अपॉइंटमेंट बुक करा",
    cashless_insurance: "कॅशलेस नेटवर्क स्थिती",
    share_whatsapp: "व्हॉट्सॲपवर पाठवा",
    telegram_alerts: "टेलिग्राम सूचना",
    device_alarms: "डिव्हाइस अलार्म",
    clinical_disclaimer: "फक्त सल्लागार माहिती. निदान आणि औषधोपचारांसाठी नेहमी डॉक्टरांचा सल्ला घ्या.",
  },
  bn: {
    dashboard: "ড্যাশবোর্ড",
    prescriptions: "প্রেসক্রিপশন",
    medications: "ওষুধ এবং সময়সূচী",
    history: "চিকিৎসার ইতিহাস",
    vaccinations: "টিকা এবং প্রতিষেধক",
    family_tree: "পারিবারিক স্বাস্থ্য তালিকা",
    insurance: "স্বাস্থ্য বীমা",
    health_card: "ডিজিটাল হেলথ কার্ড",
    hospitals: "হাসপাতাল ও ক্লিনিক",
    appointments: "অ্যাপয়েন্টমেন্ট",
    payments: "পেমেন্ট ও বিল",
    profile: "প্রোফাইল",
    symptom_checker: "উপসর্গ পরীক্ষক",
    sign_out: "লগ আউট",
    emergency_call: "জরুরী কল 112 / 108",
    needs_review: "পর্যালোচনা প্রয়োজন",
    verified: "যাচাইকৃত",
    unverified: "অযাচাইকৃত",
    take_dose: "ওষুধ গ্রহণ করেছি",
    skip_dose: "বাদ দিন",
    before_food: "খাওয়ার আগে",
    after_food: "খাওয়ার পরে",
    twice_daily: "দিনে দুবার",
    once_daily: "দিনে একবার",
    hospital_directory: "হাসপাতাল খুঁজুন",
    book_appointment: "অ্যাপয়েন্টমেন্ট বুক করুন",
    cashless_insurance: "ক্যাশলেস নেটওয়ার্ক স্থিতি",
    share_whatsapp: "হোয়াটসঅ্যাপে শেয়ার করুন",
    telegram_alerts: "টেলিগ্রাম সতর্কতা",
    device_alarms: "ডিভাইস অ্যালার্ম",
    clinical_disclaimer: "শুধুমাত্র পরামর্শমূলক। রোগ নির্ণয় ও ওষুধ পরিবর্তনের জন্য সর্বদা চিকিৎসকের পরামর্শ নিন।",
  },
};

export interface TranslateRequest {
  text: string;
  sourceLang?: SupportedLanguage;
  targetLang: SupportedLanguage;
}

export interface TranslateResponse {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: "bhashini_api" | "curated_dictionary";
}

/**
 * Translates text into the target Indian language.
 * Uses curated dictionary first; falls back to Bhashini API if configured.
 */
export async function translateContent(
  env: Env,
  req: TranslateRequest,
): Promise<TranslateResponse> {
  const source = req.sourceLang || "en";
  const target = req.targetLang;

  if (source === target) {
    return { translatedText: req.text, sourceLang: source, targetLang: target, provider: "curated_dictionary" };
  }

  // 1. Check dictionary by key or exact English string
  const targetDict = CORE_DICTIONARY[target] || CORE_DICTIONARY.en;
  const enDict = CORE_DICTIONARY.en;

  // Search if text matches any key
  const directMatch = targetDict[req.text];
  if (directMatch) {
    return { translatedText: directMatch, sourceLang: source, targetLang: target, provider: "curated_dictionary" };
  }

  // Search if text matches an English value
  for (const [key, val] of Object.entries(enDict)) {
    const translation = targetDict[key];
    if (val.toLowerCase() === req.text.toLowerCase() && translation) {
      return { translatedText: translation, sourceLang: source, targetLang: target, provider: "curated_dictionary" };
    }
  }


  // 2. Bhashini Live API Integration (if credentials configured)
  if (env.BHASHINI_API_KEY && env.BHASHINI_USER_ID) {
    try {
      const bhashiniRes = await fetch("https://nmt-api.bhashini.gov.in/v1/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": env.BHASHINI_API_KEY,
          "User-Id": env.BHASHINI_USER_ID,
        },
        body: JSON.stringify({
          sourceLanguage: source,
          targetLanguage: target,
          input: [{ source: req.text }],
        }),
      });

      if (bhashiniRes.ok) {
        const json = (await bhashiniRes.json()) as { output?: Array<{ target: string }> };
        const translated = json.output?.[0]?.target;
        if (translated) {
          return { translatedText: translated, sourceLang: source, targetLang: target, provider: "bhashini_api" };
        }
      }
    } catch {
      // Fallback gracefully to original text
    }
  }

  return {
    translatedText: req.text,
    sourceLang: source,
    targetLang: target,
    provider: "curated_dictionary",
  };
}
