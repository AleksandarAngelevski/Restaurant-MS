import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import mk from './mk.json';

// gettext style: the English text is the key, so `t('New order')` works without an
// English resource file. To translate, add the same key to mk.json.
void i18n.use(initReactI18next).init({
  resources: { mk: { translation: mk } },
  lng: localStorage.getItem('rms.lang') || 'en',
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'en' | 'mk') {
  localStorage.setItem('rms.lang', lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
