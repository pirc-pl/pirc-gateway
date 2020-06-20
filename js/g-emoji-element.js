/*
 * This code is derived from https://github.com/github/g-emoji-element
 * 2020 k4be, PIRC.pl Team
 * Note: I don't know how does this exactly work. Don't ask me.
 * 
 * The original license text:
 * 
 * Copyright (c) 2018 GitHub, Inc.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

function isEmojiSupported() {
  const onWindows7 = /\bWindows NT 6.1\b/.test(navigator.userAgent)
  const onWindows8 = /\bWindows NT 6.2\b/.test(navigator.userAgent)
  const onWindows81 = /\bWindows NT 6.3\b/.test(navigator.userAgent)
  const onFreeBSD = /\bFreeBSD\b/.test(navigator.userAgent)
  const onLinux = /\bLinux\b/.test(navigator.userAgent)

  return !(onWindows7 || onWindows8 || onWindows81 || onLinux || onFreeBSD)
}

const supported = new Set([
  '👋',
  '🤚',
  '🖐️',
  '✋',
  '🖖',
  '👌',
  '🤏',
  '✌️',
  '🤞',
  '🤟',
  '🤘',
  '🤙',
  '👈',
  '👉',
  '👆',
  '🖕',
  '👇',
  '☝️',
  '👍',
  '👎',
  '✊',
  '👊',
  '🤛',
  '🤜',
  '👏',
  '🙌',
  '👐',
  '🤲',
  '🙏',
  '✍️',
  '💅',
  '🤳',
  '💪',
  '🦵',
  '🦶',
  '👂',
  '🦻',
  '👃',
  '👶',
  '🧒',
  '👦',
  '👧',
  '🧑',
  '👱',
  '👨',
  '🧔',
  '👱‍♂️',
  '👨‍🦰',
  '👨‍🦱',
  '👨‍🦳',
  '👨‍🦲',
  '👩',
  '👱‍♀️',
  '👩‍🦰',
  '👩‍🦱',
  '👩‍🦳',
  '👩‍🦲',
  '🧓',
  '👴',
  '👵',
  '🙍',
  '🙍‍♂️',
  '🙍‍♀️',
  '🙎',
  '🙎‍♂️',
  '🙎‍♀️',
  '🙅',
  '🙅‍♂️',
  '🙅‍♀️',
  '🙆',
  '🙆‍♂️',
  '🙆‍♀️',
  '💁',
  '💁‍♂️',
  '💁‍♀️',
  '🙋',
  '🙋‍♂️',
  '🙋‍♀️',
  '🧏',
  '🧏‍♂️',
  '🧏‍♀️',
  '🙇',
  '🙇‍♂️',
  '🙇‍♀️',
  '🤦',
  '🤦‍♂️',
  '🤦‍♀️',
  '🤷',
  '🤷‍♂️',
  '🤷‍♀️',
  '👨‍⚕️',
  '👩‍⚕️',
  '👨‍🎓',
  '👩‍🎓',
  '👨‍🏫',
  '👩‍🏫',
  '👨‍⚖️',
  '👩‍⚖️',
  '👨‍🌾',
  '👩‍🌾',
  '👨‍🍳',
  '👩‍🍳',
  '👨‍🔧',
  '👩‍🔧',
  '👨‍🏭',
  '👩‍🏭',
  '👨‍💼',
  '👩‍💼',
  '👨‍🔬',
  '👩‍🔬',
  '👨‍💻',
  '👩‍💻',
  '👨‍🎤',
  '👩‍🎤',
  '👨‍🎨',
  '👩‍🎨',
  '👨‍✈️',
  '👩‍✈️',
  '👨‍🚀',
  '👩‍🚀',
  '👨‍🚒',
  '👩‍🚒',
  '👮',
  '👮‍♂️',
  '👮‍♀️',
  '🕵️',
  '🕵️‍♂️',
  '🕵️‍♀️',
  '💂',
  '💂‍♂️',
  '💂‍♀️',
  '👷',
  '👷‍♂️',
  '👷‍♀️',
  '🤴',
  '👸',
  '👳',
  '👳‍♂️',
  '👳‍♀️',
  '👲',
  '🧕',
  '🤵',
  '👰',
  '🤰',
  '🤱',
  '👼',
  '🎅',
  '🤶',
  '🦸',
  '🦸‍♂️',
  '🦸‍♀️',
  '🦹',
  '🦹‍♂️',
  '🦹‍♀️',
  '🧙',
  '🧙‍♂️',
  '🧙‍♀️',
  '🧚',
  '🧚‍♂️',
  '🧚‍♀️',
  '🧛',
  '🧛‍♂️',
  '🧛‍♀️',
  '🧜',
  '🧜‍♂️',
  '🧜‍♀️',
  '🧝',
  '🧝‍♂️',
  '🧝‍♀️',
  '💆',
  '💆‍♂️',
  '💆‍♀️',
  '💇',
  '💇‍♂️',
  '💇‍♀️',
  '🚶',
  '🚶‍♂️',
  '🚶‍♀️',
  '🧍',
  '🧍‍♂️',
  '🧍‍♀️',
  '🧎',
  '🧎‍♂️',
  '🧎‍♀️',
  '👨‍🦯',
  '👩‍🦯',
  '👨‍🦼',
  '👩‍🦼',
  '👨‍🦽',
  '👩‍🦽',
  '🏃',
  '🏃‍♂️',
  '🏃‍♀️',
  '💃',
  '🕺',
  '🕴️',
  '🧖',
  '🧖‍♂️',
  '🧖‍♀️',
  '🧗',
  '🧗‍♂️',
  '🧗‍♀️',
  '🏇',
  '🏂',
  '🏌️',
  '🏌️‍♂️',
  '🏌️‍♀️',
  '🏄',
  '🏄‍♂️',
  '🏄‍♀️',
  '🚣',
  '🚣‍♂️',
  '🚣‍♀️',
  '🏊',
  '🏊‍♂️',
  '🏊‍♀️',
  '⛹️',
  '⛹️‍♂️',
  '⛹️‍♀️',
  '🏋️',
  '🏋️‍♂️',
  '🏋️‍♀️',
  '🚴',
  '🚴‍♂️',
  '🚴‍♀️',
  '🚵',
  '🚵‍♂️',
  '🚵‍♀️',
  '🤸',
  '🤸‍♂️',
  '🤸‍♀️',
  '🤽',
  '🤽‍♂️',
  '🤽‍♀️',
  '🤾',
  '🤾‍♂️',
  '🤾‍♀️',
  '🤹',
  '🤹‍♂️',
  '🤹‍♀️',
  '🧘',
  '🧘‍♂️',
  '🧘‍♀️',
  '🛀',
  '🛌',
  '🧑‍🤝‍🧑',
  '👭',
  '👫',
  '👬'
])

function isModifiable(emoji) {
  return supported.has(emoji)
}

const ZERO_WIDTH_JOINER = '\u{200d}'
const VARIATION_16 = 0xfe0f

function applyTone(sequence, tone) {
  const sequenceWithToneRemoved = removeTone(sequence)
  if (!isModifiable(sequenceWithToneRemoved)) return sequence
  const modifier = toneModifier(tone)
  if (!modifier) return sequence
  return sequenceWithToneRemoved
    .split(ZERO_WIDTH_JOINER)
    .map(emoji => (isModifiable(emoji) ? tint(emoji, modifier) : emoji))
    .join(ZERO_WIDTH_JOINER)
}

function applyTones(sequence, tones) {
  const sequenceWithToneRemoved = removeTone(sequence)
  if (!isModifiable(sequenceWithToneRemoved)) return sequence
  const modifiers = tones.map(t => toneModifier(t))
  return sequenceWithToneRemoved
    .split(ZERO_WIDTH_JOINER)
    .map(emoji => {
      if (!isModifiable(emoji)) return emoji
      const modifier = modifiers.shift()
      return modifier ? tint(emoji, modifier) : emoji
    })
    .join(ZERO_WIDTH_JOINER)
}

function removeTone(emoji) {
  return [...emoji].filter(ch => !isTone(ch.codePointAt(0))).join('')
}

function tint(emoji, tone) {
  const points = [...emoji].map(p => p.codePointAt(0))
  if (points[1] && (isTone(points[1]) || points[1] === VARIATION_16)) {
    points[1] = tone
  } else {
    points.splice(1, 0, tone)
  }
  return String.fromCodePoint(...points)
}

function isTone(point) {
  return point >= 0x1f3fb && point <= 0x1f3ff
}

function toneModifier(id) {
  switch (id) {
    case 1:
      return 0x1f3fb
    case 2:
      return 0x1f3fc
    case 3:
      return 0x1f3fd
    case 4:
      return 0x1f3fe
    case 5:
      return 0x1f3ff
    default:
      return null
  }
}

class GEmojiElement extends HTMLElement {
  get image() {
    // Check if fallback image already exists since this node may have been
    // cloned from another node
    if (this.firstElementChild instanceof HTMLImageElement) {
      return this.firstElementChild
    } else {
      return null
    }
  }

  get tone() {
    return (this.getAttribute('tone') || '')
      .split(' ')
      .map(value => {
        const tone = parseInt(value, 10)
        return tone >= 0 && tone <= 5 ? tone : 0
      })
      .join(' ')
  }

  set tone(modifiers) {
    this.setAttribute('tone', modifiers)
  }

  connectedCallback() {
    if (this.image === null && !isEmojiSupported()) {
      const origEmoji = this.textContent;
      this.textContent = ''
      const image = emojiImage(this)
      image.src = this.getAttribute('fallback-src') || ''
      image.alt = origEmoji;
      this.appendChild(image)
    }

    if (this.hasAttribute('tone')) {
      updateTone(this)
    }
  }

  static get observedAttributes() {
    return ['tone']
  }

  attributeChangedCallback(name) {
    switch (name) {
      case 'tone':
        updateTone(this)
        break
    }
  }
}

function updateTone(el) {
  if (el.image) return

  const tones = el.tone.split(' ').map(x => parseInt(x, 10))
  if (tones.length === 0) {
    el.textContent = removeTone(el.textContent)
  } else if (tones.length === 1) {
    const tone = tones[0]
    el.textContent = tone === 0 ? removeTone(el.textContent) : applyTone(el.textContent, tone)
  } else {
    el.textContent = applyTones(el.textContent, tones)
  }
}

// Generates an <img> child element for a <g-emoji> element.
//
// el - The <g-emoji> element.
//
// Returns an HTMLImageElement.
function emojiImage(el) {
  const image = document.createElement('img')
  image.className = 'emoji'
  image.alt = el.getAttribute('alias') || ''
//  image.height = '20
//  image.width = 20
  return image
}

if('customElements' in window){
	if (!window.customElements.get('g-emoji')) {
	  window.GEmojiElement = GEmojiElement
	  window.customElements.define('g-emoji', GEmojiElement)
	}
}

