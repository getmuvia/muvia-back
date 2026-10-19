import { ConfigService } from '@nestjs/config';
import { GeminiSearchIntentProvider } from '../../../providers/google/gemini-search-intent.provider';

const generateContent = jest.fn();
jest.mock('@google/genai', () => {
  const actual =
    jest.requireActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class {
      models = {
        generateContent: (...args: unknown[]): unknown =>
          generateContent(...args),
      };
    },
  };
});
const input = {
  query: 'escritorio hasta 180 cm de ancho por menos de 500 dÃ³lares',
  locale: 'es-BO',
  currencyCode: 'BOB',
  supportedCurrencies: ['BOB', 'USD'],
  categories: [{ code: 'DESK', label: 'Escritorio', aliases: ['desk'] }],
};
const candidate = {
  cleanQuery: 'escritorio',
  terms: ['escritorio'],
  categoryCode: 'DESK',
  measurement: { dimension: 'width', maxDimensionCm: 180 },
  price: { currencyCode: 'USD', maximum: { amount: 500, inclusive: false } },
};
function provider() {
  const values = {
    GCP_PROJECT_ID: 'project',
    GCP_SEARCH_INTENT_LOCATION: 'global',
    GCP_SEARCH_INTENT_MODEL: 'gemini-3.1-flash-lite',
  };
  return new GeminiSearchIntentProvider({
    get: (key: string, fallback: unknown) =>
      values[key as keyof typeof values] ?? fallback,
    getOrThrow: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService);
}
describe('GeminiSearchIntentProvider', () => {
  beforeEach(() => {
    generateContent
      .mockReset()
      .mockResolvedValue({ text: JSON.stringify(candidate) });
  });
  it('extracts clean text and numeric constraints in one structured call without converting currencies', async () => {
    await expect(provider().interpret(input)).resolves.toEqual(candidate);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const calls = generateContent.mock.calls as unknown[][];
    const request = calls[0][0] as {
      contents: { text: string }[];
      config: {
        responseSchema: { properties: unknown };
        systemInstruction: string;
        responseMimeType: string;
      };
    };
    expect(JSON.parse(request.contents[0].text)).toEqual(input);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema.properties).toHaveProperty(
      'cleanQuery',
    );
    expect(request.config.responseSchema.properties).toHaveProperty('price');
    expect(request.config.systemInstruction).toContain(
      'Never convert currencies',
    );
    expect(request.config).not.toHaveProperty('tools');
  });
  it.each([
    { ...candidate, categoryCode: 'INVENTED' },
    { ...candidate, cleanQuery: 42 },
    { ...candidate, terms: 'escritorio' },
    { ...candidate, measurement: { dimension: 'width', maxDimensionCm: -1 } },
    {
      ...candidate,
      price: {
        currencyCode: 'USD',
        minimum: { amount: 1000, inclusive: true },
        maximum: { amount: 500, inclusive: true },
      },
    },
    { ...candidate, price: { currencyCode: 'USD', maximum: { amount: 500 } } },
    {
      ...candidate,
      price: {
        currencyCode: 'USD',
        maximum: { amount: 1.234, inclusive: true },
      },
    },
  ])('rejects invalid structured values: %j', async (value) => {
    generateContent.mockResolvedValue({ text: JSON.stringify(value) });
    await expect(provider().interpret(input)).rejects.toThrow();
  });
  it('preserves explicit unsupported currencies for backend policy validation', async () => {
    const value = {
      ...candidate,
      price: {
        currencyCode: 'CNY',
        maximum: { amount: 5000, inclusive: true },
      },
    };
    generateContent.mockResolvedValue({ text: JSON.stringify(value) });
    expect((await provider().interpret(input)).price?.currencyCode).toBe('CNY');
  });
  it.each(['', '{broken JSON'])(
    'rejects empty or malformed responses',
    async (text) => {
      generateContent.mockResolvedValue({ text });
      await expect(provider().interpret(input)).rejects.toThrow();
    },
  );
});
