import type { NgDocTexts } from '@ng-doc/app/interfaces';

/**
 * Picks the Russian form of a word for a count.
 * @param count - The count.
 * @param forms - The form for each plural category of Russian; `other` is for fractions.
 * @returns The form for `count`.
 */
function plural(count: number, forms: Record<'one' | 'few' | 'many' | 'other', string>): string {
  return forms[new Intl.PluralRules('ru').select(count) as keyof typeof forms] ?? forms.other;
}

/**
 * The Russian texts of NgDoc, for `provideNgDocTexts(NG_DOC_TEXTS_RU)`. Pass your own changes after
 * them: `provideNgDocTexts(NG_DOC_TEXTS_RU, { search: { placeholder: '…' } })`.
 *
 * These translations welcome corrections: open an issue or a pull request at
 * https://github.com/ng-doc/ng-doc that names the text (its group and key) and your wording.
 */
export const NG_DOC_TEXTS_RU: NgDocTexts = Object.freeze({
  blockquote: Object.freeze({
    note: 'Примечание',
    warning: 'Предупреждение',
    alert: 'Внимание',
    success: 'Успех',
  }),
  pane: Object.freeze({
    resizer: 'Изменить размер панелей',
  }),
  combobox: Object.freeze({
    placeholder: 'Выберите значение',
  }),
  search: Object.freeze({
    placeholder: 'Поиск по документации…',
    label: ({ shortcut }: { shortcut: string }) => `Поиск (${shortcut})`,
    shortcutMac: '⌘K',
    shortcutOther: 'Ctrl K',
    resultGuides: 'Руководства',
    resultApi: 'API',
    resultUnknown: 'Неизвестно',
    nothingFound: 'Ничего не найдено…',
  }),
  searchPalette: Object.freeze({
    dialogLabel: 'Поиск',
    inputLabel: 'Поиск по документации',
    inputPlaceholder: 'Поиск по руководствам, API и действиям…',
    scopesLabel: 'Область поиска',
    scopeAll: 'Все',
    scopeGuides: 'Руководства',
    scopeApi: 'API',
    scopeActions: 'Действия',
    resultsLabel: 'Результаты',
    sectionTopMatches: 'Лучшие совпадения',
    sectionGuides: 'Руководства',
    sectionApi: 'API',
    sectionActions: 'Действия',
    searching: 'Поиск…',
    failed: 'Ошибка поиска. Попробуйте ещё раз.',
    failedStatus: 'Ошибка поиска.',
    noResults: ({ query }: { query: string }) => `Нет результатов по запросу «${query}»`,
    typeToSearch: 'Начните вводить для поиска.',
    typeToSearchGuides: 'Начните вводить для поиска по руководствам.',
    typeToSearchApi: 'Начните вводить для поиска по API.',
    typeApi: 'API',
    typeGuide: 'Руководство',
    typeAction: 'Действие',
    actionKeepsOpen: 'Меняет настройку, поиск остаётся открытым.',
    actionRunsImmediately: 'Выполняется сразу.',
    shortcut: 'Сочетание клавиш',
    openSymbolPage: 'открыть страницу символа',
    open: 'открыть',
    statusScope: ({ scope }: { scope: string }) => `Область «${scope}».`,
    statusResults: ({ scope, count }: { scope: string; count: number }) =>
      `Область «${scope}»: ${count} ${plural(count, {
        one: 'результат',
        few: 'результата',
        many: 'результатов',
        other: 'результата',
      })}.`,
    statusNoResults: ({ scope, query }: { scope: string; query: string }) =>
      `Область «${scope}»: нет результатов по запросу «${query}».`,
    keyEscape: 'Esc',
    keyTab: 'Tab',
    footerNavigate: 'навигация',
    footerScopes: 'области и настройки',
    footerSlash: 'тоже открывает поиск',
    shortcutsSwitch: 'Сочетания из одной клавиши',
    shortcutsSwitchTitle: 'Сочетания из одного символа: / [ ] F L T',
    actionToggleTheme: 'Переключить тёмную тему',
    actionToggleThemeKeywords: 'тема тёмная темная светлая режим theme dark light mode',
    actionCopyLink: 'Копировать ссылку на эту страницу',
    actionCopyLinkKeywords: 'копировать ссылка ссылку адрес поделиться copy link url share',
    actionShortcutsOn: 'Включить сочетания из одной клавиши',
    actionShortcutsOff: 'Выключить сочетания из одной клавиши',
    actionShortcutsKeywords:
      'клавиатура сочетания клавиши горячие одна keyboard shortcuts keys single',
  }),
  copy: Object.freeze({
    copy: 'Копировать в буфер обмена',
    copied: 'Скопировано!',
    copyCode: 'Копировать код',
    copyLinkToSection: 'Копировать ссылку на раздел',
  }),
  demo: Object.freeze({
    viewsLabel: 'Вид демо',
    preview: 'Предпросмотр',
    widthsLabel: 'Ширина предпросмотра',
    widthFull: 'Полная ширина',
    width480: 'Ширина 480 пикселей',
    width280: 'Ширина 280 пикселей',
    readoutFull: '100% × авто',
    readout480: '480 × авто',
    readout280: '280 × авто',
    openInNewTab: 'Открыть в новой вкладке',
    frameTitle: ({ name }: { name: string }) => `Демо ${name}`,
    showCode: 'Показать код',
    hideCode: 'Скрыть код',
    code: 'Код',
    loading: 'Загрузка демо.',
    failed: 'Демо не загрузилось.',
    openFrameInNewTab: 'Открыть его в новой вкладке',
    openFullscreenRoute: 'Открыть демо в новой вкладке',
    fullscreen: 'Во весь экран',
    exitFullscreen: 'Выйти из полноэкранного режима',
    themePage: 'Тема страницы',
    themeLabel: ({ current, next }: { current: string; next: string }) =>
      `Тема демо: ${current}. Переключить на: ${next}`,
    themeTooltip: ({ current }: { current: string }) => `Тема демо: ${current}`,
  }),
  playground: Object.freeze({
    title: 'Песочница',
    reset: 'Сбросить',
    recreate: 'Пересоздавать',
    recreateHint: 'Пересоздаёт демо при каждом изменении одного из входных параметров',
    content: 'Содержимое',
    settings: 'Настройки',
    defaultValue: 'по умолчанию',
    resetToDefault: 'Сбросить до значения по умолчанию',
    addItem: 'Добавить элемент',
    moveUp: 'Переместить вверх',
    moveDown: 'Переместить вниз',
    removeItem: 'Удалить',
    item: ({ index }: { index: number }) => `Элемент ${index}`,
    invalidJson: 'Некорректный JSON',
    frameTitle: ({ id, target }: { id: string; target: string }) => `Песочница ${id}: ${target}`,
    inPageControl: ({ input }: { input: string }) =>
      `Эта песочница работает на странице, потому что элемент управления \`${input}\` это не поддерживает.`,
    inPageValue: ({ input, reason }: { input: string; reason: string }) =>
      `Эта песочница работает на странице, потому что значение \`${input}\` (${reason}) нельзя передать в её фрейм.`,
    inPageDefault: ({ input }: { input: string }) =>
      `Эта песочница работает на странице, потому что значение по умолчанию \`${input}\` нельзя передать в её фрейм.`,
    inPageTooLong:
      'Эта песочница работает на странице, потому что её значения слишком длинные для URL её фрейма.',
    inPageSelector: ({ selector }: { selector: string }) =>
      `Эта песочница работает на странице, потому что \`${selector}\` не является селектором её цели.`,
    inPageFrameError: ({ message }: { message: string }) =>
      `Эта песочница работает на странице, потому что в её фрейме произошла ошибка: ${message}`,
    inPageFrameSilent: 'Эта песочница работает на странице, потому что её фрейм не загрузился.',
    missing: 'Такой песочницы нет.',
  }),
  navigation: Object.freeze({
    skipToContent: 'Перейти к содержимому',
    openMenu: 'Открыть навигацию',
    closeMenu: 'Закрыть навигацию',
    sidebar: 'Документация',
    breadcrumbs: 'Навигационная цепочка',
    pages: 'Предыдущая и следующая страницы',
    previous: 'Предыдущая',
    next: 'Следующая',
  }),
  page: Object.freeze({
    copyLink: 'Копировать ссылку на эту страницу',
    linkCopied: 'Ссылка скопирована',
    copyLinkTooltip: 'Копировать ссылку',
    linkCopiedTooltip: 'Скопировано',
    edit: 'Редактировать эту страницу',
    viewSource: 'Посмотреть исходный код страницы',
    viewSourceTooltip: 'Исходный код',
    backTo: ({ title }: { title?: string }) => `Назад: ${title ?? 'к странице'}`,
    back: 'Назад',
  }),
  content: Object.freeze({
    openImage: ({ alt }: { alt: string }) => `Открыть изображение: ${alt}`,
    // The count only picks the noun, which isn't governed by a numeral here: "Строка 3",
    // "Строки 1–21". So it's singular for exactly one line, as in English.
    codeLines: ({ count, ranges }: { count: number; ranges: string }) =>
      `${count === 1 ? 'Строка' : 'Строки'} ${ranges}`,
  }),
  toc: Object.freeze({
    symbol: 'Символ',
    onThisPage: 'На этой странице',
    readingProgress: 'Прогресс чтения',
    backToTop: 'Наверх',
    copyLink: 'Копировать ссылку',
    copied: 'Скопировано',
    edit: 'Редактировать эту страницу',
  }),
  theme: Object.freeze({
    auto: 'Авто',
    light: 'Светлая',
    dark: 'Тёмная',
    label: ({ current, next }: { current: string; next: string }) =>
      `Тема: ${current}. Переключить на: ${next.toLowerCase()}`,
    tooltip: ({ current }: { current: string }) => `Тема: ${current}`,
  }),
  apiList: Object.freeze({
    title: 'Справочник API',
    summary: ({ declarations, scopes }: { declarations: number; scopes: number }) =>
      `${declarations} ${plural(declarations, {
        one: 'объявление',
        few: 'объявления',
        many: 'объявлений',
        other: 'объявления',
      })} в ${scopes} ${plural(scopes, {
        one: 'области',
        few: 'областях',
        many: 'областях',
        other: 'области',
      })}.`,
    filterPlaceholder: 'Фильтр по имени',
    filterPlaceholderWithDescriptions: 'Фильтр по имени или описанию',
    filterLabel: 'Фильтровать объявления по имени',
    filterLabelWithDescriptions: 'Фильтровать объявления по имени или описанию',
    groupBy: 'Группировать по',
    groupByKind: 'Вид',
    groupByScope: 'Область',
    kindsLabel: 'Фильтр по виду',
    allKinds: 'Все',
    scopeNote: ({ scope }: { scope: string }) => `Показана только область «${scope}».`,
    showEveryScope: 'Показать все области',
    noDescription: 'Нет описания',
    empty: 'Нет подходящих объявлений.',
    failed: 'Не удалось загрузить список API.',
  }),
});
