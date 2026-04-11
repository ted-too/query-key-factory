# Changesets

This repo uses Changesets to track package-facing changes before they are released from `main`.

Create a changeset for any change that should affect the published package version, then merge that work into `dev`.
When `dev` is merged into `main`, the release workflow versions the package, publishes to npm, tags the release, and creates the matching GitHub release.
