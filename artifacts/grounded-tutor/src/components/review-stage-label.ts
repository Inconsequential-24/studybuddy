const stageLabels: Record<string, string> = {
  'validating-pdf': 'Checking the PDF',
  'extracting-text': 'Reading PDF text',
  'rendering-pages': 'Preparing page images',
  'comparing-claims': 'Comparing claims with sources',
  'validating-findings': 'Checking cited evidence',
  'rendering-page': 'Preparing a page image',
  'mapping-page': 'Reading the page and mapping concepts',
  'checking-citations': 'Verifying page citations',
};

export function reviewStageLabel(stage: string): string {
  return stageLabels[stage] ?? 'Reviewing PDF';
}
