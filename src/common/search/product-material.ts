import { containsSearchPhrase, normalizeSearchText } from './search-text';

export type MaterialMatchLevel = 'full' | 'partial' | 'none';

export interface MaterialSearchIntent {
  code: string;
  aliases: readonly string[];
}

const MATERIAL_FAMILIES: readonly MaterialSearchIntent[] = [
  {
    code: 'WOOD',
    aliases: [
      'madera',
      'maderas',
      'wood',
      'wooden',
      'roble',
      'pino',
      'nogal',
      'cedro',
      'haya',
      'bambu',
    ],
  },
  {
    code: 'METAL',
    aliases: ['metal', 'acero', 'hierro', 'aluminio', 'cromado'],
  },
  {
    code: 'PLASTIC',
    aliases: ['plastico', 'polipropileno', 'acrilico'],
  },
  {
    code: 'FABRIC',
    aliases: ['tela', 'tejido', 'terciopelo', 'lino', 'tapizado'],
  },
  {
    code: 'LEATHER',
    aliases: ['cuero', 'piel', 'ecocuero'],
  },
  {
    code: 'GLASS',
    aliases: ['vidrio', 'cristal'],
  },
  {
    code: 'STONE',
    aliases: ['piedra', 'marmol', 'granito'],
  },
] as const;

const PARTIAL_COMPONENTS = [
  'estructura',
  'pata',
  'patas',
  'base',
  'marco',
  'detalle',
  'detalles',
  'brazo',
  'brazos',
  'asiento',
  'respaldo',
  'acabado',
  'revestimiento',
] as const;

export function detectMaterialSearchIntent(
  value: string,
): MaterialSearchIntent | undefined {
  const text = normalizeSearchText(value);
  return MATERIAL_FAMILIES.find((family) =>
    includesAnyAlias(text, family.aliases),
  );
}

export function classifyMaterialMatch(
  structuredMaterial: string | null | undefined,
  productText: string,
  intent: MaterialSearchIntent | undefined,
): MaterialMatchLevel {
  if (!intent) return 'none';

  const material = normalizeSearchText(structuredMaterial ?? '');
  const text = normalizeSearchText(productText);
  const materialHasTarget = includesAnyAlias(material, intent.aliases);
  const textHasTarget = includesAnyAlias(text, intent.aliases);

  if (!materialHasTarget && !textHasTarget) return 'none';

  const evidence = materialHasTarget ? material : text;
  if (
    includesOtherMaterial(evidence, intent.code) ||
    mentionsMaterialComponent(evidence, intent.aliases)
  ) {
    return 'partial';
  }

  // A different structured material plus textual evidence such as wooden legs
  // is necessarily a partial match, even if the component wording is unusual.
  if (material && !materialHasTarget && textHasTarget) return 'partial';

  return 'full';
}

function includesAnyAlias(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => containsSearchPhrase(text, alias));
}

function includesOtherMaterial(text: string, targetCode: string): boolean {
  return MATERIAL_FAMILIES.some(
    (family) =>
      family.code !== targetCode && includesAnyAlias(text, family.aliases),
  );
}

function mentionsMaterialComponent(
  text: string,
  aliases: readonly string[],
): boolean {
  return PARTIAL_COMPONENTS.some((component) =>
    aliases.some(
      (alias) =>
        containsSearchPhrase(text, `${component} de ${alias}`) ||
        containsSearchPhrase(text, `${component} en ${alias}`) ||
        containsSearchPhrase(text, `${component} ${alias}`),
    ),
  );
}
