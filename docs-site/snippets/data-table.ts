import { dataTable } from '@celestial/ui';

interface PackageRow {
  id: string;
  pkg: string;
  ver: string;
  status: string;
}

/**
 * dataTable is a full component descriptor with a keyboard cursor, sorting,
 * filtering, and optional column resizing. getKey gives each row a stable
 * identity for selection; the cursor starts on the first row and moves with
 * cursor-up/cursor-down messages.
 */
export const packageTable = dataTable<PackageRow>({
  columns: [
    { key: 'id', header: 'ID', width: 6 },
    { key: 'pkg', header: 'PACKAGE', width: 20 },
    { key: 'ver', header: 'VERSION', width: 18 },
    { key: 'status', header: 'STATUS', width: 12 },
  ],
  data: [
    { id: '01', pkg: '@celestial/core', ver: '0.1.0-preview.1', status: '✔ stable' },
    { id: '02', pkg: '@celestial/horizon', ver: '0.1.0-beta.1', status: '✦ beta' },
    { id: '03', pkg: '@celestial/pulsar', ver: '0.1.0-preview.1', status: '✔ stable' },
    { id: '04', pkg: '@celestial/stellar', ver: '0.1.0-preview.1', status: '✔ stable' },
  ],
  getKey: (row) => row.id,
});
