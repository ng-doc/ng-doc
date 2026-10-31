import type { NgDocTexts } from '@ng-doc/app/interfaces';

/**
 * Picks the Ukrainian form of a word for a count.
 * @param count - The count.
 * @param forms - The form for each plural category of Ukrainian; `other` is for fractions.
 * @returns The form for `count`.
 */
function plural(count: number, forms: Record<'one' | 'few' | 'many' | 'other', string>): string {
  return forms[new Intl.PluralRules('uk').select(count) as keyof typeof forms] ?? forms.other;
}

/**
 * The Ukrainian texts of NgDoc, for `provideNgDocTexts(NG_DOC_TEXTS_UK)`. Pass your own changes
 * after them: `provideNgDocTexts(NG_DOC_TEXTS_UK, { search: { placeholder: '…' } })`.
 *
 * These translations welcome corrections: open an issue or a pull request at
 * https://github.com/ng-doc/ng-doc that names the text (its group and key) and your wording.
 */
export const NG_DOC_TEXTS_UK: NgDocTexts = Object.freeze({
  blockquote: Object.freeze({
    note: 'Примітка',
    warning: 'Попередження',
    alert: 'Увага',
    success: 'Успіх',
  }),
  pane: Object.freeze({
    resizer: 'Змінити розмір панелей',
  }),
  combobox: Object.freeze({
    placeholder: 'Виберіть значення',
  }),
  search: Object.freeze({
    placeholder: 'Пошук у документації…',
    label: ({ shortcut }: { shortcut: string }) => `Пошук (${shortcut})`,
    shortcutMac: '⌘K',
    shortcutOther: 'Ctrl K',
    resultGuides: 'Посібники',
    resultApi: 'API',
    resultUnknown: 'Невідомо',
    nothingFound: 'Нічого не знайдено…',
  }),
  searchPalette: Object.freeze({
    dialogLabel: 'Пошук',
    inputLabel: 'Пошук у документації',
    inputPlaceholder: 'Пошук у посібниках, API та діях…',
    scopesLabel: 'Область пошуку',
    scopeAll: 'Усі',
    scopeGuides: 'Посібники',
    scopeApi: 'API',
    scopeActions: 'Дії',
    resultsLabel: 'Результати',
    sectionTopMatches: 'Найкращі збіги',
    sectionGuides: 'Посібники',
    sectionApi: 'API',
    sectionActions: 'Дії',
    searching: 'Пошук…',
    failed: 'Помилка пошуку. Спробуйте ще раз.',
    failedStatus: 'Помилка пошуку.',
    noResults: ({ query }: { query: string }) => `Немає результатів для «${query}»`,
    typeToSearch: 'Почніть вводити для пошуку.',
    typeToSearchGuides: 'Почніть вводити для пошуку в посібниках.',
    typeToSearchApi: 'Почніть вводити для пошуку в API.',
    typeApi: 'API',
    typeGuide: 'Посібник',
    typeAction: 'Дія',
    actionKeepsOpen: 'Змінює налаштування, пошук залишається відкритим.',
    actionRunsImmediately: 'Виконується одразу.',
    shortcut: 'Комбінація клавіш',
    openSymbolPage: 'відкрити сторінку символу',
    open: 'відкрити',
    statusScope: ({ scope }: { scope: string }) => `Область «${scope}».`,
    statusResults: ({ scope, count }: { scope: string; count: number }) =>
      `Область «${scope}»: ${count} ${plural(count, {
        one: 'результат',
        few: 'результати',
        many: 'результатів',
        other: 'результату',
      })}.`,
    statusNoResults: ({ scope, query }: { scope: string; query: string }) =>
      `Область «${scope}»: немає результатів для «${query}».`,
    keyEscape: 'Esc',
    keyTab: 'Tab',
    footerNavigate: 'навігація',
    footerScopes: 'області та налаштування',
    footerSlash: 'також відкриває пошук',
    shortcutsSwitch: 'Комбінації з однієї клавіші',
    shortcutsSwitchTitle: 'Комбінації з одного символу: / [ ] F L T',
    actionToggleTheme: 'Перемкнути темну тему',
    actionToggleThemeKeywords: 'тема темна світла режим theme dark light mode',
    actionCopyLink: 'Копіювати посилання на цю сторінку',
    actionCopyLinkKeywords: 'копіювати посилання адреса поділитися copy link url share',
    actionShortcutsOn: 'Увімкнути комбінації з однієї клавіші',
    actionShortcutsOff: 'Вимкнути комбінації з однієї клавіші',
    actionShortcutsKeywords:
      'клавіатура комбінації клавіші гарячі одна keyboard shortcuts keys single',
  }),
  copy: Object.freeze({
    copy: 'Копіювати в буфер обміну',
    copied: 'Скопійовано!',
    copyCode: 'Копіювати код',
    copyLinkToSection: 'Копіювати посилання на розділ',
  }),
  demo: Object.freeze({
    viewsLabel: 'Вигляд демо',
    preview: 'Попередній перегляд',
    widthsLabel: 'Ширина попереднього перегляду',
    widthFull: 'Повна ширина',
    width480: 'Ширина 480 пікселів',
    width280: 'Ширина 280 пікселів',
    readoutFull: '100% × авто',
    readout480: '480 × авто',
    readout280: '280 × авто',
    openInNewTab: 'Відкрити в новій вкладці',
    frameTitle: ({ name }: { name: string }) => `Демо ${name}`,
    showCode: 'Показати код',
    hideCode: 'Сховати код',
    code: 'Код',
    loading: 'Завантаження демо.',
    failed: 'Демо не завантажилося.',
    openFrameInNewTab: 'Відкрити його в новій вкладці',
    openFullscreenRoute: 'Відкрити демо в новій вкладці',
    fullscreen: 'На весь екран',
    exitFullscreen: 'Вийти з повноекранного режиму',
    themePage: 'Тема сторінки',
    themeLabel: ({ current, next }: { current: string; next: string }) =>
      `Тема демо: ${current}. Перемкнути на: ${next}`,
    themeTooltip: ({ current }: { current: string }) => `Тема демо: ${current}`,
  }),
  playground: Object.freeze({
    title: 'Пісочниця',
    reset: 'Скинути',
    recreate: 'Перестворювати',
    recreateHint: 'Перестворює демо щоразу, коли змінюється один із вхідних параметрів',
    content: 'Вміст',
    settings: 'Налаштування',
    defaultValue: 'за замовчуванням',
    resetToDefault: 'Скинути до значення за замовчуванням',
    addItem: 'Додати елемент',
    moveUp: 'Перемістити вгору',
    moveDown: 'Перемістити вниз',
    removeItem: 'Видалити',
    item: ({ index }: { index: number }) => `Елемент ${index}`,
    invalidJson: 'Некоректний JSON',
    frameTitle: ({ id, target }: { id: string; target: string }) => `Пісочниця ${id}: ${target}`,
    inPageControl: ({ input }: { input: string }) =>
      `Ця пісочниця працює на сторінці, бо елемент керування \`${input}\` цього не підтримує.`,
    inPageValue: ({ input, reason }: { input: string; reason: string }) =>
      `Ця пісочниця працює на сторінці, бо значення \`${input}\` (${reason}) не можна передати в її фрейм.`,
    inPageDefault: ({ input }: { input: string }) =>
      `Ця пісочниця працює на сторінці, бо значення за замовчуванням \`${input}\` не можна передати в її фрейм.`,
    inPageTooLong: 'Ця пісочниця працює на сторінці, бо її значення задовгі для URL її фрейму.',
    inPageSelector: ({ selector }: { selector: string }) =>
      `Ця пісочниця працює на сторінці, бо \`${selector}\` не є селектором її цілі.`,
    inPageFrameError: ({ message }: { message: string }) =>
      `Ця пісочниця працює на сторінці, бо в її фреймі сталася помилка: ${message}`,
    inPageFrameSilent: 'Ця пісочниця працює на сторінці, бо її фрейм не завантажився.',
    missing: 'Такої пісочниці не існує.',
  }),
  navigation: Object.freeze({
    skipToContent: 'Перейти до вмісту',
    openMenu: 'Відкрити навігацію',
    closeMenu: 'Закрити навігацію',
    sidebar: 'Документація',
    breadcrumbs: 'Навігаційний ланцюжок',
    pages: 'Попередня та наступна сторінки',
    previous: 'Попередня',
    next: 'Наступна',
  }),
  page: Object.freeze({
    copyLink: 'Копіювати посилання на цю сторінку',
    linkCopied: 'Посилання скопійовано',
    copyLinkTooltip: 'Копіювати посилання',
    linkCopiedTooltip: 'Скопійовано',
    edit: 'Редагувати цю сторінку',
    viewSource: 'Переглянути вихідний код сторінки',
    viewSourceTooltip: 'Вихідний код',
    backTo: ({ title }: { title?: string }) => `Назад: ${title ?? 'до сторінки'}`,
    back: 'Назад',
  }),
  content: Object.freeze({
    openImage: ({ alt }: { alt: string }) => `Відкрити зображення: ${alt}`,
    // The count only picks the noun, which isn't governed by a numeral here: "Рядок 3",
    // "Рядки 1–21". So it's singular for exactly one line, as in English.
    codeLines: ({ count, ranges }: { count: number; ranges: string }) =>
      `${count === 1 ? 'Рядок' : 'Рядки'} ${ranges}`,
  }),
  toc: Object.freeze({
    symbol: 'Символ',
    onThisPage: 'На цій сторінці',
    readingProgress: 'Прогрес читання',
    backToTop: 'Угору',
    copyLink: 'Копіювати посилання',
    copied: 'Скопійовано',
    edit: 'Редагувати цю сторінку',
  }),
  theme: Object.freeze({
    auto: 'Авто',
    light: 'Світла',
    dark: 'Темна',
    label: ({ current, next }: { current: string; next: string }) =>
      `Тема: ${current}. Перемкнути на: ${next.toLowerCase()}`,
    tooltip: ({ current }: { current: string }) => `Тема: ${current}`,
  }),
  apiList: Object.freeze({
    title: 'Довідник API',
    summary: ({ declarations, scopes }: { declarations: number; scopes: number }) =>
      `${declarations} ${plural(declarations, {
        one: 'оголошення',
        few: 'оголошення',
        many: 'оголошень',
        other: 'оголошення',
      })} у ${scopes} ${plural(scopes, {
        one: 'області',
        few: 'областях',
        many: 'областях',
        other: 'області',
      })}.`,
    filterPlaceholder: 'Фільтр за назвою',
    filterPlaceholderWithDescriptions: 'Фільтр за назвою або описом',
    filterLabel: 'Фільтрувати оголошення за назвою',
    filterLabelWithDescriptions: 'Фільтрувати оголошення за назвою або описом',
    groupBy: 'Групувати за',
    groupByKind: 'Вид',
    groupByScope: 'Область',
    kindsLabel: 'Фільтр за видом',
    allKinds: 'Усі',
    scopeNote: ({ scope }: { scope: string }) => `Показано лише область «${scope}».`,
    showEveryScope: 'Показати всі області',
    noDescription: 'Немає опису',
    empty: 'Немає відповідних оголошень.',
    failed: 'Не вдалося завантажити список API.',
  }),
});
