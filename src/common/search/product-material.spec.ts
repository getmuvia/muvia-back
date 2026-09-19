import {
  classifyMaterialMatch,
  detectMaterialSearchIntent,
} from './product-material';

describe('product material search', () => {
  const woodIntent = detectMaterialSearchIntent('quiero una silla de madera');

  it('detects the requested material family', () => {
    expect(woodIntent).toMatchObject({ code: 'WOOD' });
  });

  it('classifies a product made from the requested material as a full match', () => {
    expect(
      classifyMaterialMatch('Madera maciza', 'Silla Toscana', woodIntent),
    ).toBe('full');
  });

  it('classifies mixed materials and wooden components as partial matches', () => {
    expect(
      classifyMaterialMatch('Madera y metal', 'Silla mixta', woodIntent),
    ).toBe('partial');
    expect(
      classifyMaterialMatch(
        'Tela',
        'Silla tapizada con patas de madera',
        woodIntent,
      ),
    ).toBe('partial');
  });

  it('classifies the same product type without wood as no material match', () => {
    expect(
      classifyMaterialMatch('Malla y metal', 'Silla ergonómica', woodIntent),
    ).toBe('none');
  });
});
