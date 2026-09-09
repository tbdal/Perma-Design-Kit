import type { Dict } from './core';

export const impressumDict: Dict = {
  imTitle: { de: 'Impressum', en: 'Legal Notice' },
  imTmgNote: { de: 'Angaben gemäß § 5 TMG', en: 'Information pursuant to Sec. 5 TMG (German Telemedia Act)' },

  imProviderTitle: { de: 'Anbieter', en: 'Provider' },
  imPlaceholderName: { de: '[Vor- und Nachname]', en: '[First and last name]' },
  imPlaceholderStreet: { de: '[Straße und Hausnummer]', en: '[Street and house number]' },
  imPlaceholderCity: { de: '[PLZ und Ort]', en: '[Postal code and city]' },
  imPlaceholderCountry: { de: '[Land]', en: '[Country]' },
  imContactTitle: { de: 'Kontakt', en: 'Contact' },
  imEmailLabel: { de: 'E-Mail:', en: 'Email:' },
  imPlaceholderEmail: { de: '[E-Mail-Adresse]', en: '[email address]' },
  imPhoneLabel: { de: 'Telefon (optional):', en: 'Phone (optional):' },
  imPlaceholderPhone: { de: '[Telefonnummer]', en: '[phone number]' },

  imContentResponsibleTitle: { de: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', en: 'Responsible for content pursuant to Sec. 18 (2) MStV (German Interstate Media Treaty)' },
  imContentResponsibleBody: { de: '[Vor- und Nachname], [Anschrift wie oben]', en: '[First and last name], [address as above]' },

  imLiabilityContentTitle: { de: 'Haftung für Inhalte', en: 'Liability for Content' },
  imLiabilityContentBody: {
    de: 'Die Inhalte dieser Seite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden. Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.',
    en: 'The content of this site has been created with the greatest possible care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content. As a service provider, we are responsible for our own content on these pages in accordance with Sec. 7 (1) TMG (German Telemedia Act). However, pursuant to Sec. 8 to 10 TMG, we as a service provider are not obligated to monitor transmitted or stored third-party information, or to investigate circumstances that indicate unlawful activity.',
  },

  imLiabilityLinksTitle: { de: 'Haftung für Links', en: 'Liability for Links' },
  imLiabilityLinksBody: {
    de: 'Die Anwendung verlinkt auf externe Quellen (u.a. Wikidata, PFAF, NaturaDB, Wikimedia Commons). Auf den Inhalt dieser externen Seiten haben wir keinen Einfluss. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.',
    en: 'The application links to external sources (including Wikidata, PFAF, NaturaDB, Wikimedia Commons). We have no influence on the content of these external sites. The respective provider or operator of the linked sites is always responsible for their content.',
  },

  imCopyrightTitle: { de: 'Urheberrecht', en: 'Copyright' },
  imCopyrightBody1: { de: 'Der Quellcode dieser Anwendung steht unter der im', en: 'The source code of this application is available under the license specified in the' },
  imCopyrightLink: { de: 'GitHub-Repository', en: 'GitHub repository' },
  imCopyrightBody2: {
    de: 'angegebenen Lizenz. Pflanzendaten stammen aus den jeweils genannten Quellen unter deren Lizenzbedingungen (Wikidata: CC0, PFAF: CC BY 4.0, Wikimedia Commons: jeweilige Bildlizenz).',
    en: '. Plant data comes from the respectively named sources under their license terms (Wikidata: CC0, PFAF: CC BY 4.0, Wikimedia Commons: respective image license).',
  },
};
