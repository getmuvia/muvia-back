import { buildStagingPrompt } from './staging-generation.prompt';

describe('buildStagingPrompt', () => {
    const prompt = buildStagingPrompt({
        analysis: {
            roomType: 'living room',
            style: 'contemporary',
            emptyAreas: ['near the window'],
            suggestedFurniture: ['floor lamp'],
            colorPalette: ['warm gray', 'oak'],
        },
        product: {
            title: 'Oak lounge chair',
            description: 'Natural oak frame with beige upholstery',
        },
    });

    it('preserves architecture while allowing the decoration to be redesigned', () => {
        expect(prompt).toContain("Preserve the room's architecture");
        expect(prompt).toContain('Wall colors and other non-structural decorative finishes may change');
        expect(prompt).toContain('retained, repositioned, replaced, or removed');
        expect(prompt).toContain('If the room is empty or incomplete');
    });

    it('makes the selected catalog product mandatory and visually faithful', () => {
        expect(prompt).toContain('IMAGE 2 is the selected catalog product');
        expect(prompt).toContain('Treat IMAGE 2 as the visual source of truth');
        expect(prompt).toContain('Do not substitute, merge, restyle, or redesign the product');
        expect(prompt).toContain('Oak lounge chair');
        expect(prompt).toContain('Natural oak frame with beige upholstery');
    });
});
