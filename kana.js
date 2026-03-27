// ===== Minimal Romaji → Kana converter (WanaKana-lite) =====
// Tracks raw romaji input separately and displays converted kana.

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
    nn:'ん',
    ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',
    za:'ざ',zi:'じ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',
    da:'だ',di:'ぢ',du:'づ',de:'で',do:'ど',
    ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',
    pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',
    kya:'きゃ',kyi:'きぃ',kyu:'きゅ',kye:'きぇ',kyo:'きょ',
    sha:'しゃ',shu:'しゅ',she:'しぇ',sho:'しょ',
    sya:'しゃ',syi:'しぃ',syu:'しゅ',sye:'しぇ',syo:'しょ',
    cha:'ちゃ',chu:'ちゅ',che:'ちぇ',cho:'ちょ',
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
    xa:'ぁ',xi:'ぃ',xu:'ぅ',xe:'ぇ',xo:'ぉ',
    xya:'ゃ',xyu:'ゅ',xyo:'ょ',
    xtu:'っ',xtsu:'っ',
    '-':'ー','.':'。',',':'、','?':'？','!':'！',
  };

  const DOUBLE_CONSONANTS = 'bcdfghjklmpqrstvwxyz';

  function couldBeRomaji(s) {
    if (s.length === 0) return true;
    for (const key of Object.keys(HIRAGANA_MAP)) {
      if (key.startsWith(s)) return true;
    }
    if (s.length === 1 && DOUBLE_CONSONANTS.includes(s)) return true;
    if (s.length >= 2 && s[0] === s[1] && DOUBLE_CONSONANTS.includes(s[0])) {
      const rest = s.slice(1);
      for (const key of Object.keys(HIRAGANA_MAP)) {
        if (key.startsWith(rest)) return true;
      }
    }
    return false;
  }

  // Convert a pure romaji string to kana. Returns { result, pending }
  // where pending is unconverted trailing romaji (like 'n' or 'sh')
  function convert(romaji) {
    let result = '';
    let buffer = '';
    const lower = romaji.toLowerCase();

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
        if (i + 1 < lower.length && couldBeRomaji(buffer + lower[i + 1])) {
          continue;
        }
        result += HIRAGANA_MAP[buffer];
        buffer = '';
        continue;
      }

      // If buffer can't start any valid romaji, flush first char
      if (!couldBeRomaji(buffer)) {
        if (buffer[0] === 'n' && buffer.length > 1 && !'aiueoy'.includes(buffer[1])) {
          result += 'ん';
        } else {
          result += buffer[0];
        }
        i -= (buffer.length - 1);
        buffer = '';
        continue;
      }
    }

    return { result, pending: buffer };
  }

  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }

  let mode = 'hiragana';
  function setMode(m) { mode = m; }
  function getMode() { return mode; }

  // Each bound input tracks its own raw romaji buffer
  let boundInputs = new Map();

  function bind(input) {
    if (boundInputs.has(input)) return;

    const state = { romaji: '' };

    const onKeydown = (e) => {
      // Handle backspace on the romaji buffer
      if (e.key === 'Backspace') {
        if (state.romaji.length > 0) {
          e.preventDefault();
          state.romaji = state.romaji.slice(0, -1);
          updateDisplay(input, state);
        }
        return;
      }

      // Let non-character keys pass through
      if (e.key.length !== 1) return;

      // Only intercept printable characters
      e.preventDefault();
      state.romaji += e.key;
      updateDisplay(input, state);
    };

    const onCompositionstart = () => {
      // If browser IME activates, disable our handler
    };

    input.addEventListener('keydown', onKeydown);
    boundInputs.set(input, { onKeydown, state });
  }

  function updateDisplay(input, state) {
    const { result, pending } = convert(state.romaji);
    let display = result + pending;
    if (mode === 'katakana') {
      display = toKatakana(result) + pending;
    }
    input.value = display;
    input.setSelectionRange(display.length, display.length);
  }

  function unbind(input) {
    const data = boundInputs.get(input);
    if (data) {
      input.removeEventListener('keydown', data.onKeydown);
      boundInputs.delete(input);
    }
  }

  function resetInput(input) {
    const data = boundInputs.get(input);
    if (data) {
      data.state.romaji = '';
    }
  }

  return { convert, toKatakana, bind, unbind, setMode, getMode, resetInput };
})();
