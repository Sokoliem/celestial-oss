export const requiredPreviewPackages = Object.freeze([
  '@celestial/atlas',
  '@celestial/corona',
  '@celestial/aurora',
  '@celestial/rosetta',
  '@celestial/nebula',
  '@celestial/gravity',
  '@celestial/nexus',
  '@celestial/core',
  '@celestial/ui',
  '@celestial/orbit',
  '@celestial/spectrum',
  '@celestial/mirage',
  '@celestial/nova',
  '@celestial/stellar',
  '@celestial/pulsar',
  '@celestial/test',
]);

export const conditionalPreviewPackages = Object.freeze(['@celestial/horizon']);

export const previewPackages = Object.freeze([...requiredPreviewPackages, ...conditionalPreviewPackages]);

export const previewPackageDirectories = Object.freeze({
  '@celestial/atlas': 'packages/atlas',
  '@celestial/corona': 'packages/corona',
  '@celestial/aurora': 'packages/aurora',
  '@celestial/rosetta': 'packages/rosetta',
  '@celestial/nebula': 'packages/nebula',
  '@celestial/gravity': 'packages/gravity',
  '@celestial/nexus': 'packages/nexus',
  '@celestial/core': 'packages/core',
  '@celestial/ui': 'packages/constellation',
  '@celestial/orbit': 'packages/orbit',
  '@celestial/spectrum': 'packages/spectrum',
  '@celestial/mirage': 'packages/mirage',
  '@celestial/nova': 'packages/nova',
  '@celestial/stellar': 'packages/stellar',
  '@celestial/pulsar': 'packages/pulsar',
  '@celestial/test': 'packages/telescope',
  '@celestial/horizon': 'packages/horizon',
});

export const previewPackageSet = new Set(previewPackages);

export const previewTurboFilters = Object.freeze(previewPackages.map((name) => `--filter=${name}`));

export const previewDemos = Object.freeze({
  '@celestial/demo-task-console': Object.freeze({
    directory: 'examples/task-console',
    runtimePackages: Object.freeze(['@celestial/core', '@celestial/ui']),
  }),
  '@celestial/demo-api-inspector': Object.freeze({
    directory: 'examples/api-inspector',
    runtimePackages: Object.freeze(['@celestial/core', '@celestial/ui']),
  }),
  '@celestial/demo-horizon-workbench': Object.freeze({
    directory: 'examples/horizon-workbench',
    runtimePackages: Object.freeze(['@celestial/core', '@celestial/ui', '@celestial/horizon']),
  }),
  '@celestial/demo-showcase': Object.freeze({
    directory: 'examples/celestial-showcase',
    runtimePackages: Object.freeze(['@celestial/core', '@celestial/ui', '@celestial/horizon']),
  }),
});

export const previewDemoNames = Object.freeze(Object.keys(previewDemos));
export const previewDemoDirectories = Object.freeze(Object.values(previewDemos).map(({ directory }) => directory));
