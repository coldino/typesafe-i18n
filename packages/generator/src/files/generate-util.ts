import type { Locale } from '../../../core/src/core'
import { writeFileIfContainsChanges } from '../file-utils'
import { GeneratorConfigWithDefaultValues } from '../generate-files'
import { sanitizeLocale } from '../generator-util'

const getLocalesTranslationRowAsync = (locale: Locale): string => {
	const sanitizedLocale = sanitizeLocale(locale)
	const needsEscaping = locale !== sanitizedLocale

	const wrappedLocale = needsEscaping ? `'${locale}'` : locale

	return `
	${wrappedLocale}: () => import('./${locale}'),`
}

const getAsyncCode = ({ locales }: GeneratorConfigWithDefaultValues) => {
	const localesTranslationLoaders = locales.map(getLocalesTranslationRowAsync).join('')

	return `
const localeTranslationLoaders = {${localesTranslationLoaders}
}

export const getTranslationForLocale = async (locale: Locales) => (await (localeTranslationLoaders[locale] || localeTranslationLoaders[baseLocale])()).default as Translation

export const i18nObject = (locale: Locales) => i18nObjectLoaderAsync<Locales, Translation, TranslationFunctions, Formatters>(locale, getTranslationForLocale, initFormatters)
`
}

const getLocalesTranslationRowSync = (locale: Locale, baseLocale: string): string => {
	const sanitizedLocale = sanitizeLocale(locale)
	const needsEscaping = locale !== sanitizedLocale

	const postfix =
		locale === baseLocale ? `: ${sanitizedLocale} as Translation` : needsEscaping ? `: ${sanitizedLocale}` : ''

	const wrappedLocale = needsEscaping ? `'${locale}'` : locale

	return `
	${wrappedLocale}${postfix},`
}

const getSyncCode = ({ baseLocale, locales }: GeneratorConfigWithDefaultValues) => {
	const localesImports = locales
		.map(
			(locale) => `
import ${sanitizeLocale(locale)} from './${locale}'`,
		)
		.join('')

	const localesTranslations = locales.map((locale) => getLocalesTranslationRowSync(locale, baseLocale)).join('')
	return `${localesImports}

const localeTranslations: LocaleTranslations<Locales, Translation> = {${localesTranslations}
}

export const getTranslationForLocale = (locale: Locales) => localeTranslations[locale] || localeTranslations[baseLocale]

export const i18nObject = (locale: Locales) => i18nObjectLoader<Locales, Translation, TranslationFunctions, Formatters>(locale, getTranslationForLocale, initFormatters)

export const i18n = () => initI18n<Locales, Translation, TranslationFunctions, Formatters>(getTranslationForLocale, initFormatters)
`
}

const getUtil = (config: GeneratorConfigWithDefaultValues, importType: string): string => {
	const {
		typesFileName: typesFile,
		formattersTemplateFileName: formattersTemplatePath,
		loadLocalesAsync,
		baseLocale,
		locales,
	} = config

	const dynamicImports = loadLocalesAsync
		? `import { i18nString as initI18nString, i18nObjectLoaderAsync } from 'typesafe-i18n'`
		: `${importType} { LocaleTranslations } from 'typesafe-i18n'
import { i18nString as initI18nString, i18nObjectLoader, i18n as initI18n } from 'typesafe-i18n'`

	const dynamicCode = loadLocalesAsync ? getAsyncCode(config) : getSyncCode(config)

	const localesEnum = `export const locales: Locales[] = [${locales.map(
		(locale) => `
	'${locale}'`,
	)}
]`

	return `// This types were auto-generated by 'typesafe-i18n'. Any manual changes will be overwritten.
/* eslint-disable */

${dynamicImports}
${importType} {
	Translation,
	TranslationFunctions,
	Formatters,
	Locales,
} from './${typesFile}'
import { LocaleDetector, detectLocale as detectLocaleFn } from 'typesafe-i18n/detectors'
import { initFormatters } from './${formattersTemplatePath}'

export const baseLocale: Locales = '${baseLocale}'

${localesEnum}
${dynamicCode}
export const i18nString = ${loadLocalesAsync ? 'async ' : ''
		}(locale: Locales) => initI18nString<Locales, Formatters>(locale, ${loadLocalesAsync ? 'await ' : ''
		}initFormatters(locale))

export const detectLocale = (...detectors: LocaleDetector[]) => detectLocaleFn<Locales>(baseLocale, locales, ...detectors)
`
}

export const generateUtil = async (config: GeneratorConfigWithDefaultValues, importType: string): Promise<void> => {
	const { outputPath, utilFileName: utilFile } = config

	const util = getUtil(config, importType)
	await writeFileIfContainsChanges(outputPath, utilFile, util)
}