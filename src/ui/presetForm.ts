// 预设编辑表单:书目级(整组直接编辑)与页面级(按组勾选覆盖)
import type { BookPreset } from '../types.js';
import { defaultPreset } from '../types.js';
import { el } from './dom.js';

interface FieldDef { key: string; label: string; type: 'check' | 'number'; min?: number; max?: number; step?: number; hint?: string; }
interface GroupDef { key: keyof BookPreset; label: string; fields: FieldDef[]; }

export const PRESET_SCHEMA: GroupDef[] = [
  {
    key: 'bgRemoval', label: '去底色 / 去污',
    fields: [
      { key: 'enabled', label: '启用', type: 'check' },
      { key: 'radius', label: '背景估计半径(px)', type: 'number', min: 20, max: 400, step: 10 },
      { key: 'strength', label: '强度(0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    key: 'showThrough', label: '透字压制(保笔画)',
    fields: [
      { key: 'enabled', label: '启用', type: 'check' },
      { key: 'darkThreshold', label: '笔画暗阈值', type: 'number', min: 40, max: 200, step: 5, hint: '低于此灰度视为正面笔画,原样保留' },
      { key: 'aggression', label: '力度(0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    key: 'dewarp', label: '几何校正',
    fields: [
      { key: 'enabled', label: '启用', type: 'check' },
      { key: 'deskew', label: '整体纠偏', type: 'check' },
      { key: 'straightenFrame', label: '版框拉直并裁齐', type: 'check' },
    ],
  },
  {
    key: 'columns', label: '版心 / 栏线',
    fields: [
      { key: 'enabled', label: '启用', type: 'check' },
      { key: 'split', label: '切出单栏图', type: 'check' },
      { key: 'minLineHeightFrac', label: '栏线最小长度占比', type: 'number', min: 0.3, max: 0.95, step: 0.05 },
    ],
  },
  {
    key: 'binarize', label: '二值化',
    fields: [
      { key: 'enabled', label: '启用', type: 'check' },
      { key: 'threshold', label: '阈值(0=自动)', type: 'number', min: 0, max: 255, step: 1 },
    ],
  },
];

function fieldInput(def: FieldDef, value: any, disabled: boolean, onInput: (v: any) => void): HTMLElement {
  if (def.type === 'check') {
    const input = el('input', { type: 'checkbox', disabled });
    input.checked = !!value;
    input.addEventListener('change', () => onInput(input.checked));
    return el('label', { class: 'field' }, input, def.label);
  }
  const input = el('input', {
    type: 'number', value: String(value),
    min: def.min, max: def.max, step: def.step, disabled,
  });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) v = 0;
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    input.value = String(v);
    onInput(v);
  });
  return el('label', { class: 'field', title: def.hint ?? '' }, def.label, input);
}

/** mode='preset': 编辑整份预设;mode='override': 基于 base 按组覆盖 */
export function presetEditor(
  mode: 'preset' | 'override',
  base: BookPreset,
  current: BookPreset | Partial<BookPreset> | null,
  onChange: (v: BookPreset | Partial<BookPreset> | null) => void,
): HTMLElement {
  const wrap = el('div');
  const state: Partial<BookPreset> = mode === 'preset'
    ? structuredClone(current ?? defaultPreset())
    : structuredClone(current ?? {});

  const emit = () => {
    if (mode === 'preset') onChange(structuredClone(state) as BookPreset);
    else onChange(Object.keys(state).length ? structuredClone(state) : null);
  };

  for (const g of PRESET_SCHEMA) {
    const overridden = mode === 'override' && g.key in state;
    const body = el('div');
    const group = el('fieldset', { class: 'preset-group' + (mode === 'override' && !overridden ? ' disabled' : '') });
    const legend = el('legend', { class: 'group-title' }, g.label);
    group.append(legend, body);

    const valuesFor = (): any => (state as any)[g.key] ?? (base as any)[g.key];

    const renderFields = () => {
      body.replaceChildren();
      const vals = valuesFor();
      for (const f of g.fields) {
        const disabled = mode === 'override' && !(g.key in state);
        body.append(fieldInput(f, vals[f.key], disabled, v => {
          if (mode === 'override' && !(g.key in state)) return;
          if (!(g.key in state)) (state as any)[g.key] = structuredClone((base as any)[g.key]);
          (state as any)[g.key][f.key] = v;
          emit();
        }));
        if (f.hint) body.append(el('span', { class: 'muted', style: 'font-size:12px' }, f.hint));
      }
    };

    if (mode === 'override') {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = overridden;
      cb.addEventListener('change', () => {
        if (cb.checked) (state as any)[g.key] = structuredClone((base as any)[g.key]);
        else delete (state as any)[g.key];
        group.classList.toggle('disabled', !cb.checked);
        renderFields();
        emit();
      });
      legend.prepend(cb, ' 覆盖 ');
    }
    renderFields();
    wrap.append(group);
  }
  return wrap;
}
