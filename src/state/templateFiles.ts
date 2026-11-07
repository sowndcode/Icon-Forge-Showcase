// Sharing templates as files: export one to a .showcase-template.json, import it on another
// computer or project, duplicate it for a variant.

import { uid } from '../core/ids';
import type { StoredPreset } from '../core/types';
import { chooseSaveTarget, writeTarget } from '../services/native';
import { db } from '../services/db';
import type { TemplateData } from './generators';
import { refreshPresets } from './presets';
import { toast } from './ui';

const FORMAT = 'asset-forge-showcase-template';
const EXT = 'showcase-template.json';

interface TemplateFile {
  format: typeof FORMAT;
  version: 1;
  name: string;
  data: TemplateData;
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'template';

export async function exportTemplateFile(t: StoredPreset<TemplateData>) {
  // background images belong to the project they came from
  const page = structuredClone(t.data.page);
  if (page.background.image.assetId) page.background.image = { ...page.background.image, assetId: undefined };
  const file: TemplateFile = { format: FORMAT, version: 1, name: t.name, data: { page } };
  const name = `${safeName(t.name)}.${EXT}`;
  const target = await chooseSaveTarget(name, 'application/json', 'json', 'Showcase template');
  if (!target) return;
  await writeTarget(target, new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), name);
  toast(`Exported template “${t.name}”`, 'success');
}

function isTemplateFile(v: unknown): v is TemplateFile {
  const f = v as TemplateFile;
  return !!f && f.format === FORMAT && typeof f.name === 'string' && !!f.data?.page && Array.isArray(f.data.page.objects);
}

/** Ask for one or more template files and add them to “My templates”. */
export function importTemplateFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.multiple = true;
  input.onchange = async () => {
    let ok = 0;
    for (const f of Array.from(input.files ?? [])) {
      try {
        const v: unknown = JSON.parse(await f.text());
        if (!isTemplateFile(v)) throw new Error('not a template file');
        await db.putPreset({ id: uid('tpl'), kind: 'template', name: v.name, createdAt: Date.now(), data: v.data });
        ok++;
      } catch {
        toast(`“${f.name}” is not a Showcase template file`, 'error');
      }
    }
    if (ok) {
      await refreshPresets();
      toast(`Imported ${ok} template${ok > 1 ? 's' : ''}`, 'success');
    }
  };
  input.click();
}

export async function duplicateTemplate(t: StoredPreset<TemplateData>) {
  await db.putPreset({ ...structuredClone(t), id: uid('tpl'), name: `${t.name} copy`, createdAt: Date.now() });
  await refreshPresets();
}
