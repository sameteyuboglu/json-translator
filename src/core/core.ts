import { translate } from '@vitalets/google-translate-api';
import createHttpProxyAgent from 'http-proxy-agent';
import { LanguageCode, Sources } from '..';
import * as fs from 'fs/promises';
import { error, messages } from '../utils/console';
import { default_value, translation_value_limit } from '../utils/micro';
import axios from 'axios';
import * as ignorer from './ignorer';

export async function plaintranslate(
  word: string,
  from: LanguageCode,
  to: LanguageCode
): Promise<string> {
  let { word: ignored_word, db_map, sb_map } = ignorer.map(word);

  if (global.source == Sources.LibreTranslate) {
    let translatedWord = await translateWithLibre(ignored_word, from, to);
    translatedWord = ignorer.unMap(translatedWord, db_map, sb_map);
    return translatedWord;
  } else if (global.source == Sources.ArgosTranslate) {
    let translatedWord = await translateWithArgos(ignored_word, from, to);
    translatedWord = ignorer.unMap(translatedWord, db_map, sb_map);
    return translatedWord;
  } else {
    if (
      global.proxyList &&
      global.proxyList.length > 0 &&
      global.proxyIndex != -1
    ) {
      let proxy = global.proxyList[global.proxyIndex];

      if (proxy) {
        let agent;
        agent = createHttpProxyAgent(`http://${proxy}`);
        let translatedWord = await translateWithGoogle(ignored_word, from, to, {
          agent,
          timeout: 4000,
        });
        translatedWord = ignorer.unMap(translatedWord, db_map, sb_map);
        return translatedWord;
      } else {
        error('there is no new proxy');
        global.proxyIndex = -1;
        // TODO: translate without proxy
        let translatedWord = await translateWithGoogle(ignored_word, from, to);
        translatedWord = ignorer.unMap(translatedWord, db_map, sb_map);
        return translatedWord;
      }
    } else {
      // TODO: no proxy normal translate
      let translatedWord = await translateWithGoogle(ignored_word, from, to);
      translatedWord = ignorer.unMap(translatedWord, db_map, sb_map);
      return translatedWord;
    }
  }
}
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
async function translateWithLibre(
  word: string,
  from: LanguageCode,
  to: LanguageCode
) {
  let body = {
    q: word,
    source: from,
    target: to,
  };

  const { data } = await axios.post(
    'https://libretranslate.com/translate',
    body,
    {
      headers: {
        Origin: 'https://libretranslate.com',
      },
    }
  );

  global.totalTranslated = global.totalTranslated + 1;

  return capitalizeFirstLetter(data?.translatedText ? data?.translatedText : default_value);
}

async function translateWithArgos(
  word: string,
  from: LanguageCode,
  to: LanguageCode
) {
  let body = {
    q: word,
    source: from,
    target: to,
  };

  const { data } = await axios.post(
    'https://translate.argosopentech.com/translate',
    body,
    {
      headers: {
        Origin: 'https://translate.argosopentech.com',
        Referer: 'https://translate.argosopentech.com',
      },
    }
  );

  global.totalTranslated = global.totalTranslated + 1;

  return capitalizeFirstLetter(data?.translatedText ? data?.translatedText : default_value);
}

async function translateWithGoogle(
  word: string,
  from: LanguageCode,
  to: LanguageCode,
  options?: any
) {
  const { text } = await translate(safeValueTransition(word), {
    from: from,
    to: to,
    fetchOptions: options,
  });

  global.totalTranslated = global.totalTranslated + 1;

  return capitalizeFirstLetter(text);
}

export async function getFile(objectPath: string) {
  let json_file: any = undefined;

  await fs
    .readFile(objectPath, 'utf8')
    .then(data => {
      json_file = data;
    })
    .catch(_ => {
      json_file = undefined;
    });

  return json_file;
}

export function getRootFolder(path: string) {
  let arr = path.split('/');
  arr.pop();

  let root = arr.join('/');

  if (root == undefined || root == '') {
    root = './';
  }

  return root;
}

export async function saveFilePublic(path: string, data: any) {
  var json = JSON.stringify(data);

  await fs
    .writeFile(path, json, 'utf8')
    .then(_ => {})
    .catch(_ => {
      error(messages.file.cannot_save_file);
    });
}

export function safeValueTransition(value: string) {
  const value_safety: ValueSafety = valueIsSafe(value);

  if (value_safety.is_safe == true) {
    return value;
  }

  switch (value_safety.type) {
    case nonSafeTypes.null:
    case nonSafeTypes.undefined:
    case nonSafeTypes.empty:
      value = default_value;
      break;
    case nonSafeTypes.long:
      value = value.substring(0, translation_value_limit);
      break;
  }

  return capitalizeFirstLetter(value);
}

function valueIsSafe(value: string): ValueSafety {
  let result: ValueSafety = {
    is_safe: true,
    type: undefined,
  };

  if (value == undefined) {
    result.is_safe = false;
    result['type'] = nonSafeTypes.undefined;

    return result;
  }

  if (value == null) {
    result.is_safe = false;
    result['type'] = nonSafeTypes.null;

    return result;
  }

  if (value.length >= translation_value_limit) {
    result.is_safe = false;
    result['type'] = nonSafeTypes.long;

    return result;
  }

  if (value == '') {
    result.is_safe = false;
    result['type'] = nonSafeTypes.empty;

    return result;
  }

  return result;
}

interface ValueSafety {
  is_safe: boolean;
  type: nonSafeTypes | undefined;
}

enum nonSafeTypes {
  'long',
  'undefined',
  'null',
  'empty',
}
