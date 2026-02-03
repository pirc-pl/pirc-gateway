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

// Cache the result since it won't change during page lifetime
let emojiSupportCached = null;

// Per-emoji color rendering cache and shared canvas for fast testing
const emojiColorCache = new Map();
let _testCanvas = null;
let _testCtx = null;

// Returns true if this specific emoji text renders in color in the browser.
// Falls back to PNG if not (e.g. enclosed alphanumeric emoji not in color fonts).
function canRenderEmojiInColor(text) {
	if (!isEmojiSupported()) return false;
	if (emojiColorCache.has(text)) return emojiColorCache.get(text);

	if (!_testCanvas) {
		_testCanvas = document.createElement('canvas');
		_testCanvas.width = 24;
		_testCanvas.height = 24;
		_testCtx = _testCanvas.getContext('2d', { willReadFrequently: true });
		_testCtx.textBaseline = 'top';
		_testCtx.font = "20px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', 'EmojiOne Color', sans-serif";
	}

	_testCtx.clearRect(0, 0, 24, 24);
	_testCtx.fillText(text, 0, 0);

	const imageData = _testCtx.getImageData(0, 0, 24, 24).data;
	let result = false;
	for (let i = 0; i < imageData.length; i += 4) {
		const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2], a = imageData[i + 3];
		if (a > 0 && (r !== g || g !== b)) {
			result = true;
			break;
		}
	}

	emojiColorCache.set(text, result);
	return result;
}

function isEmojiSupported() {
	if (emojiSupportCached !== null) {
		return emojiSupportCached;
	}

	// Use canvas-based feature detection instead of user agent sniffing
	const canvas = document.createElement('canvas');
	if (!canvas.getContext) {
		emojiSupportCached = false;
		return false;
	}

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		emojiSupportCached = false;
		return false;
	}

	// Test with a color emoji that should render distinctly if supported
	// Using grinning face (U+1F600) - a common, well-supported emoji
	const testEmoji = '\u{1F600}';

	ctx.textBaseline = 'top';
	ctx.font = '32px Arial';
	ctx.fillText(testEmoji, 0, 0);

	// Check if the emoji rendered with color (not just a monochrome glyph or tofu box)
	// Color emoji will have pixels with different RGB values
	// Monochrome fallback or missing glyph will be grayscale or empty
	const imageData = ctx.getImageData(0, 0, 32, 32).data;

	let hasColor = false;
	let hasPixels = false;

	for (let i = 0; i < imageData.length; i += 4) {
		const r = imageData[i];
		const g = imageData[i + 1];
		const b = imageData[i + 2];
		const a = imageData[i + 3];

		if (a > 0) {
			hasPixels = true;
			// Check if pixel has color variance (not grayscale)
			// Grayscale has r===g===b, color emoji have variance
			if (r !== g || g !== b) {
				hasColor = true;
				break;
			}
		}
	}

	// Emoji is supported only if we have colored pixels (native color emoji).
	// Monochrome-only rendering (e.g. Symbola) does not qualify — the PNG
	// fallback produces better results than a monochrome glyph.
	emojiSupportCached = hasColor;
	return emojiSupportCached;
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
]);

function isModifiable(emoji) {
	return supported.has(emoji);
}

const ZERO_WIDTH_JOINER = '\u{200d}';
const VARIATION_16 = 0xfe0f;

function applyTone(sequence, tone) {
	const sequenceWithToneRemoved = removeTone(sequence);
	if (!isModifiable(sequenceWithToneRemoved)) return sequence;
	const modifier = toneModifier(tone);
	if (!modifier) return sequence;
	return sequenceWithToneRemoved
		.split(ZERO_WIDTH_JOINER)
		.map(emoji => (isModifiable(emoji) ? tint(emoji, modifier) : emoji))
		.join(ZERO_WIDTH_JOINER);
}

function applyTones(sequence, tones) {
	const sequenceWithToneRemoved = removeTone(sequence);
	if (!isModifiable(sequenceWithToneRemoved)) return sequence;
	const modifiers = tones.map(t => toneModifier(t));
	return sequenceWithToneRemoved
		.split(ZERO_WIDTH_JOINER)
		.map(emoji => {
			if (!isModifiable(emoji)) return emoji;
			const modifier = modifiers.shift();
			return modifier ? tint(emoji, modifier) : emoji;
		})
		.join(ZERO_WIDTH_JOINER);
}

function removeTone(emoji) {
	return [...emoji].filter(ch => !isTone(ch.codePointAt(0))).join('');
}

function tint(emoji, tone) {
	const points = [...emoji].map(p => p.codePointAt(0));
	if (points[1] && (isTone(points[1]) || points[1] === VARIATION_16)) {
		points[1] = tone;
	} else {
		points.splice(1, 0, tone);
	}
	return String.fromCodePoint(...points);
}

function isTone(point) {
	return point >= 0x1f3fb && point <= 0x1f3ff;
}

function toneModifier(id) {
	switch (id) {
		case 1:
			return 0x1f3fb;
		case 2:
			return 0x1f3fc;
		case 3:
			return 0x1f3fd;
		case 4:
			return 0x1f3fe;
		case 5:
			return 0x1f3ff;
		default:
			return null;
	}
}

class GEmojiElement extends HTMLElement {
	get image() {
		// Check if fallback image already exists since this node may have been
		// cloned from another node
		if (this.firstElementChild instanceof HTMLImageElement) {
			return this.firstElementChild;
		} else {
			return null;
		}
	}

	get tone() {
		return (this.getAttribute('tone') || '')
			.split(' ')
			.map(value => {
				const tone = parseInt(value, 10);
				return tone >= 0 && tone <= 5 ? tone : 0;
			})
			.join(' ');
	}

	set tone(modifiers) {
		this.setAttribute('tone', modifiers);
	}

	connectedCallback() {
		if (this.image === null && !canRenderEmojiInColor(this.textContent)) {
			const origEmoji = this.textContent;
			this.textContent = '';
			const image = emojiImage(this);
			image.src = this.getAttribute('fallback-src') || '';
			image.alt = origEmoji;
			this.appendChild(image);
		}

		if (this.hasAttribute('tone')) {
			updateTone(this);
		}
	}

	static get observedAttributes() {
		return ['tone'];
	}

	attributeChangedCallback(name) {
		switch (name) {
			case 'tone':
				updateTone(this);
				break;
		}
	}
}

function updateTone(el) {
	if (el.image) return;

	const tones = el.tone.split(' ').map(x => parseInt(x, 10));
	if (tones.length === 0) {
		el.textContent = removeTone(el.textContent);
	} else if (tones.length === 1) {
		const tone = tones[0];
		el.textContent = tone === 0 ? removeTone(el.textContent) : applyTone(el.textContent, tone);
	} else {
		el.textContent = applyTones(el.textContent, tones);
	}
}

// Generates an <img> child element for a <g-emoji> element.
//
// el - The <g-emoji> element.
//
// Returns an HTMLImageElement.
function emojiImage(el) {
	const image = document.createElement('img');
	image.className = 'emoji';
	image.alt = el.getAttribute('alias') || '';
	//  image.height = '20
	//  image.width = 20
	return image;
}

if ('customElements' in window) {
	if (!window.customElements.get('g-emoji')) {
	  window.GEmojiElement = GEmojiElement;
	  window.customElements.define('g-emoji', GEmojiElement);
	}
}

