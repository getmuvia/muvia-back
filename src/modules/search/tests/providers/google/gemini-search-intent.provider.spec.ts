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
  marketCode: 'BO',
  currencyCode: 'BOB',
  supportedCurrencies: ['BOB', 'USD'],
  categories: [{ code: 'DESK', label: 'Escritorio', aliases: ['desk'] }],
  selected: {},
};
const candidate = {
  cleanQuery: 'escritorio',
  terms: ['escritorio'],
  productTerms: ['escritorio', 'desk'],
  categoryCode: 'DESK',
  measurements: [
    { dimension: 'width', maximum: { valueCm: 180, inclusive: true } },
  ],
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
    expect(request.config.responseSchema.properties).toHaveProperty(
      'categoryCode.enum',
      ['DESK'],
    );
    expect(request.config.systemInstruction).toContain(
      'Never convert currencies',
    );
    expect(request.config).not.toHaveProperty('tools');
  });
  it.each([
    { ...candidate, categoryCode: 'INVENTED' },
    { ...candidate, cleanQuery: 42 },
    { ...candidate, terms: 'escritorio' },
    {
      ...candidate,
      measurements: [
        { dimension: 'width', maximum: { valueCm: -1, inclusive: true } },
      ],
    },
    {
      ...candidate,
      measurements: [candidate.measurements[0], candidate.measurements[0]],
    },
    { ...candidate, measurements: [{ dimension: 'depth' }] },
    {
      ...candidate,
      measurements: [
        {
          dimension: 'depth',
          minimum: { valueCm: 80, inclusive: true },
          maximum: { valueCm: 80, inclusive: false },
        },
      ],
    },
    { ...candidate, productTerms: ['a', 'b', 'c', 'd', 'e', 'f'] },
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

  it('preserves multiple dimensions, strict ranges and exact measurements', async () => {
    const measurements = [
      {
        dimension: 'width',
        minimum: { valueCm: 150, inclusive: true },
        maximum: { valueCm: 180, inclusive: false },
      },
      { dimension: 'depth', maximum: { valueCm: 80, inclusive: true } },
      {
        dimension: 'height',
        minimum: { valueCm: 75, inclusive: true },
        maximum: { valueCm: 75, inclusive: true },
      },
    ];
    generateContent.mockResolvedValue({
      text: JSON.stringify({ ...candidate, measurements }),
    });
    expect((await provider().interpret(input)).measurements).toEqual(
      measurements,
    );
  });

  it('shares interpretation calls in flight and reuses successful values', async () => {
    const interpreter = provider();
    await Promise.all([
      interpreter.interpret(input),
      interpreter.interpret(input),
    ]);
    await interpreter.interpret(input);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('separates market, locale, selected context and catalog vocabulary in the cache', async () => {
    const interpreter = provider();
    await interpreter.interpret(input);
    await interpreter.interpret({ ...input, locale: 'en-BO' });
    await interpreter.interpret({ ...input, marketCode: 'PE' });
    await interpreter.interpret({
      ...input,
      selected: { categoryCode: 'DESK' },
    });
    await interpreter.interpret({
      ...input,
      categories: [{ ...input.categories[0], aliases: ['escritorio', 'desk'] }],
    });
    expect(generateContent).toHaveBeenCalledTimes(5);
  });

  it('retries failed interpretations instead of caching fallback state', async () => {
    const interpreter = provider();
    generateContent.mockRejectedValueOnce(new Error('timeout'));
    await expect(interpreter.interpret(input)).rejects.toThrow('timeout');
    await expect(interpreter.interpret(input)).resolves.toEqual(candidate);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
