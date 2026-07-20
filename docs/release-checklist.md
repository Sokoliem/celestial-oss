# Preview release checklist

This checklist applies to the allowlisted packages in
[`scripts/preview-packages.mjs`](../scripts/preview-packages.mjs). Preview
publishing is intentionally separate from ordinary pull-request CI.

## Prepare the release candidate

1. Confirm Node 22 and pnpm 9.15 or newer are active.
2. Confirm every donor import is recorded in
   [`scripts/donor-imports.json`](../scripts/donor-imports.json) with license,
   dependency, public-API, test, and security review receipts.
3. Add a changeset for every publishable package with a user-visible change.
   All package versions must remain prerelease versions.
4. Install exactly from the lockfile and run the complete release gate:

   ```bash
   pnpm install --frozen-lockfile
   pnpm run preview:validate
   pnpm run preview:publish:dry-run -- --tag preview
   ```

5. Open the release-candidate pull request against `master`. Do not publish
   until every Preview CI job is green on the final commit.

`preview:validate` checks the public dependency boundary, donor ledger,
licenses, formatting, builds, types, framework and demo tests, real PTY
scenarios, and ESM/CommonJS/type imports from freshly packed tarballs.

## Publish

1. Merge the green release candidate to `master`.
2. Run the **Publish preview** workflow once with `dry_run: true` and
   `npm_tag: preview`.
3. Review the printed package/version plan.
4. Re-run the workflow with `dry_run: false` from `master`.

The protected `npm` environment must provide `NPM_TOKEN`; the workflow also
requests an OIDC identity token for npm provenance. The publisher refuses the
`latest` tag, verifies registry authentication, and checks every package
version is absent from npm before it publishes the first package.

## Verify after publication

1. Confirm every allowlisted package has the expected `preview` dist-tag and
   provenance record.
2. In an empty directory, install `@celestial/core@preview`,
   `@celestial/ui@preview`, and `@celestial/test@preview`; verify both ESM and
   CommonJS imports.
3. Install and launch the Flight Deck demo from the tagged source commit.
4. Create the GitHub release notes from the merged changesets and link the
   exact validation commit.

If publication partially fails, stop. Do not move `latest` and do not retry
the same release plan blindly: determine which immutable versions reached npm,
record the incident, bump the affected prerelease versions, rerun the complete
gate, and publish a coherent replacement set. Prefer npm deprecation plus a
corrective release over unpublishing artifacts consumers may already use.
