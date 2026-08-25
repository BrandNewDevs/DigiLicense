import "@tanstack/react-start/server-only"

import type { PublicTestQuestion } from "../lib/learner-test"

type BankQuestion = PublicTestQuestion & { correctOption: number }

// Public road-sign and road-rule questions for the learner's test. Content is
// general traffic knowledge written for this prototype; it is not copied from
// any government question paper. The correctOption field is server-only:
// client bundles receive questions with answers stripped by server functions.
const learnerTestBank: readonly BankQuestion[] = [
  {
    id: "q-red-octagon",
    category: "road-sign",
    correctOption: 0,
    options: [
      {
        en: "Stop completely, then go when safe",
        hi: "पूरी तरह रुकें, सुरक्षित होने पर आगे बढ़ें",
      },
      {
        en: "Slow down only if vehicles are near",
        hi: "आस-पास वाहन हों तभी धीमे करें",
      },
      { en: "Sound the horn and continue", hi: "हॉर्न बजाकर आगे बढ़ें" },
    ],
    prompt: {
      en: "A red eight-sided sign at a junction means you must:",
      hi: "चौराहे पर लाल आठ-कोणीय (अष्टकोणीय) चिह्न का अर्थ है कि आपको:",
    },
  },
  {
    id: "q-yellow-line",
    category: "road-sign",
    correctOption: 1,
    options: [
      { en: "Overtaking is allowed here", hi: "यहाँ ओवरटेक की अनुमति है" },
      {
        en: "Parking is not allowed along this edge",
        hi: "इस किनारे पर वाहन खड़ा करना मना है",
      },
      {
        en: "Only two-wheelers may use this lane",
        hi: "इस लेन में केवल दो-पहिया वाहन चल सकते हैं",
      },
    ],
    prompt: {
      en: "A solid yellow line along the edge of a carriageway indicates:",
      hi: "सड़क के किनारे बनी ठोस पीली रेखा दर्शाती है:",
    },
  },
  {
    id: "q-overtake-side",
    category: "rule",
    correctOption: 2,
    options: [
      {
        en: "From whichever side has more space",
        hi: "जिस ओर अधिक जगह हो उस ओर से",
      },
      {
        en: "From the left of that vehicle",
        hi: "उस वाहन के बाईं ओर से",
      },
      {
        en: "From the right of that vehicle",
        hi: "उस वाहन के दाईं ओर से",
      },
    ],
    prompt: {
      en: "You want to pass a vehicle travelling ahead of you. You should pass from:",
      hi: "आप आगे जा रहे वाहन को पार करना चाहते हैं। आपको पार करना चाहिए:",
    },
  },
  {
    id: "q-pedestrian-crossing",
    category: "rule",
    correctOption: 1,
    options: [
      {
        en: "Continue; pedestrians must wait",
        hi: "आगे बढ़ें; पैदल चलने वालों को रुकना चाहिए",
      },
      {
        en: "Stop and give way to pedestrians",
        hi: "रुकें और पैदल चलने वालों को रास्ता दें",
      },
      {
        en: "Speed up to cross before them",
        hi: "उनसे पहले पार करने के लिए गति बढ़ाएँ",
      },
    ],
    prompt: {
      en: "People are waiting to cross at a pedestrian crossing ahead. You should:",
      hi: "आगे पैदल यात्री क्रॉसिंग पर लोग पार करने की प्रतीक्षा कर रहे हैं। आपको:",
    },
  },
  {
    id: "q-helmet",
    category: "rule",
    correctOption: 1,
    options: [
      { en: "Only on highways", hi: "केवल राजमार्ग पर" },
      {
        en: "On every ride, however short",
        hi: "हर सवारी पर, चाहे दूरी कितनी भी छोटी हो",
      },
      {
        en: "Only when carrying a pillion rider",
        hi: "केवल तब जब पीछे कोई सवार हो",
      },
    ],
    prompt: {
      en: "When riding a two-wheeler, a properly fastened helmet is required:",
      hi: "दो-पहिया वाहन चलाते समय, ठीक से बाँधा हुआ हेलमेट कब आवश्यक है?",
    },
  },
  {
    id: "q-blue-circle",
    category: "road-sign",
    correctOption: 1,
    options: [
      { en: "A warning about a hazard", hi: "खतरे की चेतावनी" },
      { en: "Something you must do", hi: "कोई काम जो आपको करना अनिवार्य है" },
      { en: "Something that is prohibited", hi: "कोई काम जो निषिद्ध है" },
    ],
    prompt: {
      en: "A circular sign with a blue background generally tells drivers:",
      hi: "नीली पृष्ठभूमि वाला गोल चिह्न सामान्यतः चालकों को बताता है:",
    },
  },
  {
    id: "q-horn-hospital",
    category: "rule",
    correctOption: 1,
    options: [
      {
        en: "Allowed, to warn other traffic",
        hi: "अनुमति है, अन्य यातायात को चेतावनी देने के लिए",
      },
      {
        en: "Not allowed; silence is required in such zones",
        hi: "अनुमति नहीं; ऐसे क्षेत्रों में शांति आवश्यक है",
      },
      { en: "Allowed only at night", hi: "केवल रात में अनुमति है" },
    ],
    prompt: {
      en: "You are driving past a marked hospital zone. Sounding the horn unnecessarily is:",
      hi: "आप चिह्नित अस्पताल क्षेत्र से गुजर रहे हैं। बिना आवश्यकता हॉर्न बजाना है:",
    },
  },
  {
    id: "q-triangle-sign",
    category: "road-sign",
    correctOption: 0,
    options: [
      {
        en: "Warn about a hazard or give-way rule ahead",
        hi: "आगे खतरे या रास्ता देने के नियम की चेतावनी देना",
      },
      { en: "Give a mandatory instruction", hi: "कोई अनिवार्य निर्देश देना" },
      { en: "Show a route destination", hi: "किसी मार्ग का गंतव्य दिखाना" },
    ],
    prompt: {
      en: "An inverted triangular sign board is used to:",
      hi: "उल्टे त्रिभुजाकार चिह्न फलक (साइन बोर्ड) का उपयोग होता है:",
    },
  },
  {
    id: "q-mobile-phone",
    category: "rule",
    correctOption: 2,
    options: [
      {
        en: "Allowed below 20 km/h",
        hi: "20 किमी/घंटा से कम गति पर अनुमति है",
      },
      {
        en: "Allowed only with earphones",
        hi: "केवल इयरफ़ोन से अनुमति है",
      },
      {
        en: "Not allowed while the vehicle is moving",
        hi: "वाहन चलते समय अनुमति नहीं है",
      },
    ],
    prompt: {
      en: "While driving, using a hand-held mobile phone for a call is:",
      hi: "वाहन चलाते समय हाथ में पकड़कर मोबाइल फ़ोन पर बात करना है:",
    },
  },
  {
    id: "q-emergency-vehicle",
    category: "rule",
    correctOption: 1,
    options: [
      {
        en: "Keep driving; it will find another lane",
        hi: "चलते रहें; वह दूसरा रास्ता निकाल लेगी",
      },
      {
        en: "Move aside safely and let it pass",
        hi: "सुरक्षित रूप से एक ओर हटें और जाने दें",
      },
      { en: "Follow closely behind it", hi: "उसके ठीक पीछे चलें" },
    ],
    prompt: {
      en: "An ambulance with its siren on approaches from behind. You should:",
      hi: "सायरन बजाती हुई एम्बुलेंस पीछे से आती है। आपको:",
    },
  },
] as const satisfies readonly BankQuestion[]

function getLearnerTestAnswerKey(): Map<string, number> {
  return new Map(
    learnerTestBank.map((question) => [question.id, question.correctOption])
  )
}

export { getLearnerTestAnswerKey, learnerTestBank }
