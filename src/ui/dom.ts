// 极简 DOM 构造助手
type Attrs = Record<string, string | number | boolean | ((ev: any) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' && (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement)) (e as any).value = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    e.append(c as Node | string);
  }
  return e;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function modal(content: HTMLElement, onClose?: () => void): HTMLElement {
  const mask = el('div', { class: 'modal-mask' });
  const box = el('div', { class: 'modal' }, content);
  mask.append(box);
  mask.addEventListener('mousedown', ev => {
    if (ev.target === mask) { mask.remove(); onClose?.(); }
  });
  document.body.append(mask);
  return mask;
}
