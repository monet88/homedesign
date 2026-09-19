export type Language = "en" | "vi" | "ja" | "ko" | "zh";

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "Chinese", nativeName: "简体中文", flag: "🇨🇳" },
];

export interface Dictionary {
  common: {
    signIn: string;
    signOut: string;
    tryFree: string;
    credits: string;
    buyCredits: string;
    claimFree: string;
    claiming: string;
    claimed: string;
    adminDashboard: string;
    projectsAssets: string;
    cancel: string;
    confirm: string;
    close: string;
    loading: string;
  };
  nav: {
    tools: string;
    beforeAfter: string;
    pricing: string;
    faq: string;
    projects: string;
  };
  hero: {
    eyebrow: string;
    headline: string;
    subtext: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  tools: {
    title: string;
    subtitle: string;
    interiorTitle: string;
    interiorDesc: string;
    tryInterior: string;
    exteriorTitle: string;
    exteriorDesc: string;
    tryExterior: string;
    floorPlanTitle: string;
    floorPlanDesc: string;
    tryFloorPlan: string;
  };
  beforeAfter: {
    title: string;
    subtitle: string;
    designThisStyle: string;
    original: string;
    aiRedesigned: string;
    interiorTab: string;
    exteriorTab: string;
    floorPlanTab: string;
    featuredSamples: string;
    viewing: string;
  };
  pricing: {
    title: string;
    subtitle: string;
    popularBadge: string;
    bestValueBadge: string;
    buyButton: string;
    usageTitle: string;
    currencyNotice: string;
  };
  claimBanner: {
    title: string;
    desc: string;
    button: string;
    claimedSuccess: string;
  };
  paymentModal: {
    title: string;
    subtitle: string;
    vietqrTab: string;
    stripeTab: string;
    vietqrDesc: string;
    stripeDesc: string;
    copyAccount: string;
    copyAmount: string;
    copyTransferCode: string;
    copied: string;
    scanInstruction: string;
    proceedStripe: string;
  };
  faq: {
    title: string;
    subtitle: string;
    items: { question: string; answer: string }[];
  };
  ctaBanner: {
    title: string;
    desc: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  footer: {
    description: string;
    allRightsReserved: string;
    toolsTitle: string;
    resourcesTitle: string;
    aboutTitle: string;
    privacy: string;
    terms: string;
  };
  studio: {
    fullRedesign: string;
    virtualStaging: string;
    localEdit: string;
    model: string;
    roomType: string;
    designStyle: string;
    colorScheme: string;
    aspectRatio: string;
    customRequirements: string;
    customPlaceholder: string;
    generateButton: string;
    generating: string;
    generatedResult: string;
    download: string;
    regenerate: string;
    tryAgain: string;
    uploadTitle: string;
    uploadHint: string;
    uploadSubhint: string;
    examplesTitle: string;
    brushMaskTitle: string;
    realtorPresets: string;
  };
}
