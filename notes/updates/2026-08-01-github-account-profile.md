# GitHub account profile

## Outcome

The Manage account Clerk modal now adds a GitHub profile page for users with a
linked GitHub account. Clerk exposes that link's stable numeric
`providerUserId`, which the browser uses to request the public profile from
`GET https://api.github.com/user/{id}` when the page mounts and whenever the
user retries a failed request.

The implementation does not use an OAuth token, request a new GitHub scope,
store a secret, or change the Convex schema. Users without a linked GitHub
account retain Clerk's standard account modal.

The profile lookup accepts only strictly numeric provider IDs and validates
unknown responses before rendering. Rendered profile and avatar URLs must use
HTTPS and the expected `github.com` and `avatars.githubusercontent.com` hosts.
Request failures show a user-facing error with a retry action.

## Affected areas

- `src/components/sidebar-user-menu.tsx` and
  `src/components/sidebar-user-menu.test.tsx`: discover the linked GitHub
  account and register the Clerk custom page only when a provider ID is
  available.
- `src/components/github-account-profile.tsx` and
  `src/components/github-account-profile.test.tsx`: render loading, public
  profile, failure, and retry states inside Clerk's custom page lifecycle.
- `src/lib/github-profile.ts` and `src/lib/github-profile.test.tsx`: fetch and
  strictly validate the public GitHub profile response, including numeric IDs,
  HTTPS URL host allowlists, and error mapping.

## Validation

- A live public GitHub request for sample user ID `583231` returned login
  `octocat`; the response used the expected `github.com` and
  `avatars.githubusercontent.com` hosts.
- 17 focused tests passed.
- Full test suite passed: 41 files and 184 tests.
- Type checking, scoped ESLint and Prettier checks, production build, and
  `git diff --check` passed.
- The production build retained the existing route-file warning.

## Known limitations

- Live signed-in rendering for the actual user's Clerk-linked account was not
  exercised in this turn.
- GitHub's unauthenticated public REST API allows 60 requests per hour per
  originating IP.
- Only public GitHub profile fields are shown.
