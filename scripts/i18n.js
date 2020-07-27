//
// Supported languages - Russian and English
//
let supported_languages = ['ru', 'en'];

//
// Default language - Russian
//
let default_language = 'ru';

//
// Apply default language
//
setLang(default_language);


/**
 * Sets a page's language.
 *
 * @param {string} language - string identifier of desired language.
 *                            must be present in supported_languages.
 *                            Othervise default will be set.
 */
function setLang(language) {
  let found = supported_languages.indexOf(language) != -1;
  setLangStyles(found ? language : default_language);
}

/**
 * Constructs and applies language-specific styles
 * to current web-page
 *
 * @param {string} language - string identifier of desired language
 *                            or default one. At this point there is
 *                            at least one language in supported_languages
 *                            that is even with the desired one.
 */
function setLangStyles(language) {
  //
  // The key-idea is to hide tags with language
  // that differs from the desired one. To perform
  // this it is necessary to put all other languages
  // into a specific style.
  //
  
  let styles = supported_languages
    .filter((lang) => lang != language)
    .map((lang) => ':lang('+ lang +') { display: none; }')
    .join(' ');

  setLanguageStyles(styles);
}

/**
 * Sets language-specific style to current web-page
 *
 * @param {string} style - string representation of language-specific
 *                         style that is going to be set.
 */
function setLanguageStyles(style) {
  //
  // Trying to find existing tag and remove it if necessary
  //
  
  var elementId = '__current_lang_styles';
  var element = document.getElementById(elementId);
  if (element) {
    element.remove();
  }
  
  //
  // Creating a new style using passed text
  //
  
  let styleTag = document.createElement('style');
  styleTag.id = elementId;
  styleTag.type = 'text/css';

  if (styleTag.styleSheet) {
    styleTag.styleSheet.cssText = style;
  } else {
    styleTag.appendChild(document.createTextNode(style));
  }
  
  document.getElementsByTagName('head')[0].appendChild(styleTag);
}