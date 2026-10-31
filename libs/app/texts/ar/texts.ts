import type { NgDocTexts } from '@ng-doc/app/interfaces';

/**
 * Picks the Arabic form of a word for a count, which is written before it in Western digits.
 * @param count - The count.
 * @param forms - The form for each plural category of Arabic.
 * @returns The form for `count`.
 */
function plural(
  count: number,
  forms: Record<'zero' | 'one' | 'two' | 'few' | 'many' | 'other', string>,
): string {
  return forms[new Intl.PluralRules('ar').select(count) as keyof typeof forms] ?? forms.other;
}

/**
 * The Arabic texts of NgDoc, for `provideNgDocTexts(NG_DOC_TEXTS_AR)`. Pass your own changes after
 * them: `provideNgDocTexts(NG_DOC_TEXTS_AR, { search: { placeholder: '…' } })`. NgDoc's layout is
 * left-to-right, so these texts translate the interface but don't mirror it.
 *
 * These translations welcome corrections: open an issue or a pull request at
 * https://github.com/ng-doc/ng-doc that names the text (its group and key) and your wording.
 */
export const NG_DOC_TEXTS_AR: NgDocTexts = Object.freeze({
  blockquote: Object.freeze({
    note: 'ملاحظة',
    warning: 'تحذير',
    alert: 'تنبيه',
    success: 'نجاح',
  }),
  pane: Object.freeze({
    resizer: 'تغيير حجم اللوحتين',
  }),
  combobox: Object.freeze({
    placeholder: 'اختر القيمة',
  }),
  search: Object.freeze({
    placeholder: 'ابحث في الوثائق…',
    label: ({ shortcut }: { shortcut: string }) => `بحث (${shortcut})`,
    shortcutMac: '⌘K',
    shortcutOther: 'Ctrl K',
    resultGuides: 'الأدلة',
    resultApi: 'API',
    resultUnknown: 'غير معروف',
    nothingFound: 'لم يُعثر على أي نتائج…',
  }),
  searchPalette: Object.freeze({
    dialogLabel: 'بحث',
    inputLabel: 'البحث في الوثائق',
    inputPlaceholder: 'ابحث في الأدلة و API والإجراءات…',
    scopesLabel: 'نطاق البحث',
    scopeAll: 'الكل',
    scopeGuides: 'الأدلة',
    scopeApi: 'API',
    scopeActions: 'الإجراءات',
    resultsLabel: 'النتائج',
    sectionTopMatches: 'أفضل التطابقات',
    sectionGuides: 'الأدلة',
    sectionApi: 'API',
    sectionActions: 'الإجراءات',
    searching: 'جارٍ البحث…',
    failed: 'فشل البحث. حاول مرة أخرى.',
    failedStatus: 'فشل البحث.',
    noResults: ({ query }: { query: string }) => `لا توجد نتائج لـ «${query}»`,
    typeToSearch: 'اكتب للبحث.',
    typeToSearchGuides: 'اكتب للبحث في الأدلة.',
    typeToSearchApi: 'اكتب للبحث في API.',
    typeApi: 'API',
    typeGuide: 'دليل',
    typeAction: 'إجراء',
    actionKeepsOpen: 'يغيّر الإعداد ويُبقي البحث مفتوحًا.',
    actionRunsImmediately: 'يُنفَّذ فورًا.',
    shortcut: 'اختصار',
    openSymbolPage: 'فتح صفحة الرمز',
    open: 'فتح',
    statusScope: ({ scope }: { scope: string }) => `النطاق «${scope}».`,
    statusResults: ({ scope, count }: { scope: string; count: number }) =>
      `النطاق «${scope}»: ${count} ${plural(count, {
        zero: 'نتيجة',
        one: 'نتيجة',
        two: 'نتيجتان',
        few: 'نتائج',
        many: 'نتيجة',
        other: 'نتيجة',
      })}.`,
    statusNoResults: ({ scope, query }: { scope: string; query: string }) =>
      `النطاق «${scope}»: لا توجد نتائج لـ «${query}».`,
    keyEscape: 'Esc',
    keyTab: 'Tab',
    footerNavigate: 'التنقل',
    footerScopes: 'النطاقات والإعدادات',
    footerSlash: 'يفتح البحث أيضًا',
    shortcutsSwitch: 'اختصارات المفتاح الواحد',
    shortcutsSwitchTitle: 'اختصارات الحرف الواحد: / [ ] F L T',
    actionToggleTheme: 'تبديل الوضع الداكن',
    actionToggleThemeKeywords: 'مظهر سمة وضع داكن فاتح ليلي theme dark light mode',
    actionCopyLink: 'نسخ رابط هذه الصفحة',
    actionCopyLinkKeywords: 'نسخ رابط عنوان مشاركة copy link url share',
    actionShortcutsOn: 'تفعيل اختصارات المفتاح الواحد',
    actionShortcutsOff: 'إيقاف اختصارات المفتاح الواحد',
    actionShortcutsKeywords:
      'لوحة المفاتيح اختصارات مفاتيح مفتاح واحد keyboard shortcuts keys single',
  }),
  copy: Object.freeze({
    copy: 'نسخ إلى الحافظة',
    copied: 'تم النسخ!',
    copyCode: 'نسخ الشيفرة',
    copyLinkToSection: 'نسخ رابط القسم',
  }),
  demo: Object.freeze({
    viewsLabel: 'عرض المثال',
    preview: 'معاينة',
    widthsLabel: 'عرض المعاينة',
    widthFull: 'العرض الكامل',
    width480: 'بعرض 480 بكسل',
    width280: 'بعرض 280 بكسل',
    readoutFull: '100% × تلقائي',
    readout480: '480 × تلقائي',
    readout280: '280 × تلقائي',
    openInNewTab: 'فتح في علامة تبويب جديدة',
    frameTitle: ({ name }: { name: string }) => `مثال ${name}`,
    showCode: 'إظهار الشيفرة',
    hideCode: 'إخفاء الشيفرة',
    code: 'الشيفرة',
    loading: 'جارٍ تحميل المثال.',
    failed: 'لم يُحمَّل المثال.',
    openFrameInNewTab: 'افتحه في علامة تبويب جديدة',
    openFullscreenRoute: 'فتح المثال في علامة تبويب جديدة',
    fullscreen: 'ملء الشاشة',
    exitFullscreen: 'الخروج من ملء الشاشة',
    themePage: 'مظهر الصفحة',
    themeLabel: ({ current, next }: { current: string; next: string }) =>
      `مظهر المثال: ${current}. التبديل إلى ${next}`,
    themeTooltip: ({ current }: { current: string }) => `مظهر المثال: ${current}`,
  }),
  playground: Object.freeze({
    title: 'ساحة التجربة',
    reset: 'إعادة تعيين',
    recreate: 'إعادة الإنشاء',
    recreateHint: 'يعيد إنشاء المثال في كل مرة يتغير فيها أحد المدخلات',
    content: 'المحتوى',
    settings: 'الإعدادات',
    defaultValue: 'افتراضي',
    resetToDefault: 'إعادة التعيين إلى القيمة الافتراضية',
    addItem: 'إضافة عنصر',
    moveUp: 'نقل لأعلى',
    moveDown: 'نقل لأسفل',
    removeItem: 'إزالة',
    item: ({ index }: { index: number }) => `العنصر ${index}`,
    invalidJson: 'JSON غير صالح',
    frameTitle: ({ id, target }: { id: string; target: string }) => `ساحة التجربة ${id}: ${target}`,
    inPageControl: ({ input }: { input: string }) =>
      `تعمل ساحة التجربة هذه داخل الصفحة لأن عنصر التحكم الخاص بـ \`${input}\` لا يدعم ذلك.`,
    inPageValue: ({ input, reason }: { input: string; reason: string }) =>
      `تعمل ساحة التجربة هذه داخل الصفحة لأن قيمة \`${input}\` (${reason}) لا يمكن إرسالها إلى إطارها.`,
    inPageDefault: ({ input }: { input: string }) =>
      `تعمل ساحة التجربة هذه داخل الصفحة لأن القيمة الافتراضية لـ \`${input}\` لا يمكن إرسالها إلى إطارها.`,
    inPageTooLong:
      'تعمل ساحة التجربة هذه داخل الصفحة لأن قيمها أطول من أن يتسع لها عنوان URL لإطارها.',
    inPageSelector: ({ selector }: { selector: string }) =>
      `تعمل ساحة التجربة هذه داخل الصفحة لأن \`${selector}\` ليس محددًا لهدفها.`,
    inPageFrameError: ({ message }: { message: string }) =>
      `تعمل ساحة التجربة هذه داخل الصفحة لأن إطارها فشل: ${message}`,
    inPageFrameSilent: 'تعمل ساحة التجربة هذه داخل الصفحة لأن إطارها لم يُحمَّل.',
    missing: 'ساحة التجربة هذه غير موجودة.',
  }),
  navigation: Object.freeze({
    skipToContent: 'الانتقال إلى المحتوى',
    openMenu: 'فتح التنقل',
    closeMenu: 'إغلاق التنقل',
    sidebar: 'الوثائق',
    breadcrumbs: 'مسار التنقل',
    pages: 'الصفحة السابقة والتالية',
    previous: 'السابق',
    next: 'التالي',
  }),
  page: Object.freeze({
    copyLink: 'نسخ رابط هذه الصفحة',
    linkCopied: 'تم نسخ الرابط',
    copyLinkTooltip: 'نسخ الرابط',
    linkCopiedTooltip: 'تم النسخ',
    edit: 'تعديل هذه الصفحة',
    viewSource: 'عرض مصدر الصفحة',
    viewSourceTooltip: 'عرض المصدر',
    backTo: ({ title }: { title?: string }) => `العودة إلى ${title ?? 'الصفحة'}`,
    back: 'رجوع',
  }),
  content: Object.freeze({
    openImage: ({ alt }: { alt: string }) => `فتح الصورة: ${alt}`,
    // The count only picks the noun before the line numbers, so it follows the number of lines:
    // singular for one, dual for two, plural otherwise.
    codeLines: ({ count, ranges }: { count: number; ranges: string }) =>
      `${count === 1 ? 'السطر' : count === 2 ? 'السطران' : 'الأسطر'} ${ranges}`,
  }),
  toc: Object.freeze({
    symbol: 'الرمز',
    onThisPage: 'في هذه الصفحة',
    readingProgress: 'تقدم القراءة',
    backToTop: 'العودة إلى الأعلى',
    copyLink: 'نسخ الرابط',
    copied: 'تم النسخ',
    edit: 'تعديل هذه الصفحة',
  }),
  theme: Object.freeze({
    auto: 'تلقائي',
    light: 'فاتح',
    dark: 'داكن',
    label: ({ current, next }: { current: string; next: string }) =>
      `المظهر: ${current}. التبديل إلى ${next.toLowerCase()}`,
    tooltip: ({ current }: { current: string }) => `المظهر: ${current}`,
  }),
  apiList: Object.freeze({
    title: 'مراجع API',
    summary: ({ declarations, scopes }: { declarations: number; scopes: number }) =>
      `${declarations} ${plural(declarations, {
        zero: 'تصريح',
        one: 'تصريح',
        two: 'تصريحان',
        few: 'تصريحات',
        many: 'تصريحًا',
        other: 'تصريح',
      })} في ${scopes} ${plural(scopes, {
        zero: 'نطاق',
        one: 'نطاق',
        two: 'نطاقين',
        few: 'نطاقات',
        many: 'نطاقًا',
        other: 'نطاق',
      })}.`,
    filterPlaceholder: 'التصفية حسب الاسم',
    filterPlaceholderWithDescriptions: 'التصفية حسب الاسم أو الوصف',
    filterLabel: 'تصفية التصريحات حسب الاسم',
    filterLabelWithDescriptions: 'تصفية التصريحات حسب الاسم أو الوصف',
    groupBy: 'التجميع حسب',
    groupByKind: 'النوع',
    groupByScope: 'النطاق',
    kindsLabel: 'التصفية حسب النوع',
    allKinds: 'الكل',
    scopeNote: ({ scope }: { scope: string }) => `يُعرض النطاق «${scope}» فقط.`,
    showEveryScope: 'عرض كل النطاقات',
    noDescription: 'لا يوجد وصف',
    empty: 'لا توجد تصريحات مطابقة.',
    failed: 'تعذّر تحميل قائمة API.',
  }),
});
