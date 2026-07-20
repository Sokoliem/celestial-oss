export const requiredPreviewPackages = Object.freeze([
  '@celestial/atlas',
  '@celestial/corona',
  '@celestial/aurora',
  '@celestial/nebula',
  '@celestial/gravity',
  '@celestial/nexus',
  '@celestial/core',
  '@celestial/ui',
  '@celestial/test',
]);

export const conditionalPreviewPackages = Object.freeze(['@celestial/horizon']);

export const previewPackages = Object.freeze([
  ...requiredPreviewPackages,
  ...conditionalPreviewPackages,
]);

export const previewPackageDirectories = Object.freeze({
  '@celestial/atlas': 'packages/atlas',
  '@celestial/corona': 'packages/corona',
  '@celestial/aurora': 'packages/aurora',
  '@celestial/nebula': 'packages/nebula',
  '@celestial/gravity': 'packages/gravity',
  '@celestial/nexus': 'packages/nexus',
  '@celestial/core': 'packages/core',
  '@celestial/ui': 'packages/constellation',
  '@celestial/test': 'packages/telescope',
  '@celestial/horizon': 'packages/horizon',
});

export const previewPackageSet = new Set(previewPackages);

export const previewTurboFilters = Object.freeze(previewPackages.map((name) => `--filter=${name}`));
