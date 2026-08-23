"""Reviewed bilingual fallback copy used when a generated answer is unsafe or unavailable."""

from digilicense_ai.schemas import Locale

PII_LOCAL_HELP = {
    Locale.ENGLISH: (
        "For your privacy, personal information was removed and was not sent to an AI "
        "provider. Here is general guidance based only on the current DigiLicense page."
    ),
    Locale.HINDI: (
        "आपकी गोपनीयता के लिए निजी जानकारी हटा दी गई और किसी AI प्रदाता को नहीं भेजी गई। "
        "यह केवल मौजूदा DigiLicense पेज पर आधारित सामान्य मार्गदर्शन है।"
    ),
}

UNSUPPORTED = {
    Locale.ENGLISH: (
        "I can only explain DigiLicense services using public guidance. Please ask about the "
        "licence service shown on this page."
    ),
    Locale.HINDI: (
        "मैं केवल सार्वजनिक मार्गदर्शन के आधार पर DigiLicense सेवाओं को समझा सकता हूँ। कृपया "
        "इस पेज पर दिखाई गई लाइसेंस सेवा के बारे में पूछें।"
    ),
}

SAFETY = {
    Locale.ENGLISH: (
        "I cannot safely process that question right now. Please remove personal information "
        "and try again."
    ),
    Locale.HINDI: (
        "मैं अभी इस प्रश्न को सुरक्षित रूप से संसाधित नहीं कर सकता। कृपया निजी जानकारी हटाकर फिर प्रयास करें।"
    ),
}

BOUNDARY = {
    Locale.ENGLISH: (
        "I could not safely prepare that answer. Please use the public guidance on this page "
        "and try again without personal information."
    ),
    Locale.HINDI: (
        "मैं उस उत्तर को सुरक्षित रूप से तैयार नहीं कर सका। कृपया इस पेज पर सार्वजनिक मार्गदर्शन "
        "देखें और निजी जानकारी के बिना फिर प्रयास करें।"
    ),
}

PROVIDER = {
    Locale.ENGLISH: (
        "AI guidance is temporarily unavailable. Please use the public guidance on this "
        "page and try again later."
    ),
    Locale.HINDI: (
        "AI मार्गदर्शन अभी उपलब्ध नहीं है। कृपया इस पेज पर दिए सार्वजनिक मार्गदर्शन का उपयोग "
        "करें और बाद में फिर प्रयास करें।"
    ),
}

ESCALATIONS = {
    "REVIEW_PUBLIC_GUIDANCE": {
        Locale.ENGLISH: "Review the approved public guidance for the next step.",
        Locale.HINDI: "अगले चरण के लिए अनुमोदित सार्वजनिक मार्गदर्शन देखें।",
    },
    "CONTACT_PROTOTYPE_SUPPORT": {
        Locale.ENGLISH: "Use the public guidance or prototype support path for help.",
        Locale.HINDI: "सहायता के लिए सार्वजनिक मार्गदर्शन या प्रोटोटाइप सहायता मार्ग का उपयोग करें।",
    },
}

NO_EVIDENCE = {
    Locale.ENGLISH: (
        "I do not have enough reviewed guidance to answer that safely. Please use the public "
        "guidance shown on this page."
    ),
    Locale.HINDI: (
        "मेरे पास इसका सुरक्षित उत्तर देने के लिए पर्याप्त समीक्षित मार्गदर्शन नहीं है। कृपया इस "
        "पेज पर दिया गया सार्वजनिक मार्गदर्शन देखें।"
    ),
}
