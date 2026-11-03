import { lookupTranslation, type SupportedLanguage } from "./languages";

/**
 * Translates text that the screens render as hard-coded English, without touching React state.
 *
 * Rules (each one prevents a specific failure seen in the previous implementation):
 * - Exact matches only. The old version replaced substrings inside longer text, which could
 *   alter medicine names, dosages or user-entered data that happened to contain a common word.
 * - The original English is remembered per node and per attribute. When React writes a new
 *   value, that value becomes the new original. The old version kept the first value it saw,
 *   so an updated screen could show a stale translated value.
 * - Accessible names (`aria-label`, `title`, `alt`, `placeholder`) are translated along with
 *   visible text, so screen readers match the selected language.
 * - Input values, code, scripts and any subtree marked `translate="no"` or
 *   `data-no-translate` are never touched.
 * - Nothing is written to attributes or text that we did not change, so this does not create
 *   new mutations on each pass.
 */

export const TRANSLATABLE_ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"] as const;

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "SVG", "MATH"]);
const NO_TRANSLATE_SELECTOR = '[translate="no"],[data-no-translate]';

// DOM constants inlined so this module can be imported outside a browser (for tests).
const SHOW_ELEMENT = 0x1;
const SHOW_TEXT = 0x4;
const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;

interface WrittenState {
  original: string;
  written: string;
}

const textState = new WeakMap<Text, WrittenState>();
const attributeState = new WeakMap<Element, Map<string, WrittenState>>();

/** True when the text contains something a reader would read as words (not just digits, punctuation or units). */
export function hasTranslatableContent(text: string): boolean {
  return /[^\d\s!-/:-@[-`{-~]/.test(text);
}

/**
 * Returns the translated string with the original leading and trailing whitespace kept,
 * or null when there is no exact translation.
 */
export function translateExact(lang: SupportedLanguage, text: string): string | null {
  if (lang === "en" || !hasTranslatableContent(text)) return null;
  const translated = lookupTranslation(lang, text);
  if (translated === null) return null;
  const leading = /^\s*/.exec(text)?.[0] ?? "";
  const trailing = /\s*$/.exec(text)?.[0] ?? "";
  return leading + translated.trim() + trailing;
}

/**
 * Decides what a value should show. If the current value is the one we last wrote, the stored
 * original is authoritative. Anything else means the app changed the value, so it is the new original.
 */
function originalFor(state: WrittenState | undefined, current: string): string {
  return state && state.written === current ? state.original : current;
}

function desiredFor(lang: SupportedLanguage, original: string): string {
  if (lang === "en") return original;
  return translateExact(lang, original) ?? original;
}

export function applyToTextNode(node: Text, lang: SupportedLanguage): void {
  const current = node.nodeValue ?? "";
  const original = originalFor(textState.get(node), current);
  const desired = desiredFor(lang, original);
  if (desired !== current) node.nodeValue = desired;
  textState.set(node, { original, written: desired });
}

export function applyToAttribute(element: Element, attribute: string, lang: SupportedLanguage): void {
  const current = element.getAttribute(attribute);
  if (current === null) return;
  let perElement = attributeState.get(element);
  if (!perElement) {
    perElement = new Map();
    attributeState.set(element, perElement);
  }
  const original = originalFor(perElement.get(attribute), current);
  const desired = desiredFor(lang, original);
  if (desired !== current) element.setAttribute(attribute, desired);
  perElement.set(attribute, { original, written: desired });
}

function isSkippedElement(element: Element): boolean {
  return SKIPPED_TAGS.has(element.tagName.toUpperCase()) || element.matches(NO_TRANSLATE_SELECTOR);
}

/**
 * Walks `root` and applies the language to its text and accessible attributes.
 * Call again after DOM changes. Each call is idempotent.
 */
export function translateDocumentTree(root: Node, lang: SupportedLanguage): void {
  const doc = root.ownerDocument;
  if (!doc) return;
  if (root.nodeType === 1 && (root as Element).closest(NO_TRANSLATE_SELECTOR)) return;

  const texts: Text[] = [];
  const elements: Element[] = [];

  const walker = doc.createTreeWalker(root, SHOW_ELEMENT | SHOW_TEXT, {
    acceptNode(node: Node) {
      if (node.nodeType === 1) {
        return isSkippedElement(node as Element) ? FILTER_REJECT : FILTER_ACCEPT;
      }
      return FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 1) elements.push(node as Element);
    else if (node.nodeType === 3 && (node.nodeValue ?? "").trim()) texts.push(node as Text);
    node = walker.nextNode();
  }

  for (const element of elements) {
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      if (element.hasAttribute(attribute)) applyToAttribute(element, attribute, lang);
    }
  }
  for (const text of texts) applyToTextNode(text, lang);
}
