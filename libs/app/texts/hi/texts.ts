import type { NgDocTexts } from '@ng-doc/app/interfaces';

/**
 * Picks the Hindi form of a word for a count.
 * @param count - The count.
 * @param forms - The form for each plural category of Hindi.
 * @returns The form for `count`.
 */
function plural(count: number, forms: Record<'one' | 'other', string>): string {
  return forms[new Intl.PluralRules('hi').select(count) as keyof typeof forms] ?? forms.other;
}

/**
 * The Hindi texts of NgDoc, for `provideNgDocTexts(NG_DOC_TEXTS_HI)`. Pass your own changes after
 * them: `provideNgDocTexts(NG_DOC_TEXTS_HI, { search: { placeholder: '…' } })`.
 *
 * These translations welcome corrections: open an issue or a pull request at
 * https://github.com/ng-doc/ng-doc that names the text (its group and key) and your wording.
 */
export const NG_DOC_TEXTS_HI: NgDocTexts = Object.freeze({
  blockquote: Object.freeze({
    note: 'नोट',
    warning: 'चेतावनी',
    alert: 'सावधान',
    success: 'सफलता',
  }),
  pane: Object.freeze({
    resizer: 'पैन का आकार बदलें',
  }),
  combobox: Object.freeze({
    placeholder: 'मान चुनें',
  }),
  search: Object.freeze({
    placeholder: 'दस्तावेज़ खोजें…',
    label: ({ shortcut }: { shortcut: string }) => `खोजें (${shortcut})`,
    shortcutMac: '⌘K',
    shortcutOther: 'Ctrl K',
    resultGuides: 'गाइड',
    resultApi: 'API',
    resultUnknown: 'अज्ञात',
    nothingFound: 'कुछ नहीं मिला…',
  }),
  searchPalette: Object.freeze({
    dialogLabel: 'खोजें',
    inputLabel: 'दस्तावेज़ीकरण में खोजें',
    inputPlaceholder: 'गाइड, API और कार्रवाइयाँ खोजें…',
    scopesLabel: 'खोज का स्कोप',
    scopeAll: 'सभी',
    scopeGuides: 'गाइड',
    scopeApi: 'API',
    scopeActions: 'कार्रवाइयाँ',
    resultsLabel: 'परिणाम',
    sectionTopMatches: 'शीर्ष मिलान',
    sectionGuides: 'गाइड',
    sectionApi: 'API',
    sectionActions: 'कार्रवाइयाँ',
    searching: 'खोजा जा रहा है…',
    failed: 'खोज विफल रही। फिर से कोशिश करें।',
    failedStatus: 'खोज विफल रही।',
    noResults: ({ query }: { query: string }) => `"${query}" के लिए कोई परिणाम नहीं`,
    typeToSearch: 'खोजने के लिए टाइप करें।',
    typeToSearchGuides: 'गाइड खोजने के लिए टाइप करें।',
    typeToSearchApi: 'API खोजने के लिए टाइप करें।',
    typeApi: 'API',
    typeGuide: 'गाइड',
    typeAction: 'कार्रवाई',
    actionKeepsOpen: 'सेटिंग बदलता है और खोज खुली रखता है।',
    actionRunsImmediately: 'तुरंत चलता है।',
    shortcut: 'शॉर्टकट',
    openSymbolPage: 'सिंबल पेज खोलें',
    open: 'खोलें',
    statusScope: ({ scope }: { scope: string }) => `${scope} स्कोप।`,
    // "परिणाम" is the same in the singular and the plural.
    statusResults: ({ scope, count }: { scope: string; count: number }) =>
      `${scope} स्कोप: ${count} परिणाम।`,
    statusNoResults: ({ scope, query }: { scope: string; query: string }) =>
      `${scope} स्कोप: "${query}" के लिए कोई परिणाम नहीं।`,
    keyEscape: 'Esc',
    keyTab: 'Tab',
    footerNavigate: 'नेविगेट करें',
    footerScopes: 'स्कोप और सेटिंग',
    footerSlash: 'खोज भी खोलता है',
    shortcutsSwitch: 'एक-कुंजी शॉर्टकट',
    shortcutsSwitchTitle: 'एक-अक्षर शॉर्टकट: / [ ] F L T',
    actionToggleTheme: 'डार्क मोड टॉगल करें',
    actionToggleThemeKeywords: 'थीम डार्क लाइट मोड गहरा हल्का theme dark light mode',
    actionCopyLink: 'इस पेज का लिंक कॉपी करें',
    actionCopyLinkKeywords: 'कॉपी लिंक यूआरएल शेयर साझा copy link url share',
    actionShortcutsOn: 'एक-कुंजी शॉर्टकट चालू करें',
    actionShortcutsOff: 'एक-कुंजी शॉर्टकट बंद करें',
    actionShortcutsKeywords: 'कीबोर्ड शॉर्टकट कुंजी कुंजियाँ एक keyboard shortcuts keys single',
  }),
  copy: Object.freeze({
    copy: 'क्लिपबोर्ड पर कॉपी करें',
    copied: 'कॉपी हो गया!',
    copyCode: 'कोड कॉपी करें',
    copyLinkToSection: 'सेक्शन का लिंक कॉपी करें',
  }),
  demo: Object.freeze({
    viewsLabel: 'डेमो व्यू',
    preview: 'प्रीव्यू',
    widthsLabel: 'प्रीव्यू की चौड़ाई',
    widthFull: 'पूरी चौड़ाई',
    width480: '480 पिक्सेल चौड़ा',
    width280: '280 पिक्सेल चौड़ा',
    readoutFull: '100% × ऑटो',
    readout480: '480 × ऑटो',
    readout280: '280 × ऑटो',
    openInNewTab: 'नए टैब में खोलें',
    frameTitle: ({ name }: { name: string }) => `${name} डेमो`,
    showCode: 'कोड दिखाएँ',
    hideCode: 'कोड छिपाएँ',
    code: 'कोड',
    loading: 'डेमो लोड हो रहा है।',
    failed: 'डेमो लोड नहीं हुआ।',
    openFrameInNewTab: 'इसे नए टैब में खोलें',
    openFullscreenRoute: 'डेमो को नए टैब में खोलें',
    fullscreen: 'फ़ुलस्क्रीन',
    exitFullscreen: 'फ़ुलस्क्रीन से बाहर निकलें',
    themePage: 'पेज की थीम',
    themeLabel: ({ current, next }: { current: string; next: string }) =>
      `डेमो थीम: ${current}। ${next} पर स्विच करें`,
    themeTooltip: ({ current }: { current: string }) => `डेमो थीम: ${current}`,
  }),
  playground: Object.freeze({
    title: 'प्लेग्राउंड',
    reset: 'रीसेट करें',
    recreate: 'फिर से बनाएँ',
    recreateHint: 'किसी भी इनपुट के बदलने पर हर बार डेमो को फिर से बनाता है',
    content: 'कंटेंट',
    settings: 'सेटिंग',
    defaultValue: 'डिफ़ॉल्ट',
    resetToDefault: 'डिफ़ॉल्ट मान पर रीसेट करें',
    addItem: 'आइटम जोड़ें',
    moveUp: 'ऊपर ले जाएँ',
    moveDown: 'नीचे ले जाएँ',
    removeItem: 'हटाएँ',
    item: ({ index }: { index: number }) => `आइटम ${index}`,
    invalidJson: 'अमान्य JSON',
    frameTitle: ({ id, target }: { id: string; target: string }) => `${id} प्लेग्राउंड: ${target}`,
    inPageControl: ({ input }: { input: string }) =>
      `यह प्लेग्राउंड पेज में चलता है क्योंकि \`${input}\` का कंट्रोल इसका समर्थन नहीं करता।`,
    inPageValue: ({ input, reason }: { input: string; reason: string }) =>
      `यह प्लेग्राउंड पेज में चलता है क्योंकि \`${input}\` का मान (${reason}) इसके फ़्रेम को नहीं भेजा जा सकता।`,
    inPageDefault: ({ input }: { input: string }) =>
      `यह प्लेग्राउंड पेज में चलता है क्योंकि \`${input}\` का डिफ़ॉल्ट मान इसके फ़्रेम को नहीं भेजा जा सकता।`,
    inPageTooLong:
      'यह प्लेग्राउंड पेज में चलता है क्योंकि इसके मान इसके फ़्रेम के URL के लिए बहुत लंबे हैं।',
    inPageSelector: ({ selector }: { selector: string }) =>
      `यह प्लेग्राउंड पेज में चलता है क्योंकि \`${selector}\` इसके टारगेट का सेलेक्टर नहीं है।`,
    inPageFrameError: ({ message }: { message: string }) =>
      `यह प्लेग्राउंड पेज में चलता है क्योंकि इसका फ़्रेम विफल रहा: ${message}`,
    inPageFrameSilent: 'यह प्लेग्राउंड पेज में चलता है क्योंकि इसका फ़्रेम लोड नहीं हुआ।',
    missing: 'यह प्लेग्राउंड मौजूद नहीं है।',
  }),
  navigation: Object.freeze({
    skipToContent: 'कंटेंट पर जाएँ',
    openMenu: 'नेविगेशन खोलें',
    closeMenu: 'नेविगेशन बंद करें',
    sidebar: 'दस्तावेज़ीकरण',
    breadcrumbs: 'ब्रेडक्रंब',
    pages: 'पिछला और अगला पेज',
    previous: 'पिछला',
    next: 'अगला',
  }),
  page: Object.freeze({
    copyLink: 'इस पेज का लिंक कॉपी करें',
    linkCopied: 'लिंक कॉपी हो गया',
    copyLinkTooltip: 'लिंक कॉपी करें',
    linkCopiedTooltip: 'कॉपी हो गया',
    edit: 'इस पेज को संपादित करें',
    viewSource: 'पेज का सोर्स देखें',
    viewSourceTooltip: 'सोर्स देखें',
    backTo: ({ title }: { title?: string }) => `${title ?? 'पेज'} पर वापस जाएँ`,
    back: 'वापस',
  }),
  content: Object.freeze({
    openImage: ({ alt }: { alt: string }) => `इमेज खोलें: ${alt}`,
    codeLines: ({ count, ranges }: { count: number; ranges: string }) =>
      `${count === 1 ? 'पंक्ति' : 'पंक्तियाँ'} ${ranges}`,
  }),
  toc: Object.freeze({
    symbol: 'सिंबल',
    onThisPage: 'इस पेज पर',
    readingProgress: 'पढ़ने की प्रगति',
    backToTop: 'ऊपर जाएँ',
    copyLink: 'लिंक कॉपी करें',
    copied: 'कॉपी हो गया',
    edit: 'इस पेज को संपादित करें',
  }),
  theme: Object.freeze({
    auto: 'ऑटो',
    light: 'लाइट',
    dark: 'डार्क',
    label: ({ current, next }: { current: string; next: string }) =>
      `${current} थीम। ${next.toLowerCase()} पर स्विच करें`,
    tooltip: ({ current }: { current: string }) => `${current} थीम`,
  }),
  apiList: Object.freeze({
    title: 'API संदर्भ',
    // "स्कोप" is the same in the singular and the plural.
    summary: ({ declarations, scopes }: { declarations: number; scopes: number }) =>
      `${scopes} स्कोप में ${declarations} ${plural(declarations, {
        one: 'घोषणा',
        other: 'घोषणाएँ',
      })}।`,
    filterPlaceholder: 'नाम से फ़िल्टर करें',
    filterPlaceholderWithDescriptions: 'नाम या विवरण से फ़िल्टर करें',
    filterLabel: 'घोषणाओं को नाम से फ़िल्टर करें',
    filterLabelWithDescriptions: 'घोषणाओं को नाम या विवरण से फ़िल्टर करें',
    groupBy: 'इसके अनुसार समूह बनाएँ',
    groupByKind: 'प्रकार',
    groupByScope: 'स्कोप',
    kindsLabel: 'प्रकार से फ़िल्टर करें',
    allKinds: 'सभी',
    scopeNote: ({ scope }: { scope: string }) => `केवल ${scope} दिखाया जा रहा है।`,
    showEveryScope: 'सभी स्कोप दिखाएँ',
    noDescription: 'कोई विवरण नहीं',
    empty: 'कोई घोषणा मेल नहीं खाती।',
    failed: 'API सूची लोड नहीं हो सकी।',
  }),
});
