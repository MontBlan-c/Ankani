// ===== Minimal Romaji → Kana converter (WanaKana-lite) =====
// Converts romaji input to hiragana in real-time, similar to WaniKani's input.

const RomajiToKana = (() => {
  const HIRAGANA_MAP = {
    a:'あ',i:'い',u:'う',e:'え',o:'お',
    ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',
    sa:'さ',si:'し',shi:'し',su:'す',se:'せ',so:'そ',
    ta:'た',ti:'ち',chi:'ち',tu:'つ',tsu:'つ',te:'て',to:'と',
    na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
    ha:'は',hi:'ひ',hu:'ふ',fu:'ふ',he:'へ',ho:'ほ',
    ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',
    ya:'や',yu:'ゆ',yo:'よ',
    ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
    wa:'わ',wi:'ゐ',we:'ゑ',wo:'を',
    nn:'ん',n:'ん',
    ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',
    za:'ざ',zi:'じ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',
    da:'だ',di:'ぢ',du:'づ',de:'で',do:'ど',
    ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',
    pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',
    // Combo kana
    kya:'きゃ',kyi:'きぃ',kyu:'きゅ',kye:'きぇ',kyo:'きょ',
    sha:'しゃ',shi:'し',shu:'しゅ',she:'しぇ',sho:'しょ',
    sya:'しゃ',syi:'しぃ',syu:'しゅ',sye:'しぇ',syo:'しょ',
    cha:'ちゃ',chi:'ち',chu:'ちゅ',che:'ちぇ',cho:'ちょ',
    tya:'ちゃ',tyi:'ちぃ',tyu:'ちゅ',tye:'ちぇ',tyo:'ちょ',
    nya:'にゃ',nyi:'にぃ',nyu:'にゅ',nye:'にぇ',nyo:'にょ',
    hya:'ひゃ',hyi:'ひぃ',hyu:'ひゅ',hye:'ひぇ',hyo:'ひょ',
    mya:'みゃ',myi:'みぃ',myu:'みゅ',mye:'みぇ',myo:'みょ',
    rya:'りゃ',ryi:'りぃ',ryu:'りゅ',rye:'りぇ',ryo:'りょ',
    gya:'ぎゃ',gyi:'ぎぃ',gyu:'ぎゅ',gye:'ぎぇ',gyo:'ぎょ',
    ja:'じゃ',ju:'じゅ',je:'じぇ',jo:'じょ',
    jya:'じゃ',jyi:'じぃ',jyu:'じゅ',jye:'じぇ',jyo:'じょ',
    bya:'びゃ',byi:'びぃ',byu:'びゅ',bye:'びぇ',byo:'びょ',
    pya:'ぴゃ',pyi:'ぴぃ',pyu:'ぴゅ',pye:'ぴぇ',pyo:'ぴょ',
    // Small kana
    xa:'ぁ',xi:'ぃ',xu:'ぅ',xe:'ぇ',xo:'ぉ',
    xya:'ゃ',xyu:'ゅ',xyo:'ょ',
    xtu:'っ',xtsu:'っ',
    // Punctuation
    '-':'ー','.':'。',',':'、','?':'？','!':'！',
  };

  // Double consonant → っ + consonant
  const DOUBLE_CONSONANTS = 'bcdfghjklmpqrstvwxyz';

  // Check if a string could be the start of a valid romaji sequence
  function couldBeRomaji(s) {
    if (s.length === 0) return true;
    for (const key of Object.keys(HIRAGANA_MAP)) {
      if (key.startsWith(s)) return true;
    }
    // Double consonant check
    if (s.length === 1 && DOUBLE_CONSONANTS.includes(s)) return true;
    if (s.length >= 2 && s[0] === s[1] && DOUBLE_CONSONANTS.includes(s[0])) {
      const rest = s.slice(1);
      for (const key of Object.keys(HIRAGANA_MAP)) {
        if (key.startsWith(rest)) return true;
      }
    }
    return false;
  }

  function convert(text) {
    let result = '';
    let buffer = '';
    const lower = text.toLowerCase();

    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      buffer += ch;

      // Handle 'n' specially: convert to ん if followed by non-vowel/non-y/non-n
      if (buffer === 'n' && i + 1 < lower.length) {
        const next = lower[i + 1];
        if (!'aiueony'.includes(next)) {
          result += 'ん';
          buffer = '';
          continue;
        }
      }

      // Double consonant → っ
      if (buffer.length === 2 && buffer[0] === buffer[1] && DOUBLE_CONSONANTS.includes(buffer[0]) && buffer[0] !== 'n') {
        result += 'っ';
        buffer = buffer[1];
        continue;
      }

      // Check for exact match
      if (HIRAGANA_MAP[buffer]) {
        // But check if a longer match is possible
        if (i + 1 < lower.length && couldBeRomaji(buffer + lower[i + 1])) {
          continue;
        }
        result += HIRAGANA_MAP[buffer];
        buffer = '';
        continue;
      }

      // If buffer can't start any valid romaji, flush first char as-is
      if (!couldBeRomaji(buffer)) {
        result += buffer[0];
        // Re-process from second char
        i -= (buffer.length - 1);
        buffer = '';
        continue;
      }
    }

    // Handle remaining buffer
    if (buffer === 'n') {
      result += 'ん';
    } else if (HIRAGANA_MAP[buffer]) {
      result += HIRAGANA_MAP[buffer];
    } else {
      result += buffer;
    }

    return result;
  }

  // Bind to an input element for real-time conversion
  let boundInputs = new Map();

  function bind(input) {
    if (boundInputs.has(input)) return;

    const handler = (e) => {
      const el = e.target;
      const pos = el.selectionStart;
      const original = el.value;
      const converted = convert(original);

      if (converted !== original) {
        el.value = converted;
        // Adjust cursor position
        const diff = original.length - converted.length;
        const newPos = Math.max(0, pos - diff);
        el.setSelectionRange(newPos, newPos);
      }
    };

    input.addEventListener('input', handler);
    boundInputs.set(input, handler);
  }

  function unbind(input) {
    const handler = boundInputs.get(input);
    if (handler) {
      input.removeEventListener('input', handler);
      boundInputs.delete(input);
    }
  }

  return { convert, bind, unbind };
})();
